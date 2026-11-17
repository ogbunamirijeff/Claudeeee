import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  availableJobActions,
  isPrePayment,
  lagosDateString,
  maskPhone,
  type CreateJobInput,
  type JobActor,
  type JobCardView,
  type JobView,
  type QuoteView,
} from '@jiko/shared';
import { AppException } from '../../common/http/app-exception';
import type { AuthUser, RequestContext } from '../../common/http/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { JobAccessService, type JobViewer } from './job-access.service';
import { JobTransitionsService } from './job-transitions.service';

const MAX_DAYS_AHEAD = 30;

const jobInclude = {
  trade: true,
  area: true,
  client: { select: { id: true, name: true, phone: true } },
  files: { where: { uploadedAt: { not: null }, messageId: null }, orderBy: { createdAt: 'asc' } },
  statusEvents: { orderBy: { createdAt: 'asc' } },
  assignments: {
    where: { status: { in: ['OFFERED', 'ACCEPTED'] } },
    include: { artisan: { include: { user: { select: { phone: true, name: true } } } } },
  },
  quotes: {
    where: { status: { not: 'SUPERSEDED' } },
    orderBy: { version: 'desc' },
    take: 1,
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  },
} satisfies Prisma.JobRequestInclude;
type JobWithAll = Prisma.JobRequestGetPayload<{ include: typeof jobInclude }>;

const firstName = (n: string | null) => (n ? n.trim().split(/\s+/)[0]! : null);

export function toQuoteView(q: JobWithAll['quotes'][number], withSplit: boolean): QuoteView {
  return {
    id: q.id,
    version: q.version,
    status: q.status,
    reviewStatus: q.reviewStatus,
    reviewNote: q.reviewNote,
    labourKobo: q.labourKobo,
    materialsKobo: q.materialsKobo,
    totalKobo: q.totalKobo,
    items: q.items.map((i) => ({
      kind: i.kind,
      description: i.description,
      quantity: i.quantity,
      unitPriceKobo: i.unitPriceKobo,
      totalKobo: i.totalKobo,
    })),
    notes: q.notes,
    rejectionReason: q.rejectionReason,
    submittedAt: q.submittedAt.toISOString(),
    ...(withSplit
      ? {
          split: {
            commissionKobo: q.commissionKobo,
            commissionFromMaterialsKobo: q.commissionFromMaterialsKobo,
            artisanPayoutKobo: q.artisanPayoutKobo,
            materialsAdvanceKobo: q.materialsAdvanceKobo,
            completionPayoutKobo: q.completionPayoutKobo,
            materialsAdvanceCapKobo: q.materialsAdvanceCapKobo,
          },
        }
      : {}),
  };
}

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: JobAccessService,
    private readonly transitions: JobTransitionsService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  async create(
    user: AuthUser,
    input: Required<Pick<CreateJobInput, 'photoFileIds'>> & CreateJobInput,
  ): Promise<JobView> {
    const [trade, area] = await Promise.all([
      this.prisma.trade.findFirst({ where: { id: input.tradeId, isActive: true } }),
      this.prisma.serviceArea.findFirst({ where: { id: input.areaId, isActive: true } }),
    ]);
    if (!trade) throw new AppException(HttpStatus.BAD_REQUEST, 'TRADE_NOT_FOUND', 'Choose a trade');
    if (!area)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'AREA_NOT_FOUND',
        'We are not in that area yet',
      );

    const today = lagosDateString();
    const latest = lagosDateString(new Date(Date.now() + MAX_DAYS_AHEAD * 86_400_000));
    if (input.preferredDate < today || input.preferredDate > latest) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'DATE_OUT_OF_RANGE',
        `Pick a day within the next ${MAX_DAYS_AHEAD} days`,
      );
    }

    const job = await this.prisma.$transaction(async (tx) => {
      const [{ nextval }] = await tx.$queryRaw<
        [{ nextval: bigint }]
      >`SELECT nextval('job_ref_seq')`;
      const created = await tx.jobRequest.create({
        data: {
          ref: `JK-${nextval}`,
          clientId: user.id,
          tradeId: trade.id,
          areaId: area.id,
          description: input.description,
          addressLine: input.addressLine,
          landmark: input.landmark ?? null,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          preferredDate: new Date(`${input.preferredDate}T00:00:00Z`),
          timeWindow: input.timeWindow,
          statusEvents: { create: { to: 'PENDING_ASSIGNMENT', actorId: user.id, note: 'created' } },
        },
      });
      if (input.photoFileIds.length) {
        const attached = await tx.file.updateMany({
          where: {
            id: { in: input.photoFileIds },
            ownerId: user.id,
            kind: 'JOB_REQUEST_PHOTO',
            jobId: null,
            uploadedAt: { not: null },
          },
          data: { jobId: created.id },
        });
        if (attached.count !== new Set(input.photoFileIds).size) {
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            'PHOTOS_INVALID',
            'Some photos were not uploaded. Please add them again.',
          );
        }
      }
      return created;
    });
    return this.view(user, job.id);
  }

  async listForClient(user: AuthUser): Promise<JobCardView[]> {
    const jobs = await this.prisma.jobRequest.findMany({
      where: { clientId: user.id },
      include: {
        trade: true,
        area: true,
        assignments: {
          where: { status: 'ACCEPTED' },
          include: { artisan: { select: { displayName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return jobs.map((j) => ({
      id: j.id,
      ref: j.ref,
      status: j.status,
      trade: j.trade.name,
      area: j.area.name,
      description: j.description,
      preferredDate: j.preferredDate.toISOString().slice(0, 10),
      timeWindow: j.timeWindow,
      createdAt: j.createdAt.toISOString(),
      artisanName: j.assignments[0]?.artisan.displayName ?? null,
    }));
  }

  async view(user: AuthUser, jobId: string): Promise<JobView> {
    const viewer = await this.access.resolve(user, jobId);
    if (!viewer) throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Job not found');
    const job = await this.prisma.jobRequest.findUniqueOrThrow({
      where: { id: jobId },
      include: jobInclude,
    });
    return this.buildView(job, viewer);
  }

  private async buildView(job: JobWithAll, viewer: JobViewer): Promise<JobView> {
    const paid = !isPrePayment(job.status) && job.status !== 'CANCELLED';
    const active =
      job.assignments.find((a) => a.status === 'ACCEPTED') ??
      job.assignments.find((a) => a.status === 'OFFERED');
    const accepted = active?.status === 'ACCEPTED';
    const isAdmin = viewer.role === 'admin';
    const reveal = (phone: string) => (paid || isAdmin ? phone : maskPhone(phone));

    const visibleFiles = job.files.filter(
      (f) =>
        viewer.role !== 'artisan' ||
        viewer.assignmentStatus === 'ACCEPTED' ||
        f.kind === 'JOB_REQUEST_PHOTO',
    );
    const photos = await Promise.all(
      visibleFiles.map(async (f) => ({
        id: f.id,
        kind: f.kind,
        url: (await this.files.sign(f.bucket, f.storageKey)).url,
      })),
    );

    const actor: JobActor =
      viewer.role === 'client' ? 'CLIENT' : viewer.role === 'artisan' ? 'ARTISAN' : 'ADMIN';
    const quote = job.quotes[0];
    return {
      id: job.id,
      ref: job.ref,
      status: job.status,
      viewer: viewer.role,
      trade: { id: job.trade.id, slug: job.trade.slug, name: job.trade.name },
      area: { id: job.area.id, slug: job.area.slug, name: job.area.name },
      description: job.description,
      addressLine:
        viewer.role === 'artisan' && viewer.assignmentStatus !== 'ACCEPTED'
          ? null
          : job.addressLine,
      landmark: job.landmark,
      preferredDate: job.preferredDate.toISOString().slice(0, 10),
      timeWindow: job.timeWindow,
      createdAt: job.createdAt.toISOString(),
      photos,
      client: {
        name: viewer.role === 'artisan' ? firstName(job.client.name) : job.client.name,
        phone: viewer.role === 'client' ? job.client.phone : reveal(job.client.phone),
      },
      artisan:
        active && (accepted || isAdmin || viewer.role === 'artisan')
          ? {
              artisanId: active.artisanId,
              name: active.artisan.displayName,
              phone:
                viewer.role === 'artisan'
                  ? active.artisan.user.phone
                  : reveal(active.artisan.user.phone),
              ratingAvg: active.artisan.ratingAvg,
              ratingCount: active.artisan.ratingCount,
              jobsCompleted: active.artisan.jobsCompleted,
              sealed: active.artisan.sealStatus === 'SEALED',
            }
          : null,
      offer:
        viewer.role === 'artisan' || (isAdmin && active)
          ? {
              assignmentId: active!.id,
              status: active!.status,
              expiresAt: active!.expiresAt?.toISOString() ?? null,
            }
          : null,
      quote: quote ? toQuoteView(quote, viewer.role !== 'client') : null,
      actions: availableJobActions(job.status, actor),
      timeline: job.statusEvents.map((e) => ({
        to: e.to,
        at: e.createdAt.toISOString(),
        note: e.note,
      })),
    };
  }

  async cancel(
    user: AuthUser,
    jobId: string,
    reason: string,
    ctx: RequestContext,
  ): Promise<JobView> {
    const viewer = await this.access.resolve(user, jobId);
    if (!viewer || viewer.role === 'artisan')
      throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Job not found');
    const actor: JobActor = viewer.role === 'client' ? 'CLIENT' : 'ADMIN';
    await this.prisma.$transaction(async (tx) => {
      const r = await this.transitions.apply(tx, {
        jobId,
        action: 'cancel',
        actor,
        actorId: user.id,
        note: reason,
        data: { cancelledAt: new Date(), cancelReason: reason },
      });
      await tx.assignment.updateMany({
        where: { jobId, status: { in: ['OFFERED', 'ACCEPTED'] } },
        data: { status: 'WITHDRAWN' },
      });
      await tx.quote.updateMany({
        where: { jobId, status: { in: ['SUBMITTED', 'APPROVED'] } },
        data: { status: 'SUPERSEDED' },
      });
      if (actor === 'ADMIN') {
        await this.audit.record(
          {
            actor: user,
            action: 'job.cancel',
            entityType: 'JobRequest',
            entityId: jobId,
            before: { status: r.from },
            after: { status: r.to, reason },
            ctx,
          },
          tx,
        );
      }
    });
    return this.view(user, jobId);
  }
}
