import type { JobStatus, QuoteReviewStatus } from '../enums';

export type JobActor = 'CLIENT' | 'ARTISAN' | 'ADMIN' | 'SYSTEM';

/** Facts some transitions depend on. Only the fields a transition's guard reads are required. */
export interface JobContext {
  quoteReviewStatus?: QuoteReviewStatus;
  quoteMaterialsCents?: number;
  hasBeforePhoto?: boolean;
  hasAfterPhoto?: boolean;
  hasMaterialsReceipt?: boolean;
  autoReleaseAt?: Date | null;
  guaranteeExpiresAt?: Date | null;
  now?: Date;
}

interface TransitionDef {
  from: readonly JobStatus[];
  to: JobStatus;
  actors: readonly JobActor[];
  /** Returns a human-readable reason when the transition is not allowed, else null. */
  guard?: (ctx: JobContext) => string | null;
}

const PRE_PAYMENT: readonly JobStatus[] = [
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'ACCEPTED',
  'QUOTED',
  'AWAITING_PAYMENT',
];

export const JOB_TRANSITIONS = {
  assign: { from: ['PENDING_ASSIGNMENT'], to: 'ASSIGNED', actors: ['ADMIN'] },
  acceptOffer: { from: ['ASSIGNED'], to: 'ACCEPTED', actors: ['ARTISAN'] },
  declineOffer: { from: ['ASSIGNED'], to: 'PENDING_ASSIGNMENT', actors: ['ARTISAN'] },
  expireOffer: { from: ['ASSIGNED'], to: 'PENDING_ASSIGNMENT', actors: ['SYSTEM'] },
  withdrawAssignment: {
    from: ['ASSIGNED', 'ACCEPTED', 'QUOTED', 'AWAITING_PAYMENT'],
    to: 'PENDING_ASSIGNMENT',
    actors: ['ADMIN'],
  },
  submitQuote: { from: ['ACCEPTED', 'QUOTED'], to: 'QUOTED', actors: ['ARTISAN'] },
  approveQuote: { from: ['QUOTED'], to: 'AWAITING_PAYMENT', actors: ['CLIENT'] },
  rejectQuote: { from: ['QUOTED'], to: 'ACCEPTED', actors: ['CLIENT'] },
  /** Jiko review of a materials-heavy quote can reject it before or after the client approved. */
  rejectQuoteInReview: { from: ['QUOTED', 'AWAITING_PAYMENT'], to: 'ACCEPTED', actors: ['ADMIN'] },
  markPaid: {
    from: ['AWAITING_PAYMENT'],
    to: 'PAID',
    actors: ['SYSTEM'],
    guard: (c) =>
      c.quoteReviewStatus === 'PENDING' || c.quoteReviewStatus === 'REJECTED'
        ? 'Quote is awaiting Jiko review'
        : null,
  },
  startWork: {
    from: ['PAID'],
    to: 'IN_PROGRESS',
    actors: ['ARTISAN'],
    guard: (c) => (c.hasBeforePhoto ? null : 'Upload a before-photo from the site to start'),
  },
  submitWork: {
    from: ['IN_PROGRESS'],
    to: 'WORK_SUBMITTED',
    actors: ['ARTISAN'],
    guard: (c) => {
      if (!c.hasAfterPhoto) return 'Upload at least one after-photo';
      if ((c.quoteMaterialsCents ?? 0) > 0 && !c.hasMaterialsReceipt) {
        return 'Upload a photo of your materials receipt';
      }
      return null;
    },
  },
  confirmCompletion: { from: ['WORK_SUBMITTED'], to: 'COMPLETED', actors: ['CLIENT'] },
  autoRelease: {
    from: ['WORK_SUBMITTED'],
    to: 'COMPLETED',
    actors: ['SYSTEM'],
    guard: (c) =>
      c.autoReleaseAt && (c.now ?? new Date()) >= c.autoReleaseAt
        ? null
        : 'Auto-release time has not passed',
  },
  openDispute: {
    from: ['IN_PROGRESS', 'WORK_SUBMITTED'],
    to: 'DISPUTED',
    actors: ['CLIENT', 'ARTISAN', 'ADMIN'],
  },
  openWarrantyClaim: {
    from: ['COMPLETED'],
    to: 'DISPUTED',
    actors: ['CLIENT'],
    guard: (c) =>
      c.guaranteeExpiresAt && (c.now ?? new Date()) <= c.guaranteeExpiresAt
        ? null
        : 'The 7-day workmanship guarantee has ended',
  },
  resolveRelease: { from: ['DISPUTED'], to: 'COMPLETED', actors: ['ADMIN'] },
  resolveRefund: { from: ['DISPUTED'], to: 'REFUNDED', actors: ['ADMIN'] },
  orderRedo: { from: ['DISPUTED'], to: 'IN_PROGRESS', actors: ['ADMIN'] },
  cancel: { from: PRE_PAYMENT, to: 'CANCELLED', actors: ['CLIENT', 'ADMIN'] },
  refundBeforeStart: { from: ['PAID'], to: 'REFUNDED', actors: ['ADMIN'] },
} as const satisfies Record<string, TransitionDef>;

export type JobAction = keyof typeof JOB_TRANSITIONS;

export type TransitionResult =
  | { ok: true; from: JobStatus; to: JobStatus }
  | { ok: false; code: 'INVALID_STATE' | 'NOT_ALLOWED' | 'GUARD_FAILED'; reason: string };

export function checkJobTransition(
  action: JobAction,
  from: JobStatus,
  actor: JobActor,
  ctx: JobContext = {},
): TransitionResult {
  const def: TransitionDef = JOB_TRANSITIONS[action];
  if (!def.actors.includes(actor)) {
    return { ok: false, code: 'NOT_ALLOWED', reason: `${actor} cannot ${action}` };
  }
  if (!def.from.includes(from)) {
    return { ok: false, code: 'INVALID_STATE', reason: `Cannot ${action} a job that is ${from}` };
  }
  const blocked = def.guard?.(ctx) ?? null;
  if (blocked) return { ok: false, code: 'GUARD_FAILED', reason: blocked };
  return { ok: true, from, to: def.to };
}

/** Actions available to an actor from a status (UIs use this to decide which buttons to show). */
export function availableJobActions(from: JobStatus, actor: JobActor): JobAction[] {
  return (Object.keys(JOB_TRANSITIONS) as JobAction[]).filter((a) => {
    const def: TransitionDef = JOB_TRANSITIONS[a];
    return def.actors.includes(actor) && def.from.includes(from);
  });
}

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = ['REFUNDED', 'CANCELLED'];
/** Contact details stay masked between the parties until the client has paid. */
export const isPrePayment = (s: JobStatus) => PRE_PAYMENT.includes(s);
