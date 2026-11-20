/**
 * Everything Jiko needs from the payment processor. Stripe in production (Checkout + Connect
 * "separate charges and transfers"); a fake for development and tests.
 */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface CheckoutRequest {
  paymentId: string;
  jobId: string;
  jobRef: string;
  description: string;
  amountCents: number;
  /** Idempotency key: retrying with the same key never creates a second session. */
  idempotencyKey: string;
  successUrl: string;
  cancelUrl: string;
}

export interface TransferRequest {
  amountCents: number;
  destinationAccountId: string;
  /** Groups the charge and its transfers in Stripe (we use the job id). */
  transferGroup: string;
  idempotencyKey: string;
  description: string;
}

export interface PaymentGateway {
  readonly name: 'stripe' | 'fake';
  createCheckout(r: CheckoutRequest): Promise<{ sessionId: string; url: string }>;
  expireCheckout(sessionId: string): Promise<void>;
  /** Processing fee in cents for a captured PaymentIntent (from its balance transaction). */
  getProcessingFee(paymentIntentId: string, amountCents: number): Promise<number | null>;
  createTransfer(r: TransferRequest): Promise<{ transferId: string }>;
  createRefund(r: {
    paymentIntentId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<{ refundId: string; status: 'succeeded' | 'pending' | 'failed' }>;
  createConnectAccount(r: {
    userId: string;
    phone: string;
    name: string | null;
  }): Promise<{ accountId: string }>;
  createOnboardingLink(r: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
}

/** Minimal shape of the Stripe events we consume (also produced by the fake for dev/tests). */
export interface GatewayEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> & { id: string } };
}
