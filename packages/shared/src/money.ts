/**
 * Money is always an integer number of kobo (₦1 = 100 kobo). Never use floats for amounts.
 * Basis points (bps): 1500 bps = 15%.
 */
export type Kobo = number;

export const MAX_KOBO = 2_147_483_647; // Postgres INT upper bound (≈ ₦21.4M)

export function assertKobo(value: number, label = 'amount'): asserts value is Kobo {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_KOBO) {
    throw new RangeError(`${label} must be a non-negative integer number of kobo, got ${value}`);
  }
}

/** Parse a naira string like "12,500.50" into kobo without floating-point arithmetic. */
export function nairaToKobo(naira: string): Kobo {
  const clean = naira.replace(/[₦,\s]/g, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(clean);
  if (!m) throw new RangeError(`Invalid naira amount: "${naira}"`);
  const kobo = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  assertKobo(kobo);
  return kobo;
}

/** Format kobo for display: 1250050 → "₦12,500.50"; whole naira drop the decimals. */
export function formatKobo(kobo: Kobo): string {
  assertKobo(kobo);
  const naira = Math.floor(kobo / 100);
  const k = kobo % 100;
  const whole = naira.toLocaleString('en-NG');
  return k === 0 ? `₦${whole}` : `₦${whole}.${String(k).padStart(2, '0')}`;
}

/** amount × bps / 10000, rounded half-up, integer-only. */
export function applyBps(amount: Kobo, bps: number): Kobo {
  assertKobo(amount);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new RangeError(`Invalid bps ${bps}`);
  return Math.floor((amount * bps + 5_000) / 10_000);
}

export interface QuotePolicy {
  /** Platform commission on the whole quote, in basis points (1500 = 15%). */
  commissionBps: number;
  /** Max materials released when the job starts; the rest is held until completion. */
  materialsAdvanceCapKobo: Kobo;
  /** Quotes whose materials exceed this share of the total need admin approval (7000 = 70%). */
  materialsReviewThresholdBps: number;
}

export const DEFAULT_QUOTE_POLICY: QuotePolicy = {
  commissionBps: 1500,
  materialsAdvanceCapKobo: 15_000_000, // ₦150,000
  materialsReviewThresholdBps: 7000,
};

export interface QuoteSplit {
  totalKobo: Kobo;
  commissionKobo: Kobo;
  /** Commission taken from labour (always first). */
  commissionFromLabourKobo: Kobo;
  /** Only when labour can't cover the commission: the shortfall, taken from materials. */
  commissionFromMaterialsKobo: Kobo;
  artisanPayoutKobo: Kobo;
  /** Released when the artisan starts on site: materials net of any shortfall, capped. */
  materialsAdvanceKobo: Kobo;
  /** Released on completion: labour net of commission + materials above the cap. */
  completionPayoutKobo: Kobo;
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
  labourKobo: Kobo,
  materialsKobo: Kobo,
  policy: QuotePolicy = DEFAULT_QUOTE_POLICY,
): QuoteSplit {
  assertKobo(labourKobo, 'labourKobo');
  assertKobo(materialsKobo, 'materialsKobo');
  assertKobo(policy.materialsAdvanceCapKobo, 'materialsAdvanceCapKobo');
  const totalKobo = labourKobo + materialsKobo;
  assertKobo(totalKobo, 'totalKobo');

  const commissionKobo = applyBps(totalKobo, policy.commissionBps);
  const commissionFromLabourKobo = Math.min(commissionKobo, labourKobo);
  const commissionFromMaterialsKobo = commissionKobo - commissionFromLabourKobo;
  const materialsNet = materialsKobo - commissionFromMaterialsKobo;
  const materialsAdvanceKobo = Math.min(materialsNet, policy.materialsAdvanceCapKobo);
  const completionPayoutKobo =
    labourKobo - commissionFromLabourKobo + (materialsNet - materialsAdvanceKobo);

  return {
    totalKobo,
    commissionKobo,
    commissionFromLabourKobo,
    commissionFromMaterialsKobo,
    artisanPayoutKobo: totalKobo - commissionKobo,
    materialsAdvanceKobo,
    completionPayoutKobo,
    requiresAdminReview:
      totalKobo > 0 && materialsKobo * 10_000 > totalKobo * policy.materialsReviewThresholdBps,
  };
}
