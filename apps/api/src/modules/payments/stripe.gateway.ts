import Stripe from 'stripe';
import type { CheckoutRequest, PaymentGateway, TransferRequest } from './gateway';

/** Stripe Checkout for collection, Connect Express + transfers for payouts. */
export class StripeGateway implements PaymentGateway {
  readonly name = 'stripe' as const;
  private readonly stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000 });
  }

  async createCheckout(r: CheckoutRequest) {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: r.amountCents,
              product_data: {
                name: `Jiko job ${r.jobRef}`,
                description: r.description.slice(0, 250),
              },
            },
          },
        ],
        payment_intent_data: {
          transfer_group: r.jobId,
          metadata: { jobId: r.jobId, paymentId: r.paymentId },
        },
        metadata: { jobId: r.jobId, paymentId: r.paymentId },
        client_reference_id: r.paymentId,
        success_url: r.successUrl,
        cancel_url: r.cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
      },
      { idempotencyKey: r.idempotencyKey },
    );
    if (!session.url) throw new Error('Stripe did not return a Checkout URL');
    return { sessionId: session.id, url: session.url };
  }

  async expireCheckout(sessionId: string) {
    await this.stripe.checkout.sessions.expire(sessionId).catch(() => undefined); // already completed/expired is fine
  }

  async getProcessingFee(paymentIntentId: string, _amountCents: number) {
    const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge.balance_transaction'],
    });
    const charge = pi.latest_charge;
    if (!charge || typeof charge === 'string') return null;
    const bt = charge.balance_transaction;
    return bt && typeof bt !== 'string' ? bt.fee : null;
  }

  async createTransfer(r: TransferRequest) {
    const t = await this.stripe.transfers.create(
      {
        amount: r.amountCents,
        currency: 'usd',
        destination: r.destinationAccountId,
        transfer_group: r.transferGroup,
        description: r.description,
      },
      { idempotencyKey: r.idempotencyKey },
    );
    return { transferId: t.id };
  }

  async createRefund(r: { paymentIntentId: string; amountCents: number; idempotencyKey: string }) {
    const refund = await this.stripe.refunds.create(
      { payment_intent: r.paymentIntentId, amount: r.amountCents },
      { idempotencyKey: r.idempotencyKey },
    );
    const status =
      refund.status === 'succeeded'
        ? 'succeeded'
        : refund.status === 'failed' || refund.status === 'canceled'
          ? 'failed'
          : 'pending';
    return { refundId: refund.id, status } as const;
  }

  async createConnectAccount(r: { userId: string; phone: string; name: string | null }) {
    const account = await this.stripe.accounts.create(
      {
        type: 'express',
        country: 'US',
        business_type: 'individual',
        capabilities: { transfers: { requested: true } },
        business_profile: {
          mcc: '1711',
          product_description: 'Home repair services booked through Jiko',
        }, // 1711: plumbing/HVAC contractors
        individual: { phone: r.phone },
        metadata: { userId: r.userId },
      },
      { idempotencyKey: `connect-account-${r.userId}` },
    );
    return { accountId: account.id };
  }

  async createOnboardingLink(r: { accountId: string; refreshUrl: string; returnUrl: string }) {
    const link = await this.stripe.accountLinks.create({
      account: r.accountId,
      type: 'account_onboarding',
      refresh_url: r.refreshUrl,
      return_url: r.returnUrl,
    });
    return { url: link.url };
  }
}
