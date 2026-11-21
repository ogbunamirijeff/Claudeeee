import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { Public } from '../../common/decorators/access.decorators';
import { AppException } from '../../common/http/app-exception';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhooksService } from './webhooks.service';

const Complete = z.object({ sessionId: z.string().startsWith('cs_test_fake_') });
const Enable = z.object({ accountId: z.string().startsWith('acct_fake_') });

/**
 * Development stand-ins for Stripe's hosted pages, active only with PAYMENTS_PROVIDER=fake outside
 * production. Like Stripe's pages they need no Jiko login: the unguessable session/account id is
 * the credential. They emit the same signed webhook events Stripe would, through the real handler.
 */
@Controller('dev/payments')
@Public()
export class DevPaymentsController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private guard() {
    if (this.env.PAYMENTS_PROVIDER !== 'fake' || this.env.NODE_ENV === 'production') {
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');
    }
  }

  private async emit(type: string, object: Record<string, unknown>) {
    const payload = JSON.stringify({
      id: `evt_fake_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type,
      data: { object },
    });
    return this.webhooks.handle(Buffer.from(payload), this.webhooks.sign(payload));
  }

  @Post('checkout/complete')
  @HttpCode(200)
  async completeCheckout(@Body(new ZodPipe(Complete)) body: z.output<typeof Complete>) {
    this.guard();
    const payment = await this.prisma.payment.findUnique({
      where: { checkoutSessionId: body.sessionId },
    });
    if (!payment) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Checkout not found');
    await this.emit('checkout.session.completed', {
      id: body.sessionId,
      object: 'checkout.session',
      payment_status: 'paid',
      amount_total: payment.amountCents,
      currency: 'usd',
      payment_intent: `pi_fake_${payment.id}`,
    });
    return { jobId: payment.jobId };
  }

  @Post('payouts/enable')
  @HttpCode(200)
  async enablePayouts(@Body(new ZodPipe(Enable)) body: z.output<typeof Enable>) {
    this.guard();
    const profile = await this.prisma.artisanProfile.findUnique({
      where: { stripeAccountId: body.accountId },
    });
    if (!profile) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Account not found');
    await this.emit('account.updated', {
      id: body.accountId,
      object: 'account',
      payouts_enabled: true,
      charges_enabled: false,
    });
    return { payoutsEnabled: true };
  }
}
