import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { AssignSchema, ReasonSchema, ReviewQuoteSchema } from '@jiko/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentUser, Roles } from '../../common/decorators/access.decorators';
import { contextFrom, type AuthUser } from '../../common/http/request-context';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { QuotesService } from '../quotes/quotes.service';

const STATUSES = [
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'ACCEPTED',
  'QUOTED',
  'AWAITING_PAYMENT',
  'PAID',
  'IN_PROGRESS',
  'WORK_SUBMITTED',
  'COMPLETED',
  'DISPUTED',
  'REFUNDED',
  'CANCELLED',
] as const;
const ListJobsQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',') : undefined))
    .pipe(z.array(z.enum(STATUSES)).optional()),
  tradeId: z.string().optional(),
  areaId: z.string().optional(),
  take: z.coerce.number().int().min(1).max(200).default(100),
});

@Controller('admin')
@Roles('ADMIN')
export class AdminJobsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
    private readonly quotes: QuotesService,
  ) {}

  /** Request queue and pipeline. Oldest first, so nothing waits forever. */
  @Get('jobs')
  async list(@Query(new ZodPipe(ListJobsQuery)) q: z.output<typeof ListJobsQuery>) {
    const jobs = await this.prisma.jobRequest.findMany({
      where: {
        status: q.status ? { in: q.status } : undefined,
        tradeId: q.tradeId,
        areaId: q.areaId,
      },
      include: {
        trade: { select: { name: true, slug: true } },
        area: { select: { name: true } },
        client: { select: { name: true } },
        assignments: {
          where: { status: { in: ['OFFERED', 'ACCEPTED'] } },
          include: { artisan: { select: { displayName: true } } },
        },
        quotes: {
          where: { status: { in: ['SUBMITTED', 'APPROVED'] } },
          select: { totalKobo: true, reviewStatus: true },
        },
        statusEvents: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: q.take,
    });
    return jobs.map((j) => ({
      id: j.id,
      ref: j.ref,
      status: j.status,
      trade: j.trade.name,
      tradeSlug: j.trade.slug,
      area: j.area.name,
      clientName: j.client.name,
      description: j.description,
      preferredDate: j.preferredDate.toISOString().slice(0, 10),
      timeWindow: j.timeWindow,
      createdAt: j.createdAt.toISOString(),
      statusSince: (j.statusEvents[0]?.createdAt ?? j.createdAt).toISOString(),
      artisanName: j.assignments[0]?.artisan.displayName ?? null,
      offerStatus: j.assignments[0]?.status ?? null,
      offerExpiresAt: j.assignments[0]?.expiresAt?.toISOString() ?? null,
      quoteTotalKobo: j.quotes[0]?.totalKobo ?? null,
      quoteReviewStatus: j.quotes[0]?.reviewStatus ?? null,
    }));
  }

  /** Counts per status for the pipeline board. */
  @Get('jobs/summary')
  async summary() {
    const [byStatus, pendingReviews] = await Promise.all([
      this.prisma.jobRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.quote.count({
        where: { reviewStatus: 'PENDING', status: { in: ['SUBMITTED', 'APPROVED'] } },
      }),
    ]);
    return {
      byStatus: Object.fromEntries(
        STATUSES.map((s) => [s, byStatus.find((b) => b.status === s)?._count._all ?? 0]),
      ),
      pendingQuoteReviews: pendingReviews,
    };
  }

  @Get('jobs/:id/candidates')
  candidates(@Param('id') id: string) {
    return this.assignments.candidates(id);
  }

  @Post('jobs/:id/assign')
  assign(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(AssignSchema)) body: z.output<typeof AssignSchema>,
    @Req() req: Request,
  ) {
    return this.assignments.assign(admin, id, body.artisanId, body.note, contextFrom(req));
  }

  @Post('jobs/:id/withdraw')
  @HttpCode(200)
  withdraw(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(ReasonSchema)) body: z.output<typeof ReasonSchema>,
    @Req() req: Request,
  ) {
    return this.assignments.withdraw(admin, id, body.reason, contextFrom(req));
  }

  @Get('quotes/pending-review')
  pendingReviews() {
    return this.prisma.quote.findMany({
      where: { reviewStatus: 'PENDING', status: { in: ['SUBMITTED', 'APPROVED'] } },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        job: { select: { id: true, ref: true, trade: { select: { name: true } } } },
        artisan: { select: { displayName: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });
  }

  @Post('quotes/:id/review')
  @HttpCode(200)
  review(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(ReviewQuoteSchema)) body: z.output<typeof ReviewQuoteSchema>,
    @Req() req: Request,
  ) {
    return this.quotes.review(admin, id, body.decision, body.note, contextFrom(req));
  }
}
