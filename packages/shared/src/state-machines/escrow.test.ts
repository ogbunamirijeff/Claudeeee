import { PaymentStatus } from '../enums';
import { escrowTransition, TERMINAL_PAYMENT_STATUSES, type EscrowEvent } from './escrow';

const ALL = Object.keys(PaymentStatus) as PaymentStatus[];
const EVENTS: EscrowEvent[] = [
  'captured',
  'failed',
  'abandoned',
  'advanceReleased',
  'released',
  'refundedFull',
  'refundedPartial',
];

describe('escrow state machine', () => {
  it('happy path: captured → materials advance → released', () => {
    expect(escrowTransition('INITIALIZED', 'captured')).toBe('HELD');
    expect(escrowTransition('HELD', 'advanceReleased')).toBe('PARTIALLY_RELEASED');
    expect(escrowTransition('PARTIALLY_RELEASED', 'released')).toBe('RELEASED');
  });

  it('jobs without materials release straight from HELD', () => {
    expect(escrowTransition('HELD', 'released')).toBe('RELEASED');
  });

  it('refunds only while funds are held', () => {
    expect(escrowTransition('HELD', 'refundedFull')).toBe('REFUNDED');
    expect(escrowTransition('PARTIALLY_RELEASED', 'refundedPartial')).toBe('PARTIALLY_REFUNDED');
    expect(escrowTransition('RELEASED', 'refundedFull')).toBeNull();
    expect(escrowTransition('INITIALIZED', 'refundedFull')).toBeNull();
  });

  it('cannot capture twice (duplicate webhooks are no-ops upstream)', () => {
    expect(escrowTransition('HELD', 'captured')).toBeNull();
  });

  it('terminal states accept no events', () => {
    for (const s of TERMINAL_PAYMENT_STATUSES)
      for (const e of EVENTS) expect(escrowTransition(s, e)).toBeNull();
  });

  it('every non-terminal status has a way forward', () => {
    for (const s of ALL.filter((x) => !TERMINAL_PAYMENT_STATUSES.includes(x))) {
      expect(EVENTS.some((e) => escrowTransition(s, e) !== null)).toBe(true);
    }
  });
});
