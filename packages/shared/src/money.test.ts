import { applyBps, formatKobo, nairaToKobo, splitQuote } from './money';

describe('money', () => {
  it('parses naira strings without float error', () => {
    expect(nairaToKobo('12,500.50')).toBe(1_250_050);
    expect(nairaToKobo('₦0.1')).toBe(10);
    expect(nairaToKobo('19.99')).toBe(1999);
    expect(() => nairaToKobo('1.234')).toThrow();
    expect(() => nairaToKobo('-5')).toThrow();
  });

  it('formats kobo', () => {
    expect(formatKobo(1_250_050)).toBe('₦12,500.50');
    expect(formatKobo(500_000)).toBe('₦5,000');
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
    materialsAdvanceCapKobo: 15_000_000,
    materialsReviewThresholdBps: 7000,
  };

  it('takes commission from labour first and advances materials in full', () => {
    const s = splitQuote(2_000_000, 1_500_000, policy); // ₦20k labour + ₦15k materials
    expect(s).toEqual({
      totalKobo: 3_500_000,
      commissionKobo: 525_000,
      commissionFromLabourKobo: 525_000,
      commissionFromMaterialsKobo: 0,
      artisanPayoutKobo: 2_975_000,
      materialsAdvanceKobo: 1_500_000,
      completionPayoutKobo: 1_475_000,
      requiresAdminReview: false,
    });
  });

  it('takes only the shortfall from materials when labour cannot cover commission', () => {
    const s = splitQuote(200_000, 5_000_000, policy); // ₦2k labour + ₦50k materials
    expect(s.commissionKobo).toBe(780_000);
    expect(s.commissionFromLabourKobo).toBe(200_000);
    expect(s.commissionFromMaterialsKobo).toBe(580_000);
    expect(s.materialsAdvanceKobo).toBe(4_420_000);
    expect(s.completionPayoutKobo).toBe(0);
    expect(s.requiresAdminReview).toBe(true);
  });

  it('caps the materials advance and holds the excess until completion', () => {
    const s = splitQuote(10_000_000, 20_000_000, policy); // ₦100k labour + ₦200k materials
    expect(s.materialsAdvanceKobo).toBe(15_000_000);
    expect(s.commissionFromMaterialsKobo).toBe(0);
    expect(s.completionPayoutKobo).toBe(10_000_000 - 4_500_000 + 5_000_000);
  });

  it('flags quotes where materials are more than 70% of the total', () => {
    expect(splitQuote(300_000, 700_000, policy).requiresAdminReview).toBe(false); // exactly 70%
    expect(splitQuote(299_999, 700_001, policy).requiresAdminReview).toBe(true);
    expect(splitQuote(0, 0, policy).requiresAdminReview).toBe(false);
  });

  it('keeps the invariant and never goes negative across many amounts and caps', () => {
    for (const cap of [0, 50_000, 15_000_000]) {
      for (let labour = 0; labour <= 60_000; labour += 917) {
        for (let materials = 0; materials <= 90_000; materials += 1_231) {
          const s = splitQuote(labour, materials, { ...policy, materialsAdvanceCapKobo: cap });
          expect(s.materialsAdvanceKobo + s.completionPayoutKobo + s.commissionKobo).toBe(
            s.totalKobo,
          );
          expect(s.commissionFromLabourKobo + s.commissionFromMaterialsKobo).toBe(s.commissionKobo);
          expect(s.materialsAdvanceKobo).toBeGreaterThanOrEqual(0);
          expect(s.materialsAdvanceKobo).toBeLessThanOrEqual(Math.min(cap, materials));
          expect(s.completionPayoutKobo).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
