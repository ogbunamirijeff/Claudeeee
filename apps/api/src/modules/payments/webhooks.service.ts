import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { AppException } from '../../common/http/app-exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { GatewayEvent } from './gateway';
import { PaymentsService } from './payments.service';

type Obj = Record<string, unknown>;
const str = (o: Obj, k: string) => (typeof o[k] === 'string' ? o[k] : null);

/**
 * Stripe webhooks: signature-verified with Stripe's library, stored once per event id, and
 * re-processable if a previous attempt failed (Stripe retries). Handlers are themselves
 * idempotent because they only move records forward from expected states.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  /** Used only for its webhook helpers (pure crypto; no network). */
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.stripe = new Stripe(env.STRIPE_SECRET_KEY ?? 'sk_test_webhook_verification_only');
  }

  verify(rawBody: Buffer | undefined, signature: string | undefined): GatewayEvent {
    if (!rawBody || !signature)
      throw new AppException(HttpStatus.BAD_REQUEST, 'WEBHOOK_SIGNATURE', 'Missing signature');
    try {
      return this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.env.STRIPE_WEBHOOK_SECRET,
      ) as unknown as GatewayEvent;
    } catch {
      throw new AppException(HttpStatus.BAD_REQUEST, 'WEBHOOK_SIGNATURE', 'Invalid signature');
    }
  }

  /** Signs a payload exactly as Stripe does (dev simulator and tests). */
  sign(payload: string): string {
    return this.stripe.webhooks.generateTestHeaderString({
      payload,
      secret: this.env.STRIPE_WEBHOOK_SECRET,
    });
  }

  async handle(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ received: true; duplicate?: true }> {
    const event = this.verify(rawBody, signature);
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { provider_eventKey: { provider: 'stripe', eventKey: event.id } },
    });
    if (existing?.processedAt) return { received: true, duplicate: true };
    if (!existing) {
      await this.prisma.webhookEvent
        .create({
          data: {
            provider: 'stripe',
            eventKey: event.id,
            eventType: event.type,
            payload: event,
          },
        })
        .catch(() => undefined); // a concurrent delivery inserted it first; processing below is idempotent
    }
    try {
      await this.dispatch(event);
      await this.prisma.webhookEvent.update({
        where: { provider_eventKey: { provider: 'stripe', eventKey: event.id } },
        data: { processedAt: new Date(), error: null },
      });
      return { received: true };
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.error(`Webhook ${event.type} ${event.id} failed: ${msg}`);
      await this.prisma.webhookEvent.update({
        where: { provider_eventKey: { provider: 'stripe', eventKey: event.id } },
        data: { error: msg.slice(0, 500) },
      });
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'WEBHOOK_FAILED',
        'Processing failed; Stripe will retry',
      );
    }
  }

  private async dispatch(event: GatewayEvent) {
    const o = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (str(o, 'payment_status') === 'paid') {
          await this.payments.onCheckoutPaid({
            sessionId: o.id,
            paymentIntentId: str(o, 'payment_intent') ?? '',
            amountTotal: Number(o.amount_total),
            currency: str(o, 'currency') ?? '',
          });
        }
        return;
      case 'checkout.session.expired':
        return this.payments.onCheckoutExpired(o.id);
      case 'checkout.session.async_payment_failed':
        return this.payments.onCheckoutFailed(o.id);
      case 'account.updated':
        return this.payments.onAccountUpdated(o.id, o.payouts_enabled === true);
      case 'transfer.reversed':
        return this.payments.onTransferReversed(o.id);
      case 'refund.updated':
      case 'refund.failed': {
        const s = str(o, 'status');
        return this.payments.onRefundStatus(
          null,
          o.id,
          s === 'succeeded'
            ? 'succeeded'
            : s === 'failed' || s === 'canceled'
              ? 'failed'
              : 'pending',
        );
      }
      default:
        return; // not used; acknowledged so Stripe stops retrying
    }
  }
}
