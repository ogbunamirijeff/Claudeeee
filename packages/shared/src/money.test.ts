import { applyBps, dollarsToCents, formatCents, splitQuote } from './money';

describe('money', () => {
  it('parses dollar strings without float error', () => {
    expect(dollarsToCents('12,500.50')).toBe(1_250_050);
    expect(dollarsToCents('$0.1')).toBe(10);
    expect(dollarsToCents('19.99')).toBe(1999);
    expect(() => dollarsToCents('1.234')).toThrow();
    expect(() => dollarsToCents('-5')).toThrow();
  });

  it('formats cents', () => {
    expect(formatCents(1_250_050)).toBe('$12,500.50');
    expect(formatCents(500_000)).toBe('$5,000');
  });

  it('applies bps with half-up rounding', () => {
    expect(applyBps(10_000, 1500)).toBe(1500);
    expect(applyBps(3, 1500)).toBe(0); // 0.45 → 0
    expect(applyBps(10, 1500)).toBe(2); // 1.5 → 2
    expect(() => applyBps(100, 10_001)).toThrow();
    expect(() => applyBps(1.5, 1500)).toThrow();
  });

  const policy = {
    commissionBps: 1500,
    materialsAdvanceCapCents: 50_000, // $500
    materialsReviewThresholdBps: 7000,
  };

  it('takes commission from labour first and advances materials in full', () => {
    const s = splitQuote(20_000, 15_000, policy); // $200 labour + $150 materials
    expect(s).toEqual({
      totalCents: 35_000,
      commissionCents: 5_250,
      commissionFromLabourCents: 5_250,
      commissionFromMaterialsCents: 0,
      artisanPayoutCents: 29_750,
      materialsAdvanceCents: 15_000,
      completionPayoutCents: 14_750,
      requiresAdminReview: false,
    });
  });

  it('takes only the shortfall from materials when labour cannot cover commission', () => {
    const s = splitQuote(2_000, 40_000, policy); // $20 labour + $400 materials
    expect(s.commissionCents).toBe(6_300);
    expect(s.commissionFromLabourCents).toBe(2_000);
    expect(s.commissionFromMaterialsCents).toBe(4_300);
    expect(s.materialsAdvanceCents).toBe(35_700);
    expect(s.completionPayoutCents).toBe(0);
    expect(s.requiresAdminReview).toBe(true);
  });

  it('caps the materials advance at $500 and holds the excess until completion', () => {
    const s = splitQuote(40_000, 80_000, policy); // $400 labour + $800 materials
    expect(s.materialsAdvanceCents).toBe(50_000);
    expect(s.commissionFromMaterialsCents).toBe(0);
    expect(s.completionPayoutCents).toBe(40_000 - 18_000 + 30_000);
  });

  it('flags quotes where materials are more than 70% of the total', () => {
    expect(splitQuote(3_000, 7_000, policy).requiresAdminReview).toBe(false); // exactly 70%
    expect(splitQuote(2_999, 7_001, policy).requiresAdminReview).toBe(true);
    expect(splitQuote(0, 0, policy).requiresAdminReview).toBe(false);
  });

  it('keeps the invariant and never goes negative across many amounts and caps', () => {
    for (const cap of [0, 5_000, 50_000]) {
      for (let labour = 0; labour <= 60_000; labour += 917) {
        for (let materials = 0; materials <= 90_000; materials += 1_231) {
          const s = splitQuote(labour, materials, { ...policy, materialsAdvanceCapCents: cap });
          expect(s.materialsAdvanceCents + s.completionPayoutCents + s.commissionCents).toBe(
            s.totalCents,
          );
          expect(s.commissionFromLabourCents + s.commissionFromMaterialsCents).toBe(
            s.commissionCents,
          );
          expect(s.materialsAdvanceCents).toBeGreaterThanOrEqual(0);
          expect(s.materialsAdvanceCents).toBeLessThanOrEqual(Math.min(cap, materials));
          expect(s.completionPayoutCents).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
