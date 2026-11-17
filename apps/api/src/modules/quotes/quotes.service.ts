import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { MAX_KOBO, splitQuote, type SubmitQuoteInput } from '@jiko/shared';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { AppException } from '../../common/http/app-exception';
import type { AuthUser, RequestContext } from '../../common/http/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JobTransitionsService } from '../jobs/job-transitions.service';

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: JobTransitionsService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async submit(user: AuthUser, jobId: string, input: SubmitQuoteInput) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { jobId, status: 'ACCEPTED', artisan: { userId: user.id } },
    });
    if (!assignment) throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Job not found');

    const items = input.items.map((i, n) => {
      const totalKobo = i.quantity * i.unitPriceKobo;
      if (totalKobo > MAX_KOBO)
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'AMOUNT_TOO_LARGE',
          'An item total is too large',
        );
      return { ...i, totalKobo, sortOrder: n };
    });
    const labourKobo = items
      .filter((i) => i.kind === 'LABOUR')
      .reduce((s, i) => s + i.totalKobo, 0);
    const materialsKobo = items
      .filter((i) => i.kind === 'MATERIAL')
      .reduce((s, i) => s + i.totalKobo, 0);
    if (labourKobo + materialsKobo === 0)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'QUOTE_EMPTY',
        'The quote total cannot be zero',
      );
    if (labourKobo + materialsKobo > MAX_KOBO)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'AMOUNT_TOO_LARGE',
        'Quote total is too large',
      );

    const policy = {
      commissionBps: this.env.COMMISSION_BPS,
      materialsAdvanceCapKobo: this.env.MATERIALS_ADVANCE_CAP_KOBO,
      materialsReviewThresholdBps: this.env.MATERIALS_REVIEW_THRESHOLD_BPS,
    };
    const split = splitQuote(labourKobo, materialsKobo, policy);

    return this.prisma.$transaction(async (tx) => {
      await this.transitions.apply(tx, {
        jobId,
        action: 'submitQuote',
        actor: 'ARTISAN',
        actorId: user.id,
        note: 'quote submitted',
      });
      await tx.quote.updateMany({
        where: { jobId, status: 'SUBMITTED' },
        data: { status: 'SUPERSEDED' },
      });
      const last = await tx.quote.findFirst({
        where: { jobId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const quote = await tx.quote.create({
        data: {
          jobId,
          assignmentId: assignment.id,
          artisanId: assignment.artisanId,
          version: (last?.version ?? 0) + 1,
          labourKobo,
          materialsKobo,
          totalKobo: split.totalKobo,
          commissionBps: policy.commissionBps,
          commissionKobo: split.commissionKobo,
          commissionFromMaterialsKobo: split.commissionFromMaterialsKobo,
          artisanPayoutKobo: split.artisanPayoutKobo,
          materialsAdvanceCapKobo: policy.materialsAdvanceCapKobo,
          materialsAdvanceKobo: split.materialsAdvanceKobo,
          completionPayoutKobo: split.completionPayoutKobo,
          reviewStatus: split.requiresAdminReview ? 'PENDING' : 'NOT_REQUIRED',
          notes: input.notes ?? null,
          items: { create: items },
        },
      });
      return {
        quoteId: quote.id,
        version: quote.version,
        totalKobo: quote.totalKobo,
        reviewStatus: quote.reviewStatus,
      };
    });
  }

  private async clientQuote(user: AuthUser, quoteId: string) {
    const q = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { job: { select: { clientId: true } } },
    });
    if (!q || q.job.clientId !== user.id)
      throw new AppException(HttpStatus.NOT_FOUND, 'QUOTE_NOT_FOUND', 'Quote not found');
    if (q.status !== 'SUBMITTED')
      throw new AppException(
        HttpStatus.CONFLICT,
        'QUOTE_NOT_OPEN',
        'This quote can no longer be changed',
      );
    return q;
  }

  async approve(user: AuthUser, quoteId: string) {
    const q = await this.clientQuote(user, quoteId);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.quote.updateMany({
        where: { id: q.id, status: 'SUBMITTED' },
        data: { status: 'APPROVED', decidedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new AppException(
          HttpStatus.CONFLICT,
          'QUOTE_NOT_OPEN',
          'This quote can no longer be changed',
        );
      await this.transitions.apply(tx, {
        jobId: q.jobId,
        action: 'approveQuote',
        actor: 'CLIENT',
        actorId: user.id,
        note: `quote v${q.version} approved`,
      });
    });
    return { jobId: q.jobId, reviewStatus: q.reviewStatus };
  }

  async reject(user: AuthUser, quoteId: string, reason: string) {
    const q = await this.clientQuote(user, quoteId);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.quote.updateMany({
        where: { id: q.id, status: 'SUBMITTED' },
        data: { status: 'REJECTED', decidedAt: new Date(), rejectionReason: reason },
      });
      if (claimed.count !== 1)
        throw new AppException(
          HttpStatus.CONFLICT,
          'QUOTE_NOT_OPEN',
          'This quote can no longer be changed',
        );
      await this.transitions.apply(tx, {
        jobId: q.jobId,
        action: 'rejectQuote',
        actor: 'CLIENT',
        actorId: user.id,
        note: reason,
      });
    });
    return { jobId: q.jobId };
  }

  /** Jiko review of a quote whose materials exceed the threshold (default 70% of the total). */
  async review(
    admin: AuthUser,
    quoteId: string,
    decision: 'APPROVE' | 'REJECT',
    note: string,
    ctx: RequestContext,
  ) {
    const q = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!q) throw new AppException(HttpStatus.NOT_FOUND, 'QUOTE_NOT_FOUND', 'Quote not found');
    if (q.reviewStatus !== 'PENDING' || !['SUBMITTED', 'APPROVED'].includes(q.status)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'REVIEW_NOT_PENDING',
        'This quote is not waiting for review',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.quote.updateMany({
        where: { id: q.id, reviewStatus: 'PENDING' },
        data:
          decision === 'APPROVE'
            ? {
                reviewStatus: 'APPROVED',
                reviewedById: admin.id,
                reviewedAt: now,
                reviewNote: note,
              }
            : {
                reviewStatus: 'REJECTED',
                reviewedById: admin.id,
                reviewedAt: now,
                reviewNote: note,
                status: 'REJECTED',
                rejectionReason: note,
                decidedAt: now,
              },
      });
      if (claimed.count !== 1)
        throw new AppException(
          HttpStatus.CONFLICT,
          'REVIEW_NOT_PENDING',
          'This quote is not waiting for review',
        );
      if (decision === 'REJECT') {
        await this.transitions.apply(tx, {
          jobId: q.jobId,
          action: 'rejectQuoteInReview',
          actor: 'ADMIN',
          actorId: admin.id,
          note,
        });
      }
      await this.audit.record(
        {
          actor: admin,
          action: `quote.review.${decision.toLowerCase()}`,
          entityType: 'Quote',
          entityId: q.id,
          before: { reviewStatus: 'PENDING' },
          after: { decision, note, totalKobo: q.totalKobo, materialsKobo: q.materialsKobo },
          ctx,
        },
        tx,
      );
    });
    return { quoteId: q.id, jobId: q.jobId, decision };
  }
}
