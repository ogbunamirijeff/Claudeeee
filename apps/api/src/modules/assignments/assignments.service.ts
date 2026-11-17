import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { offerExpiresAt, type CandidateView } from '@jiko/shared';
import { AppException } from '../../common/http/app-exception';
import type { AuthUser, RequestContext } from '../../common/http/request-context';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JobTransitionsService } from '../jobs/job-transitions.service';
import { haversineKm } from './geo';

const ACTIVE_JOB_STATUSES = [
  'ACCEPTED',
  'QUOTED',
  'AWAITING_PAYMENT',
  'PAID',
  'IN_PROGRESS',
  'WORK_SUBMITTED',
  'DISPUTED',
] as const;

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: JobTransitionsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Sealed, available artisans for the job's trade, ranked: serves the area → nearest → best rated.
   * v1 matching is manual; these signals are also snapshotted on each assignment so a weighted
   * engine can be trained on real decisions later.
   */
  async candidates(jobId: string, limit = 20): Promise<CandidateView[]> {
    return (await this.rank(jobId)).slice(0, limit);
  }

  /** Every eligible artisan, ranked. Eligibility checks use the full list, never the display cap. */
  private async rank(jobId: string): Promise<CandidateView[]> {
    const job = await this.prisma.jobRequest.findUnique({
      where: { id: jobId },
      include: { area: true },
    });
    if (!job) throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Job not found');
    const origin =
      job.lat !== null && job.lng !== null
        ? { lat: job.lat, lng: job.lng }
        : { lat: job.area.lat, lng: job.area.lng };

    const artisans = await this.prisma.artisanProfile.findMany({
      where: {
        sealStatus: 'SEALED',
        isAvailable: true,
        trades: { some: { tradeId: job.tradeId } },
        user: { status: 'ACTIVE', roles: { has: 'ARTISAN' }, id: { not: job.clientId } },
        assignments: { none: { jobId } }, // never re-offer a job to someone who declined, expired or was withdrawn
      },
      include: { serviceAreas: { include: { area: true } } },
      take: 2000,
    });
    if (!artisans.length) return [];

    const active = await this.prisma.assignment.groupBy({
      by: ['artisanId'],
      where: {
        artisanId: { in: artisans.map((a) => a.id) },
        status: 'ACCEPTED',
        job: { status: { in: [...ACTIVE_JOB_STATUSES] } },
      },
      _count: { _all: true },
    });
    const activeBy = new Map(active.map((a) => [a.artisanId, a._count._all]));

    return artisans
      .map((a) => ({
        artisanId: a.id,
        name: a.displayName,
        areaMatch: a.serviceAreas.some((s) => s.areaId === job.areaId),
        areas: a.serviceAreas.map((s) => s.area.name),
        distanceKm:
          a.baseLat !== null && a.baseLng !== null
            ? haversineKm(origin, { lat: a.baseLat, lng: a.baseLng })
            : null,
        ratingAvg: a.ratingAvg,
        ratingCount: a.ratingCount,
        jobsCompleted: a.jobsCompleted,
        completionRate: a.completionRate,
        avgResponseSeconds: a.avgResponseSeconds,
        activeJobs: activeBy.get(a.id) ?? 0,
      }))
      .sort(
        (x, y) =>
          Number(y.areaMatch) - Number(x.areaMatch) ||
          (x.distanceKm ?? 999) - (y.distanceKm ?? 999) ||
          y.ratingAvg - x.ratingAvg,
      );
  }

  async assign(
    admin: AuthUser,
    jobId: string,
    artisanId: string,
    note: string | undefined,
    ctx: RequestContext,
  ) {
    const ranked = await this.rank(jobId);
    const pick = ranked.find((c) => c.artisanId === artisanId);
    if (!pick) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'ARTISAN_NOT_ELIGIBLE',
        'This artisan cannot take this job (not sealed, unavailable, wrong trade, or already offered it)',
      );
    }
    const offeredAt = new Date();
    const expiresAt = offerExpiresAt(offeredAt);

    return this.prisma.$transaction(async (tx) => {
      await this.transitions.apply(tx, {
        jobId,
        action: 'assign',
        actor: 'ADMIN',
        actorId: admin.id,
        note: note ?? 'assigned',
      });
      const assignment = await tx.assignment.create({
        data: {
          jobId,
          artisanId,
          assignedById: admin.id,
          offeredAt,
          expiresAt,
          distanceKm: pick.distanceKm,
          matchSnapshot: { ...pick, rank: ranked.indexOf(pick) + 1, candidateCount: ranked.length },
        },
      });
      await tx.artisanProfile.update({
        where: { id: artisanId },
        data: { offersReceived: { increment: 1 } },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'assignment.create',
          entityType: 'JobRequest',
          entityId: jobId,
          after: {
            assignmentId: assignment.id,
            artisanId,
            expiresAt: expiresAt.toISOString(),
            note: note ?? null,
          },
          ctx,
        },
        tx,
      );
      return { assignmentId: assignment.id, expiresAt: expiresAt.toISOString() };
    });
  }

  private async ownAssignment(user: AuthUser, assignmentId: string) {
    const a = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { artisan: { select: { userId: true } } },
    });
    if (!a || a.artisan.userId !== user.id)
      throw new AppException(HttpStatus.NOT_FOUND, 'OFFER_NOT_FOUND', 'Offer not found');
    return a;
  }

  async accept(user: AuthUser, assignmentId: string) {
    const a = await this.ownAssignment(user, assignmentId);
    if (a.status === 'OFFERED' && a.expiresAt && a.expiresAt <= new Date()) {
      await this.expireDue(new Date());
      throw new AppException(HttpStatus.CONFLICT, 'OFFER_EXPIRED', 'This offer has expired');
    }
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.assignment.updateMany({
        where: { id: a.id, status: 'OFFERED' },
        data: { status: 'ACCEPTED', respondedAt: now, acceptedAt: now },
      });
      if (claimed.count !== 1)
        throw new AppException(HttpStatus.CONFLICT, 'OFFER_CLOSED', 'This offer is no longer open');
      await this.transitions.apply(tx, {
        jobId: a.jobId,
        action: 'acceptOffer',
        actor: 'ARTISAN',
        actorId: user.id,
      });
      await this.refreshStats(tx, a.artisanId);
    });
    return { jobId: a.jobId };
  }

  async decline(user: AuthUser, assignmentId: string, reason: string) {
    const a = await this.ownAssignment(user, assignmentId);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.assignment.updateMany({
        where: { id: a.id, status: 'OFFERED' },
        data: { status: 'DECLINED', respondedAt: new Date(), declineReason: reason },
      });
      if (claimed.count !== 1)
        throw new AppException(HttpStatus.CONFLICT, 'OFFER_CLOSED', 'This offer is no longer open');
      await this.transitions.apply(tx, {
        jobId: a.jobId,
        action: 'declineOffer',
        actor: 'ARTISAN',
        actorId: user.id,
        note: reason,
      });
      await this.refreshStats(tx, a.artisanId);
    });
    return { jobId: a.jobId };
  }

  async withdraw(admin: AuthUser, jobId: string, reason: string, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const a = await tx.assignment.findFirst({
        where: { jobId, status: { in: ['OFFERED', 'ACCEPTED'] } },
      });
      if (!a)
        throw new AppException(
          HttpStatus.CONFLICT,
          'NO_ACTIVE_ASSIGNMENT',
          'This job has no active assignment',
        );
      await this.transitions.apply(tx, {
        jobId,
        action: 'withdrawAssignment',
        actor: 'ADMIN',
        actorId: admin.id,
        note: reason,
      });
      await tx.assignment.update({ where: { id: a.id }, data: { status: 'WITHDRAWN' } });
      await tx.quote.updateMany({
        where: { jobId, status: { in: ['SUBMITTED', 'APPROVED'] } },
        data: { status: 'SUPERSEDED' },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'assignment.withdraw',
          entityType: 'JobRequest',
          entityId: jobId,
          before: { assignmentId: a.id, status: a.status },
          after: { reason },
          ctx,
        },
        tx,
      );
    });
    return { jobId };
  }

  /** Expires every open offer past its deadline. Run by the scheduler every minute; idempotent. */
  async expireDue(now: Date): Promise<number> {
    const due = await this.prisma.assignment.findMany({
      where: { status: 'OFFERED', expiresAt: { lte: now } },
      select: { id: true, jobId: true, artisanId: true },
    });
    let expired = 0;
    for (const a of due) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.assignment.updateMany({
            where: { id: a.id, status: 'OFFERED' },
            data: { status: 'EXPIRED' },
          });
          if (claimed.count !== 1) return;
          await this.transitions.apply(tx, {
            jobId: a.jobId,
            action: 'expireOffer',
            actor: 'SYSTEM',
            actorId: null,
            note: 'offer expired',
          });
          await this.refreshStats(tx, a.artisanId);
          expired++;
        });
      } catch (e) {
        this.logger.error(`Failed to expire assignment ${a.id}: ${(e as Error).message}`);
      }
    }
    return expired;
  }

  /** Recomputes offer stats from assignments (source of truth) rather than incrementing counters. */
  private async refreshStats(tx: Tx, artisanId: string) {
    const [{ received, accepted, avg }] = await tx.$queryRaw<
      [{ received: bigint; accepted: bigint; avg: number | null }]
    >`
      SELECT COUNT(*) AS received,
             COUNT("acceptedAt") AS accepted,
             AVG(EXTRACT(EPOCH FROM ("respondedAt" - "offeredAt")))::float AS avg
      FROM assignments WHERE "artisanId" = ${artisanId}`;
    await tx.artisanProfile.update({
      where: { id: artisanId },
      data: {
        offersReceived: Number(received),
        offersAccepted: Number(accepted),
        avgResponseSeconds: avg === null ? null : Math.round(avg),
      },
    });
  }
}
