import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { FileKind } from '@prisma/client';
import {
  MAX_UPLOAD_BYTES,
  SENSITIVE_FILE_KINDS,
  type CreateUploadInput,
  type UploadTicket,
} from '@jiko/shared';
import { randomUUID } from 'node:crypto';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { AppException } from '../../common/http/app-exception';
import type { AuthUser, RequestContext } from '../../common/http/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JobAccessService } from '../jobs/job-access.service';
import { STORAGE_DRIVER, type StorageDriver } from '../storage/storage.driver';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const ARTISAN_SITE_KINDS: FileKind[] = ['JOB_PHOTO_BEFORE', 'JOB_PHOTO_AFTER', 'MATERIALS_RECEIPT'];
const MAX_PENDING_UPLOADS_PER_HOUR = 30;

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: JobAccessService,
    private readonly audit: AuditService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private bucketFor(kind: FileKind) {
    return SENSITIVE_FILE_KINDS.includes(kind)
      ? this.env.S3_BUCKET_PRIVATE
      : this.env.S3_BUCKET_JOBS;
  }

  private async assertCanUpload(user: AuthUser, input: CreateUploadInput) {
    const deny = (msg: string) => new AppException(HttpStatus.FORBIDDEN, 'UPLOAD_NOT_ALLOWED', msg);
    if (input.kind === 'JOB_REQUEST_PHOTO' && !input.jobId) return; // attached when the job is created
    if (!input.jobId) throw deny('This upload must belong to a job');

    const viewer = await this.access.resolve(user, input.jobId);
    if (!viewer) throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Job not found');

    if (input.kind === 'JOB_REQUEST_PHOTO') {
      if (
        viewer.role !== 'client' ||
        !['PENDING_ASSIGNMENT', 'ASSIGNED', 'ACCEPTED', 'QUOTED'].includes(viewer.jobStatus)
      ) {
        throw deny('Photos can only be added by the client before a quote is approved');
      }
    } else if (ARTISAN_SITE_KINDS.includes(input.kind)) {
      if (viewer.role !== 'artisan' || viewer.assignmentStatus !== 'ACCEPTED')
        throw deny('Only the assigned artisan can add site photos');
      if (!['PAID', 'IN_PROGRESS', 'DISPUTED'].includes(viewer.jobStatus))
        throw deny('Site photos can be added once the job is paid');
    } else if (input.kind === 'MESSAGE_ATTACHMENT') {
      if (viewer.role === 'artisan' && viewer.assignmentStatus !== 'ACCEPTED')
        throw deny('Accept the job to chat');
    }
  }

  async createUpload(user: AuthUser, input: CreateUploadInput): Promise<UploadTicket> {
    await this.assertCanUpload(user, input);
    const pending = await this.prisma.file.count({
      where: {
        ownerId: user.id,
        uploadedAt: null,
        createdAt: { gte: new Date(Date.now() - 3_600_000) },
      },
    });
    if (pending >= MAX_PENDING_UPLOADS_PER_HOUR) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'TOO_MANY_UPLOADS',
        'Too many uploads. Try again later.',
      );
    }

    const kind = input.kind as FileKind;
    const id = randomUUID();
    const now = new Date();
    const key = `${kind.toLowerCase()}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${EXT[input.mimeType]}`;
    const bucket = this.bucketFor(kind);
    const ttl = 600;
    const presigned = await this.storage.presignUpload({
      bucket,
      key,
      mimeType: input.mimeType,
      maxBytes: MAX_UPLOAD_BYTES,
      expiresInSeconds: ttl,
    });

    const file = await this.prisma.file.create({
      data: {
        id,
        ownerId: user.id,
        kind,
        sensitivity: SENSITIVE_FILE_KINDS.includes(kind) ? 'SENSITIVE' : 'STANDARD',
        bucket,
        storageKey: key,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        jobId: input.kind === 'MESSAGE_ATTACHMENT' ? null : (input.jobId ?? null),
      },
    });
    return {
      fileId: file.id,
      method: 'POST',
      url: presigned.url,
      fields: presigned.fields,
      expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
    };
  }

  /** Called by the client after the direct upload; verifies the object really exists. */
  async complete(user: AuthUser, fileId: string) {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.ownerId !== user.id)
      throw new AppException(HttpStatus.NOT_FOUND, 'FILE_NOT_FOUND', 'File not found');
    if (file.uploadedAt) return { id: file.id, kind: file.kind, sizeBytes: file.sizeBytes };
    const obj = await this.storage.head(file.bucket, file.storageKey);
    if (!obj)
      throw new AppException(HttpStatus.CONFLICT, 'UPLOAD_NOT_FOUND', 'Upload not received yet');
    if (
      obj.sizeBytes > MAX_UPLOAD_BYTES ||
      (obj.contentType && obj.contentType !== file.mimeType)
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'UPLOAD_REJECTED',
        'Uploaded file does not match what was requested',
      );
    }
    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: { uploadedAt: new Date(), sizeBytes: obj.sizeBytes },
    });
    return { id: updated.id, kind: updated.kind, sizeBytes: updated.sizeBytes };
  }

  /** Short-lived URL to view a file. Sensitive files: admins only, and every view is audited. */
  async viewUrl(
    user: AuthUser,
    fileId: string,
    ctx: RequestContext,
  ): Promise<{ url: string; expiresAt: string }> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    const notFound = () =>
      new AppException(HttpStatus.NOT_FOUND, 'FILE_NOT_FOUND', 'File not found');
    if (!file?.uploadedAt) throw notFound();

    if (file.sensitivity === 'SENSITIVE') {
      if (!user.roles.includes('ADMIN')) throw notFound();
      await this.audit.record({
        actor: user,
        action: 'file.view',
        entityType: 'File',
        entityId: file.id,
        after: { kind: file.kind },
        ctx,
      });
    } else if (file.ownerId !== user.id) {
      const jobId =
        file.jobId ??
        (file.messageId
          ? (
              await this.prisma.message.findUnique({
                where: { id: file.messageId },
                select: { jobId: true },
              })
            )?.jobId
          : null);
      const viewer = jobId ? await this.access.resolve(user, jobId) : null;
      if (!viewer) throw notFound();
      if (
        viewer.role === 'artisan' &&
        viewer.assignmentStatus === 'OFFERED' &&
        file.kind !== 'JOB_REQUEST_PHOTO'
      )
        throw notFound();
    }
    return this.sign(file.bucket, file.storageKey);
  }

  async sign(bucket: string, key: string) {
    const ttl = this.env.SIGNED_URL_TTL_SECONDS;
    return {
      url: await this.storage.signedGetUrl(bucket, key, ttl),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }
}
