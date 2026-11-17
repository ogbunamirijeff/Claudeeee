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

  it('splits a quote: 15% on the whole quote, materials advanced in full', () => {
    const s = splitQuote(2_000_000, 1_500_000, 1500); // ₦20k labour + ₦15k materials
    expect(s).toEqual({
      totalKobo: 3_500_000,
      commissionKobo: 525_000,
      artisanPayoutKobo: 2_975_000,
      materialsAdvanceKobo: 1_500_000,
      completionPayoutKobo: 1_475_000,
    });
    expect(s.materialsAdvanceKobo + s.completionPayoutKobo + s.commissionKobo).toBe(s.totalKobo);
  });

  it('keeps the split invariant for many amounts', () => {
    for (let labour = 0; labour <= 50_000; labour += 777) {
      for (let materials = 0; materials <= 40_000; materials += 1_231) {
        let s;
        try {
          s = splitQuote(labour, materials, 1500);
        } catch {
          continue;
        }
        expect(s.materialsAdvanceKobo + s.completionPayoutKobo + s.commissionKobo).toBe(s.totalKobo);
        expect(s.completionPayoutKobo).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('rejects quotes where labour cannot cover commission', () => {
    expect(() => splitQuote(100, 100_000, 1500)).toThrow(/Labour must be at least/);
  });
});
