import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Payment, Prisma } from '@prisma/client';
import { checkJobTransition, escrowTransition, FUNDS_HELD, type EscrowEvent } from '@jiko/shared';
import { randomUUID } from 'node:crypto';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { AppException } from '../../common/http/app-exception';
import type { AuthUser, RequestContext } from '../../common/http/request-context';
import { PrismaService, type Tx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JobTransitionsService } from '../jobs/job-transitions.service';
import { PAYMENT_GATEWAY, type PaymentGateway } from './gateway';
import { LedgerService } from './ledger.service';

const HOUR_MS = 3_600_000;

/**
 * Held funds for a job: Checkout → escrow (Jiko's Stripe balance) → materials advance at start →
 * remainder + commission on completion; refunds while funds are held. Every money movement goes
 * through LedgerService in the same DB transaction as the status change it belongs to. Calls to
 * the processor happen outside DB transactions and are made idempotent with stable keys.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly transitions: JobTransitionsService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ─────────────────────────── helpers ───────────────────────────

  private async moveEscrow(tx: Tx, payment: Payment, event: EscrowEvent) {
    const next = escrowTransition(payment.status, event);
    if (!next)
      throw new AppException(
        HttpStatus.CONFLICT,
        'PAYMENT_STATE',
        `Payment is ${payment.status}; cannot apply ${event}`,
      );
    const r = await tx.payment.updateMany({
      where: { id: payment.id, status: payment.status },
      data: { status: next },
    });
    if (r.count !== 1)
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONCURRENT_UPDATE',
        'Payment just changed. Try again.',
      );
    return next;
  }

  private async livePayment(tx: Tx, jobId: string) {
    return tx.payment.findFirst({
      where: { jobId, status: { notIn: ['FAILED', 'ABANDONED'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async approvedQuote(tx: Tx, jobId: string) {
    const q = await tx.quote.findFirst({
      where: { jobId, status: 'APPROVED' },
      orderBy: { version: 'desc' },
    });
    if (!q)
      throw new AppException(
        HttpStatus.CONFLICT,
        'NO_APPROVED_QUOTE',
        'This job has no approved quote',
      );
    return q;
  }

  // ─────────────────────────── client: pay ───────────────────────────

  /** Creates a Stripe Checkout session for the approved quote and returns its URL. */
  async createCheckout(user: AuthUser, jobId: string): Promise<{ paymentId: string; url: string }> {
    const job = await this.prisma.jobRequest.findUnique({ where: { id: jobId } });
    if (!job || job.clientId !== user.id)
      throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Job not found');
    const quote = await this.approvedQuote(this.prisma, jobId);
    const ok = checkJobTransition('markPaid', job.status, 'SYSTEM', {
      quoteReviewStatus: quote.reviewStatus,
    });
    if (!ok.ok)
      throw new AppException(
        HttpStatus.CONFLICT,
        ok.code === 'GUARD_FAILED' ? 'QUOTE_UNDER_REVIEW' : 'NOT_PAYABLE',
        ok.reason,
      );

    // One live payment per job: abandon a previous unpaid attempt before starting a new one.
    const previous = await this.livePayment(this.prisma, jobId);
    if (previous && previous.status !== 'INITIALIZED')
      throw new AppException(HttpStatus.CONFLICT, 'ALREADY_PAID', 'This job is already paid');
    if (previous) {
      if (previous.checkoutSessionId) await this.gateway.expireCheckout(previous.checkoutSessionId);
      await this.prisma.payment.updateMany({
        where: { id: previous.id, status: 'INITIALIZED' },
        data: { status: 'ABANDONED' },
      });
    }

    const reference = randomUUID();
    const payment = await this.prisma.payment.create({
      data: {
        jobId,
        quoteId: quote.id,
        clientId: user.id,
        amountCents: quote.totalCents,
        reference,
      },
    });
    try {
      const session = await this.gateway.createCheckout({
        paymentId: payment.id,
        jobId,
        jobRef: job.ref,
        description: job.description,
        amountCents: quote.totalCents,
        idempotencyKey: reference,
        successUrl: `${this.env.WEB_URL}/jobs/${jobId}?paid=1`,
        cancelUrl: `${this.env.WEB_URL}/jobs/${jobId}`,
      });
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { checkoutSessionId: session.sessionId },
      });
      return { paymentId: payment.id, url: session.url };
    } catch (e) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      this.logger.error(`Checkout creation failed: ${(e as Error).message}`);
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'CHECKOUT_FAILED',
        'Could not start payment. Please try again.',
      );
    }
  }

  // ─────────────────────────── processor events ───────────────────────────

  /** Checkout completed and paid → funds held, job PAID. Idempotent. */
  async onCheckoutPaid(s: {
    sessionId: string;
    paymentIntentId: string;
    amountTotal: number;
    currency: string;
  }) {
    const payment = await this.prisma.payment.findUnique({
      where: { checkoutSessionId: s.sessionId },
    });
    if (!payment) throw new Error(`No payment for checkout session ${s.sessionId}`);
    if (payment.status !== 'INITIALIZED' && payment.status !== 'ABANDONED') return; // already processed
    if (s.amountTotal !== payment.amountCents || s.currency.toLowerCase() !== 'usd') {
      await this.audit.record({
        actor: null,
        action: 'payment.amount_mismatch',
        entityType: 'Payment',
        entityId: payment.id,
        after: { expected: payment.amountCents, got: s.amountTotal, currency: s.currency },
      });
      throw new Error(`Amount mismatch for payment ${payment.id}`);
    }
    const fee = await this.gateway
      .getProcessingFee(s.paymentIntentId, s.amountTotal)
      .catch(() => null);

    const jobStillPayable = await this.prisma.$transaction(async (tx) => {
      // A session the client abandoned can still complete (paid in another tab): accept the money.
      const fresh = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (fresh.status === 'ABANDONED')
        await tx.payment.update({ where: { id: fresh.id }, data: { status: 'INITIALIZED' } });
      await this.moveEscrow(tx, { ...fresh, status: 'INITIALIZED' }, 'captured');
      await tx.payment.update({
        where: { id: payment.id },
        data: { stripePaymentIntentId: s.paymentIntentId, paidAt: new Date(), feesCents: fee },
      });
      await this.ledger.post(tx, { jobId: payment.jobId, paymentId: payment.id }, [
        {
          from: 'PAYMENT_INFLOW',
          to: 'ESCROW',
          amountCents: payment.amountCents,
          memo: 'Client payment captured',
        },
        {
          from: 'PLATFORM_COMMISSION',
          to: 'PROCESSING_FEES',
          amountCents: fee ?? 0,
          memo: 'Stripe processing fee (absorbed by Jiko)',
        },
      ]);
      const job = await tx.jobRequest.findUniqueOrThrow({ where: { id: payment.jobId } });
      const quote = await tx.quote.findUniqueOrThrow({ where: { id: payment.quoteId } });
      const can = checkJobTransition('markPaid', job.status, 'SYSTEM', {
        quoteReviewStatus: quote.reviewStatus,
      });
      if (!can.ok) return false;
      await this.transitions.apply(tx, {
        jobId: job.id,
        action: 'markPaid',
        actor: 'SYSTEM',
        actorId: null,
        ctx: { quoteReviewStatus: quote.reviewStatus },
        note: 'payment received',
      });
      return true;
    });

    if (!jobStillPayable) {
      // e.g. the client cancelled while the payment page was open: give the money back.
      this.logger.warn(
        `Payment ${payment.id} captured for a job that is no longer payable; refunding`,
      );
      await this.refundHeld(null, payment.jobId, 'Job no longer payable when payment arrived', {
        transitionJob: false,
      });
    }
  }

  async onCheckoutExpired(sessionId: string) {
    await this.prisma.payment.updateMany({
      where: { checkoutSessionId: sessionId, status: 'INITIALIZED' },
      data: { status: 'ABANDONED' },
    });
  }

  async onCheckoutFailed(sessionId: string) {
    await this.prisma.payment.updateMany({
      where: { checkoutSessionId: sessionId, status: 'INITIALIZED' },
      data: { status: 'FAILED' },
    });
  }

  // ─────────────────────────── pro: start / submit ───────────────────────────

  private async proJob(user: AuthUser, jobId: string) {
    const a = await this.prisma.assignment.findFirst({
      where: { jobId, status: 'ACCEPTED', artisan: { userId: user.id } },
      include: { artisan: true },
    });
    if (!a) throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Job not found');
    return a;
  }

  private async hasFile(
    jobId: string,
    ownerId: string,
    kind: 'JOB_PHOTO_BEFORE' | 'JOB_PHOTO_AFTER' | 'MATERIALS_RECEIPT',
  ) {
    return (
      (await this.prisma.file.count({
        where: { jobId, ownerId, kind, uploadedAt: { not: null } },
      })) > 0
    );
  }

  /** Pro is on site with a before-photo → IN_PROGRESS, materials advance released (up to the cap). */
  async startWork(user: AuthUser, jobId: string) {
    const a = await this.proJob(user, jobId);
    const hasBeforePhoto = await this.hasFile(jobId, user.id, 'JOB_PHOTO_BEFORE');
    const payoutId = await this.prisma.$transaction(async (tx) => {
      await this.transitions.apply(tx, {
        jobId,
        action: 'startWork',
        actor: 'ARTISAN',
        actorId: user.id,
        ctx: { hasBeforePhoto },
        data: { startedAt: new Date() },
        note: 'work started on site',
      });
      const payment = await this.livePayment(tx, jobId);
      if (!payment || !FUNDS_HELD.includes(payment.status))
        throw new AppException(HttpStatus.CONFLICT, 'NOT_PAID', 'Payment is not held for this job');
      const quote = await tx.quote.findUniqueOrThrow({ where: { id: payment.quoteId } });
      if (quote.materialsAdvanceCents <= 0) return null;
      const payout = await tx.payout.create({
        data: {
          jobId,
          paymentId: payment.id,
          artisanId: a.artisanId,
          amountCents: quote.materialsAdvanceCents,
          trigger: 'MATERIALS_ADVANCE',
          transferReference: `payout-${payment.id}-advance`,
          stripeAccountId: a.artisan.stripeAccountId,
        },
      });
      await this.ledger.post(
        tx,
        { jobId, paymentId: payment.id, payoutId: payout.id, actorId: user.id },
        [
          {
            from: 'ESCROW',
            to: 'ARTISAN_PAYABLE',
            amountCents: payout.amountCents,
            memo: 'Materials advance (job started on site)',
          },
        ],
      );
      await this.moveEscrow(tx, payment, 'advanceReleased');
      return payout.id;
    });
    if (payoutId) await this.processPayout(payoutId);
    return { jobId, materialsAdvancePayoutId: payoutId };
  }

  /** After-photos (and a materials receipt when the quote has materials) → WORK_SUBMITTED, 48h clock. */
  async submitWork(user: AuthUser, jobId: string) {
    await this.proJob(user, jobId);
    const [hasAfterPhoto, hasMaterialsReceipt, payment] = await Promise.all([
      this.hasFile(jobId, user.id, 'JOB_PHOTO_AFTER'),
      this.hasFile(jobId, user.id, 'MATERIALS_RECEIPT'),
      this.livePayment(this.prisma, jobId),
    ]);
    const quote = payment
      ? await this.prisma.quote.findUnique({ where: { id: payment.quoteId } })
      : null;
    const now = new Date();
    await this.prisma.$transaction((tx) =>
      this.transitions.apply(tx, {
        jobId,
        action: 'submitWork',
        actor: 'ARTISAN',
        actorId: user.id,
        ctx: {
          hasAfterPhoto,
          hasMaterialsReceipt,
          quoteMaterialsCents: quote?.materialsCents ?? 0,
        },
        data: {
          workSubmittedAt: now,
          autoReleaseAt: new Date(now.getTime() + this.env.AUTO_RELEASE_HOURS * HOUR_MS),
        },
        note: 'work marked done',
      }),
    );
    return {
      jobId,
      autoReleaseAt: new Date(now.getTime() + this.env.AUTO_RELEASE_HOURS * HOUR_MS).toISOString(),
    };
  }

  // ─────────────────────────── release ───────────────────────────

  /** Client confirms the job is done → everything left in escrow is released. */
  async confirmCompletion(user: AuthUser, jobId: string) {
    const job = await this.prisma.jobRequest.findUnique({ where: { id: jobId } });
    if (!job || job.clientId !== user.id)
      throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Job not found');
    const payoutId = await this.prisma.$transaction((tx) =>
      this.releaseFinal(tx, jobId, 'CLIENT_CONFIRMED', user.id),
    );
    if (payoutId) await this.processPayout(payoutId);
    return { jobId };
  }

  /** WORK_SUBMITTED for 48h with no dispute → released automatically. Run by the scheduler. */
  async autoReleaseDue(now: Date): Promise<number> {
    const due = await this.prisma.jobRequest.findMany({
      where: { status: 'WORK_SUBMITTED', autoReleaseAt: { lte: now } },
      select: { id: true },
    });
    let n = 0;
    for (const { id } of due) {
      try {
        const payoutId = await this.prisma.$transaction((tx) =>
          this.releaseFinal(tx, id, 'AUTO_RELEASE', null, now),
        );
        if (payoutId) await this.processPayout(payoutId);
        n++;
      } catch (e) {
        this.logger.error(`Auto-release failed for job ${id}: ${(e as Error).message}`);
      }
    }
    return n;
  }

  private async releaseFinal(
    tx: Tx,
    jobId: string,
    trigger: 'CLIENT_CONFIRMED' | 'AUTO_RELEASE',
    actorId: string | null,
    now = new Date(),
  ) {
    const job = await tx.jobRequest.findUniqueOrThrow({ where: { id: jobId } });
    await this.transitions.apply(tx, {
      jobId,
      action: trigger === 'AUTO_RELEASE' ? 'autoRelease' : 'confirmCompletion',
      actor: trigger === 'AUTO_RELEASE' ? 'SYSTEM' : 'CLIENT',
      actorId,
      ctx: { autoReleaseAt: job.autoReleaseAt, now },
      data: {
        completedAt: now,
        guaranteeExpiresAt: new Date(now.getTime() + this.env.GUARANTEE_DAYS * 24 * HOUR_MS),
      },
      note:
        trigger === 'AUTO_RELEASE'
          ? `auto-released after ${this.env.AUTO_RELEASE_HOURS}h`
          : 'client confirmed completion',
    });
    const payment = await this.livePayment(tx, jobId);
    if (!payment || !FUNDS_HELD.includes(payment.status))
      throw new AppException(HttpStatus.CONFLICT, 'NOT_PAID', 'No held funds for this job');
    const quote = await tx.quote.findUniqueOrThrow({ where: { id: payment.quoteId } });
    const assignment = await tx.assignment.findFirstOrThrow({
      where: { jobId, status: 'ACCEPTED' },
      include: { artisan: true },
    });
    const { escrowCents } = await this.ledger.totals(tx, payment.id);

    // What remains in escrow = completion payout + commission (advance already left).
    const completion = escrowCents - quote.commissionCents;
    if (completion < 0)
      throw new AppException(
        HttpStatus.CONFLICT,
        'ESCROW_INSUFFICIENT',
        'Held funds do not cover the commission',
      );
    let payoutId: string | null = null;
    if (completion > 0) {
      const payout = await tx.payout.create({
        data: {
          jobId,
          paymentId: payment.id,
          artisanId: assignment.artisanId,
          amountCents: completion,
          trigger,
          transferReference: `payout-${payment.id}-completion`,
          stripeAccountId: assignment.artisan.stripeAccountId,
        },
      });
      payoutId = payout.id;
    }
    const totals = await this.ledger.post(
      tx,
      { jobId, paymentId: payment.id, payoutId: payoutId ?? undefined, actorId },
      [
        {
          from: 'ESCROW',
          to: 'ARTISAN_PAYABLE',
          amountCents: completion,
          memo:
            trigger === 'AUTO_RELEASE'
              ? 'Completion payout (auto-release)'
              : 'Completion payout (client confirmed)',
        },
        {
          from: 'ESCROW',
          to: 'PLATFORM_COMMISSION',
          amountCents: quote.commissionCents,
          memo: 'Jiko commission',
        },
      ],
    );
    if (totals.escrowCents !== 0)
      throw new Error(`Escrow not empty after release for job ${jobId}`);
    await this.moveEscrow(tx, payment, 'released');
    await this.refreshCompletionStats(tx, assignment.artisanId);
    return payoutId;
  }

  private async refreshCompletionStats(tx: Tx, artisanId: string) {
    const [completed, accepted] = await Promise.all([
      tx.assignment.count({
        where: { artisanId, acceptedAt: { not: null }, job: { status: 'COMPLETED' } },
      }),
      tx.assignment.count({
        where: {
          artisanId,
          acceptedAt: { not: null },
          job: { status: { in: ['COMPLETED', 'REFUNDED', 'CANCELLED', 'DISPUTED'] } },
        },
      }),
    ]);
    await tx.artisanProfile.update({
      where: { id: artisanId },
      data: { jobsCompleted: completed, completionRate: accepted ? completed / accepted : 0 },
    });
  }

  // ─────────────────────────── payouts ───────────────────────────

  /** Sends a payout to the pro's Stripe account. Safe to call repeatedly (idempotency key). */
  async processPayout(payoutId: string): Promise<'SUCCEEDED' | 'PENDING' | 'FAILED' | 'SKIPPED'> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { artisan: true },
    });
    if (!payout || payout.status === 'SUCCEEDED' || payout.status === 'REVERSED') return 'SKIPPED';
    const account = payout.artisan.stripeAccountId;
    if (!account || !payout.artisan.payoutsEnabled) {
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: { failureReason: 'Waiting for the pro to finish payout setup' },
      });
      return 'PENDING';
    }
    if (payout.attempts >= this.env.MAX_PAYOUT_ATTEMPTS) return 'FAILED';
    const claimed = await this.prisma.payout.updateMany({
      where: { id: payoutId, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, stripeAccountId: account },
    });
    if (claimed.count !== 1) return 'SKIPPED'; // another worker has it

    try {
      const { transferId } = await this.gateway.createTransfer({
        amountCents: payout.amountCents,
        destinationAccountId: account,
        transferGroup: payout.jobId,
        idempotencyKey: payout.transferReference,
        description:
          payout.trigger === 'MATERIALS_ADVANCE' ? 'Jiko materials advance' : 'Jiko job payout',
      });
      await this.prisma.$transaction(async (tx) => {
        await tx.payout.update({
          where: { id: payoutId },
          data: {
            status: 'SUCCEEDED',
            stripeTransferId: transferId,
            completedAt: new Date(),
            failureReason: null,
          },
        });
        await this.ledger.post(tx, { jobId: payout.jobId, paymentId: payout.paymentId, payoutId }, [
          {
            from: 'ARTISAN_PAYABLE',
            to: 'ARTISAN_PAID_OUT',
            amountCents: payout.amountCents,
            memo: `Transfer ${transferId} to pro`,
          },
        ]);
      });
      return 'SUCCEEDED';
    } catch (e) {
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: { status: 'FAILED', failureReason: (e as Error).message.slice(0, 300) },
      });
      this.logger.error(`Payout ${payoutId} failed: ${(e as Error).message}`);
      return 'FAILED';
    }
  }

  /** Retries pending/failed payouts (e.g. after the pro finishes setup). Run by the scheduler. */
  async retryPayouts(): Promise<number> {
    const due = await this.prisma.payout.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        attempts: { lt: this.env.MAX_PAYOUT_ATTEMPTS },
        artisan: { payoutsEnabled: true },
      },
      select: { id: true },
      take: 100,
    });
    let ok = 0;
    for (const p of due) if ((await this.processPayout(p.id)) === 'SUCCEEDED') ok++;
    return ok;
  }

  /** Stripe reversed a transfer: money is back in Jiko's balance and owed to the pro again. */
  async onTransferReversed(transferId: string) {
    const payout = await this.prisma.payout.findUnique({ where: { stripeTransferId: transferId } });
    if (!payout || payout.status === 'REVERSED') return;
    await this.prisma.$transaction(async (tx) => {
      await tx.payout.update({ where: { id: payout.id }, data: { status: 'REVERSED' } });
      await this.ledger.post(
        tx,
        { jobId: payout.jobId, paymentId: payout.paymentId, payoutId: payout.id },
        [
          {
            from: 'ARTISAN_PAID_OUT',
            to: 'ARTISAN_PAYABLE',
            amountCents: payout.amountCents,
            memo: `Transfer ${transferId} reversed`,
          },
        ],
      );
      await this.audit.record(
        {
          actor: null,
          action: 'payout.reversed',
          entityType: 'Payout',
          entityId: payout.id,
          after: { transferId },
        },
        tx,
      );
    });
  }

  // ─────────────────────────── refunds ───────────────────────────

  /**
   * Refunds everything still in escrow. Admin action for a paid job that won't start
   * (refundBeforeStart), also used when money arrives for a job that is no longer payable.
   */
  async refundHeld(
    admin: AuthUser | null,
    jobId: string,
    reason: string,
    opts: { transitionJob: boolean; ctx?: RequestContext } = { transitionJob: true },
  ) {
    const refund = await this.prisma.$transaction(async (tx) => {
      const payment = await this.livePayment(tx, jobId);
      if (!payment || !FUNDS_HELD.includes(payment.status))
        throw new AppException(HttpStatus.CONFLICT, 'NOT_REFUNDABLE', 'No held funds to refund');
      if (opts.transitionJob) {
        await this.transitions.apply(tx, {
          jobId,
          action: 'refundBeforeStart',
          actor: 'ADMIN',
          actorId: admin?.id ?? null,
          note: reason,
        });
      }
      const { escrowCents } = await this.ledger.totals(tx, payment.id);
      const r = await tx.refund.create({
        data: {
          paymentId: payment.id,
          amountCents: escrowCents,
          reason,
          initiatedById: admin?.id ?? (await this.systemActorId(tx)),
        },
      });
      await this.ledger.post(
        tx,
        { jobId, paymentId: payment.id, refundId: r.id, actorId: admin?.id ?? null },
        [
          {
            from: 'ESCROW',
            to: 'CLIENT_REFUNDED',
            amountCents: escrowCents,
            memo: `Refund: ${reason}`,
          },
        ],
      );
      await this.moveEscrow(
        tx,
        payment,
        payment.status === 'HELD' ? 'refundedFull' : 'refundedPartial',
      );
      if (admin) {
        await this.audit.record(
          {
            actor: admin,
            action: 'payment.refund',
            entityType: 'JobRequest',
            entityId: jobId,
            after: { refundId: r.id, amountCents: escrowCents, reason },
            ctx: opts.ctx,
          },
          tx,
        );
      }
      return { ...r, paymentIntentId: payment.stripePaymentIntentId };
    });
    await this.sendRefund(refund.id, refund.paymentIntentId, refund.amountCents);
    return { refundId: refund.id, amountCents: refund.amountCents };
  }

  /** Refunds need an initiator; system-initiated ones are attributed to the first admin. */
  private async systemActorId(tx: Tx) {
    const admin = await tx.user.findFirstOrThrow({
      where: { roles: { has: 'ADMIN' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return admin.id;
  }

  private async sendRefund(refundId: string, paymentIntentId: string | null, amountCents: number) {
    if (!paymentIntentId) throw new Error(`Refund ${refundId} has no payment intent`);
    try {
      const r = await this.gateway.createRefund({
        paymentIntentId,
        amountCents,
        idempotencyKey: `refund-${refundId}`,
      });
      await this.onRefundStatus(refundId, r.refundId, r.status);
    } catch (e) {
      this.logger.error(`Refund ${refundId} call failed: ${(e as Error).message}`);
      await this.prisma.refund.update({ where: { id: refundId }, data: { status: 'PROCESSING' } }); // retried from the processor dashboard / webhook
    }
  }

  /** Final refund outcome (sync response or refund.updated webhook). A failure puts the money back in escrow. */
  async onRefundStatus(
    refundId: string | null,
    stripeRefundId: string,
    status: 'succeeded' | 'pending' | 'failed',
  ) {
    const refund = refundId
      ? await this.prisma.refund.findUnique({ where: { id: refundId } })
      : await this.prisma.refund.findUnique({ where: { stripeRefundId } });
    if (!refund || refund.status === 'SUCCEEDED' || refund.status === 'FAILED') return;
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.RefundUpdateInput = { stripeRefundId };
      if (status === 'succeeded')
        Object.assign(data, { status: 'SUCCEEDED', completedAt: new Date() });
      else if (status === 'pending') Object.assign(data, { status: 'PROCESSING' });
      else Object.assign(data, { status: 'FAILED', completedAt: new Date() });
      await tx.refund.update({ where: { id: refund.id }, data });
      if (status === 'failed') {
        const payment = await tx.payment.findUniqueOrThrow({ where: { id: refund.paymentId } });
        await this.ledger.post(
          tx,
          { jobId: payment.jobId, paymentId: payment.id, refundId: refund.id },
          [
            {
              from: 'CLIENT_REFUNDED',
              to: 'ESCROW',
              amountCents: refund.amountCents,
              memo: 'Refund failed at processor; funds back in escrow',
            },
          ],
        );
        await this.audit.record(
          {
            actor: null,
            action: 'refund.failed',
            entityType: 'Refund',
            entityId: refund.id,
            after: { stripeRefundId },
          },
          tx,
        );
      }
    });
  }

  // ─────────────────────────── pro payout setup ───────────────────────────

  async payoutOnboardingLink(user: AuthUser) {
    const profile = await this.prisma.artisanProfile.findUnique({
      where: { userId: user.id },
      include: { user: true },
    });
    if (!profile)
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_A_PRO', 'Pro profile not found');
    let accountId = profile.stripeAccountId;
    if (!accountId) {
      accountId = (
        await this.gateway.createConnectAccount({
          userId: user.id,
          phone: profile.user.phone,
          name: profile.displayName,
        })
      ).accountId;
      await this.prisma.artisanProfile.update({
        where: { id: profile.id },
        data: { stripeAccountId: accountId },
      });
    }
    return this.gateway.createOnboardingLink({
      accountId,
      refreshUrl: `${this.env.WEB_URL}/payouts/refresh`,
      returnUrl: `${this.env.WEB_URL}/payouts/done`,
    });
  }

  async onAccountUpdated(accountId: string, payoutsEnabled: boolean) {
    const r = await this.prisma.artisanProfile.updateMany({
      where: { stripeAccountId: accountId },
      data: { payoutsEnabled },
    });
    if (r.count && payoutsEnabled) await this.retryPayouts();
  }

  async payoutStatus(user: AuthUser) {
    const profile = await this.prisma.artisanProfile.findUnique({ where: { userId: user.id } });
    if (!profile)
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_A_PRO', 'Pro profile not found');
    const payouts = await this.prisma.payout.findMany({
      where: { artisanId: profile.id },
      include: { job: { select: { ref: true } } },
      orderBy: { initiatedAt: 'desc' },
      take: 50,
    });
    return {
      accountConnected: !!profile.stripeAccountId,
      payoutsEnabled: profile.payoutsEnabled,
      payouts: payouts.map((p) => ({
        id: p.id,
        jobRef: p.job.ref,
        amountCents: p.amountCents,
        trigger: p.trigger,
        status: p.status,
        initiatedAt: p.initiatedAt.toISOString(),
        completedAt: p.completedAt?.toISOString() ?? null,
        note: p.failureReason,
      })),
    };
  }
}
