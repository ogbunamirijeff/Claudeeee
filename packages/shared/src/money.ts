/**
 * Money is always an integer number of US cents ($1 = 100 cents). Never use floats for amounts.
 * Basis points (bps): 1500 bps = 15%.
 */
export type Cents = number;

export const MAX_CENTS = 2_147_483_647; // Postgres INT upper bound (≈ $21.4M)

export function assertCents(value: number, label = 'amount'): asserts value is Cents {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CENTS) {
    throw new RangeError(`${label} must be a non-negative integer number of cents, got ${value}`);
  }
}

/** Parse a dollar string like "1,250.50" or "$19.99" into cents without floating-point arithmetic. */
export function dollarsToCents(dollars: string): Cents {
  const clean = dollars.replace(/[$,\s]/g, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(clean);
  if (!m) throw new RangeError(`Invalid dollar amount: "${dollars}"`);
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  assertCents(cents);
  return cents;
}

/** Format cents for display: 125050 → "$1,250.50"; whole dollars drop the decimals. */
export function formatCents(cents: Cents): string {
  assertCents(cents);
  const dollars = Math.floor(cents / 100);
  const c = cents % 100;
  const whole = dollars.toLocaleString('en-US');
  return c === 0 ? `$${whole}` : `$${whole}.${String(c).padStart(2, '0')}`;
}

/** amount × bps / 10000, rounded half-up, integer-only. */
export function applyBps(amount: Cents, bps: number): Cents {
  assertCents(amount);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new RangeError(`Invalid bps ${bps}`);
  return Math.floor((amount * bps + 5_000) / 10_000);
}

export interface QuotePolicy {
  /** Platform commission on the whole quote, in basis points (1500 = 15%). */
  commissionBps: number;
  /** Max materials released when the job starts; the rest is held until completion. */
  materialsAdvanceCapCents: Cents;
  /** Quotes whose materials exceed this share of the total need admin approval (7000 = 70%). */
  materialsReviewThresholdBps: number;
}

export const DEFAULT_QUOTE_POLICY: QuotePolicy = {
  commissionBps: 1500,
  materialsAdvanceCapCents: 50_000, // $500
  materialsReviewThresholdBps: 7000,
};

export interface QuoteSplit {
  totalCents: Cents;
  commissionCents: Cents;
  /** Commission taken from labour (always first). */
  commissionFromLabourCents: Cents;
  /** Only when labour can't cover the commission: the shortfall, taken from materials. */
  commissionFromMaterialsCents: Cents;
  artisanPayoutCents: Cents;
  /** Released when the artisan starts on site: materials net of any shortfall, capped. */
  materialsAdvanceCents: Cents;
  /** Released on completion: labour net of commission + materials above the cap. */
  completionPayoutCents: Cents;
  /** True when materials exceed the review threshold → admin must approve before payment. */
  requiresAdminReview: boolean;
}

/**
 * How a quote's money is split.
 * - Commission is charged on the whole quote and taken from labour first; if labour can't cover
 *   it, only the shortfall comes out of materials.
 * - Materials (net of any shortfall) are advanced at job start, up to the cap.
 * Invariant: materialsAdvance + completionPayout + commission === total.
 */
export function splitQuote(
  labourCents: Cents,
  materialsCents: Cents,
  policy: QuotePolicy = DEFAULT_QUOTE_POLICY,
): QuoteSplit {
  assertCents(labourCents, 'labourCents');
  assertCents(materialsCents, 'materialsCents');
  assertCents(policy.materialsAdvanceCapCents, 'materialsAdvanceCapCents');
  const totalCents = labourCents + materialsCents;
  assertCents(totalCents, 'totalCents');

  const commissionCents = applyBps(totalCents, policy.commissionBps);
  const commissionFromLabourCents = Math.min(commissionCents, labourCents);
  const commissionFromMaterialsCents = commissionCents - commissionFromLabourCents;
  const materialsNet = materialsCents - commissionFromMaterialsCents;
  const materialsAdvanceCents = Math.min(materialsNet, policy.materialsAdvanceCapCents);
  const completionPayoutCents =
    labourCents - commissionFromLabourCents + (materialsNet - materialsAdvanceCents);

  return {
    totalCents,
    commissionCents,
    commissionFromLabourCents,
    commissionFromMaterialsCents,
    artisanPayoutCents: totalCents - commissionCents,
    materialsAdvanceCents,
    completionPayoutCents,
    requiresAdminReview:
      totalCents > 0 && materialsCents * 10_000 > totalCents * policy.materialsReviewThresholdBps,
  };
}
