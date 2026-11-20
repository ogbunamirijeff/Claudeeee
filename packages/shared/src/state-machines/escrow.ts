import type { PaymentStatus } from '../enums';

/**
 * Held-funds (escrow) state machine for a job payment.
 *
 *   INITIALIZED ──captured──▶ HELD ──advanceReleased──▶ PARTIALLY_RELEASED ──released──▶ RELEASED
 *        │                     │                              │
 *        ├─failed──▶ FAILED    ├─released──▶ RELEASED         ├─refundedFull──▶ REFUNDED (admin override)
 *        └─abandoned─▶ ABANDONED├─refundedFull──▶ REFUNDED    └─refundedPartial─▶ PARTIALLY_REFUNDED
 *                              └─refundedPartial──▶ PARTIALLY_REFUNDED
 */
export type EscrowEvent =
  | 'captured'
  | 'failed'
  | 'abandoned'
  | 'advanceReleased'
  | 'released'
  | 'refundedFull'
  | 'refundedPartial';

const TABLE: Record<EscrowEvent, Partial<Record<PaymentStatus, PaymentStatus>>> = {
  captured: { INITIALIZED: 'HELD' },
  failed: { INITIALIZED: 'FAILED' },
  abandoned: { INITIALIZED: 'ABANDONED' },
  advanceReleased: { HELD: 'PARTIALLY_RELEASED' },
  released: { HELD: 'RELEASED', PARTIALLY_RELEASED: 'RELEASED' },
  refundedFull: { HELD: 'REFUNDED', PARTIALLY_RELEASED: 'REFUNDED' },
  refundedPartial: { HELD: 'PARTIALLY_REFUNDED', PARTIALLY_RELEASED: 'PARTIALLY_REFUNDED' },
};

export function escrowTransition(from: PaymentStatus, event: EscrowEvent): PaymentStatus | null {
  return TABLE[event][from] ?? null;
}

/** Money can only leave escrow while the payment is in one of these states. */
export const FUNDS_HELD: readonly PaymentStatus[] = ['HELD', 'PARTIALLY_RELEASED'];

export const TERMINAL_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'RELEASED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'FAILED',
  'ABANDONED',
];
