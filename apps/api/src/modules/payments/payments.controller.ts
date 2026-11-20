import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ReasonSchema } from '@jiko/shared';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';
import { CurrentUser, Public, Roles } from '../../common/decorators/access.decorators';
import { contextFrom, type AuthUser } from '../../common/http/request-context';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { WebhooksService } from './webhooks.service';

@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly webhooks: WebhooksService,
    private readonly prisma: PrismaService,
  ) {}

  /** Stripe → Jiko. Authenticated by the Stripe-Signature header, not a session. */
  @Post('webhooks/stripe')
  @Public()
  @HttpCode(200)
  stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    return this.webhooks.handle(req.rawBody, signature);
  }

  // Client
  @Post('jobs/:id/checkout')
  @Roles('CLIENT')
  checkout(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.createCheckout(user, id);
  }

  @Post('jobs/:id/confirm')
  @HttpCode(200)
  @Roles('CLIENT')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.confirmCompletion(user, id);
  }

  // Pro
  @Post('jobs/:id/start')
  @HttpCode(200)
  @Roles('ARTISAN')
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.startWork(user, id);
  }

  @Post('jobs/:id/submit-work')
  @HttpCode(200)
  @Roles('ARTISAN')
  submitWork(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.submitWork(user, id);
  }

  @Get('artisan/payouts')
  @Roles('ARTISAN')
  payoutStatus(@CurrentUser() user: AuthUser) {
    return this.payments.payoutStatus(user);
  }

  @Post('artisan/payouts/onboarding')
  @HttpCode(200)
  @Roles('ARTISAN')
  onboarding(@CurrentUser() user: AuthUser) {
    return this.payments.payoutOnboardingLink(user);
  }

  // Admin
  @Post('admin/jobs/:id/refund')
  @HttpCode(200)
  @Roles('ADMIN')
  refund(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(ReasonSchema)) body: z.output<typeof ReasonSchema>,
    @Req() req: Request,
  ) {
    return this.payments.refundHeld(admin, id, body.reason, {
      transitionJob: true,
      ctx: contextFrom(req),
    });
  }

  /** Payments ledger: held / released / refunded / paid out per payment, all derived from ledger lines. */
  @Get('admin/payments')
  @Roles('ADMIN')
  async listPayments() {
    const rows = await this.prisma.payment.findMany({
      where: { status: { notIn: ['ABANDONED'] } },
      include: { job: { select: { id: true, ref: true, status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const sums = await this.prisma.ledgerEntry.groupBy({
      by: ['paymentId', 'debitAccount', 'creditAccount'],
      where: { paymentId: { in: rows.map((r) => r.id) } },
      _sum: { amountCents: true },
    });
    const flow = (paymentId: string, test: (from: string, to: string) => boolean) =>
      sums
        .filter((x) => x.paymentId === paymentId && test(x.debitAccount, x.creditAccount))
        .reduce((a, x) => a + (x._sum.amountCents ?? 0), 0);
    return rows.map((p) => ({
      id: p.id,
      jobId: p.job.id,
      jobRef: p.job.ref,
      jobStatus: p.job.status,
      status: p.status,
      amountCents: p.amountCents,
      feesCents: p.feesCents,
      heldCents: flow(p.id, (_, to) => to === 'ESCROW') - flow(p.id, (from) => from === 'ESCROW'),
      releasedCents: p.releasedCents,
      refundedCents: p.refundedCents,
      commissionCents: flow(p.id, (f, t) => f === 'ESCROW' && t === 'PLATFORM_COMMISSION'),
      paidOutCents:
        flow(p.id, (_, t) => t === 'ARTISAN_PAID_OUT') -
        flow(p.id, (f) => f === 'ARTISAN_PAID_OUT'),
      awaitingPayoutCents:
        flow(p.id, (_, t) => t === 'ARTISAN_PAYABLE') - flow(p.id, (f) => f === 'ARTISAN_PAYABLE'),
      paidAt: p.paidAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    }));
  }

  @Get('admin/jobs/:id/ledger')
  @Roles('ADMIN')
  async jobLedger(@Param('id') id: string) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { jobId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return entries.map((e) => ({
      id: e.id,
      txnId: e.txnId,
      from: e.debitAccount,
      to: e.creditAccount,
      amountCents: e.amountCents,
      memo: e.memo,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}
