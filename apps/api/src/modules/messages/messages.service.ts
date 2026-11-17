import { HttpStatus, Injectable } from '@nestjs/common';
import { isPrePayment, maskContactInfo, type MessageView } from '@jiko/shared';
import { AppException } from '../../common/http/app-exception';
import type { AuthUser } from '../../common/http/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { JobAccessService, type JobViewer } from '../jobs/job-access.service';

/**
 * In-app chat per job between the client, the accepted artisan and Jiko ops. Until the client
 * pays, phone numbers, emails and handles are masked and the message is flagged for ops.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: JobAccessService,
  ) {}

  private async viewer(user: AuthUser, jobId: string): Promise<JobViewer> {
    const v = await this.access.resolve(user, jobId);
    if (!v) throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Job not found');
    if (v.role === 'artisan' && v.assignmentStatus !== 'ACCEPTED') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'CHAT_NOT_OPEN',
        'Accept the job to chat with the client',
      );
    }
    return v;
  }

  async list(user: AuthUser, jobId: string, after?: Date): Promise<MessageView[]> {
    const v = await this.viewer(user, jobId);
    const job = await this.prisma.jobRequest.findUniqueOrThrow({
      where: { id: jobId },
      select: { clientId: true },
    });
    const msgs = await this.prisma.message.findMany({
      where: { jobId, ...(after ? { createdAt: { gt: after } } : {}) },
      include: { sender: { select: { id: true, name: true, roles: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return msgs.map((m) => ({
      id: m.id,
      from:
        m.senderId === user.id
          ? 'me'
          : m.senderId === job.clientId
            ? 'client'
            : m.sender.roles.includes('ADMIN')
              ? 'jiko'
              : 'artisan',
      senderName: m.sender.name,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      ...(v.role === 'admin'
        ? { contactInfoFlag: m.contactInfoFlag, originalBody: m.originalBody }
        : {}),
    }));
  }

  async send(user: AuthUser, jobId: string, body: string): Promise<MessageView> {
    const v = await this.viewer(user, jobId);
    if (v.jobStatus === 'CANCELLED' || v.jobStatus === 'REFUNDED') {
      throw new AppException(HttpStatus.CONFLICT, 'CHAT_CLOSED', 'This job is closed');
    }
    if (v.role === 'client') {
      const accepted = await this.prisma.assignment.count({ where: { jobId, status: 'ACCEPTED' } });
      if (!accepted)
        throw new AppException(
          HttpStatus.CONFLICT,
          'CHAT_NOT_OPEN',
          'Chat opens once an artisan accepts your job',
        );
    }
    const masked =
      v.role !== 'admin' && isPrePayment(v.jobStatus)
        ? maskContactInfo(body)
        : { text: body, masked: false, flagged: false };
    const m = await this.prisma.message.create({
      data: {
        jobId,
        senderId: user.id,
        body: masked.text,
        originalBody: masked.masked ? body : null,
        contactInfoFlag: masked.flagged,
      },
    });
    return {
      id: m.id,
      from: 'me',
      senderName: null,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
