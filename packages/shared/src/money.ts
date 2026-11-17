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

export interface QuoteSplit {
  totalKobo: Kobo;
  commissionKobo: Kobo;
  artisanPayoutKobo: Kobo;
  /** Released to the artisan when they start the job on site. */
  materialsAdvanceKobo: Kobo;
  /** Released to the artisan on completion (labour minus all commission). */
  completionPayoutKobo: Kobo;
}

/**
 * Commission is charged on the whole quote (labour + materials). The materials portion is
 * advanced in full when the job starts; all commission is taken from what remains in escrow.
 * Invariant: materialsAdvance + completionPayout + commission === total.
 */
export function splitQuote(labourKobo: Kobo, materialsKobo: Kobo, commissionBps: number): QuoteSplit {
  assertKobo(labourKobo, 'labourKobo');
  assertKobo(materialsKobo, 'materialsKobo');
  const totalKobo = labourKobo + materialsKobo;
  assertKobo(totalKobo, 'totalKobo');
  const commissionKobo = applyBps(totalKobo, commissionBps);
  if (commissionKobo > labourKobo) {
    // Otherwise the materials advance would leave escrow unable to cover commission.
    throw new RangeError('Labour must be at least the platform commission on the whole quote');
  }
  return {
    totalKobo,
    commissionKobo,
    artisanPayoutKobo: totalKobo - commissionKobo,
    materialsAdvanceKobo: materialsKobo,
    completionPayoutKobo: labourKobo - commissionKobo,
  };
}
