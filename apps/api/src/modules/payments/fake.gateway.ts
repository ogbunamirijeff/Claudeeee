import { randomUUID } from 'node:crypto';
import type { CheckoutRequest, PaymentGateway, TransferRequest } from './gateway';

/**
 * Development/test stand-in for Stripe. Calls succeed instantly and are idempotent per key, like
 * Stripe's. Checkout and onboarding "pages" are dev pages in the web app that ask the API to emit
 * properly signed webhook events. Refused in production by config validation.
 */
export class FakeGateway implements PaymentGateway {
  readonly name = 'fake' as const;
  private readonly byKey = new Map<string, unknown>();
  /** Test hooks */
  failTransfers = 0;
  refundOutcome: 'succeeded' | 'pending' | 'failed' = 'succeeded';
  readonly transfers: TransferRequest[] = [];

  constructor(private readonly webUrl: string) {}

  private once<T>(key: string, make: () => T): T {
    if (!this.byKey.has(key)) this.byKey.set(key, make());
    return this.byKey.get(key) as T;
  }

  createCheckout(r: CheckoutRequest) {
    return Promise.resolve(
      this.once(r.idempotencyKey, () => {
        const sessionId = `cs_test_fake_${randomUUID().replace(/-/g, '')}`;
        return { sessionId, url: `${this.webUrl}/dev/checkout?session=${sessionId}` };
      }),
    );
  }

  expireCheckout() {
    return Promise.resolve();
  }

  /** Stripe's standard US card pricing: 2.9% + 30¢. */
  getProcessingFee(_paymentIntentId: string, amountCents?: number) {
    return Promise.resolve(amountCents === undefined ? null : Math.round(amountCents * 0.029) + 30);
  }

  createTransfer(r: TransferRequest) {
    if (this.failTransfers > 0) {
      this.failTransfers--;
      return Promise.reject(new Error('Simulated transfer failure'));
    }
    return Promise.resolve(
      this.once(r.idempotencyKey, () => {
        this.transfers.push(r);
        return { transferId: `tr_fake_${randomUUID().slice(0, 12)}` };
      }),
    );
  }

  createRefund(r: { paymentIntentId: string; amountCents: number; idempotencyKey: string }) {
    return Promise.resolve(
      this.once(r.idempotencyKey, () => ({
        refundId: `re_fake_${randomUUID().slice(0, 12)}`,
        status: this.refundOutcome,
      })),
    );
  }

  createConnectAccount(r: { userId: string }) {
    return Promise.resolve(
      this.once(`acct-${r.userId}`, () => ({
        accountId: `acct_fake_${randomUUID().slice(0, 12)}`,
      })),
    );
  }

  createOnboardingLink(r: { accountId: string }) {
    return Promise.resolve({ url: `${this.webUrl}/dev/payouts?account=${r.accountId}` });
  }
}
