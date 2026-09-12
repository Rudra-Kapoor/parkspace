import { describe, expect, it } from 'vitest';
import {
  applyBasisPoints,
  computeBreakdown,
  formatPaise,
  formatPaiseCompact,
  MoneyError,
  paiseToRupees,
  rupeesToPaise,
  splitPaise,
  splitPaiseByWeights,
  sumPaise,
  assertPaise,
} from './money';

describe('assertPaise', () => {
  it('rejects a decimal rupee amount that leaked into the money layer', () => {
    // This is the bug the guard exists to catch: someone passes 12.5 meaning
    // rupees, and without the guard it silently becomes 12.5 paise.
    expect(() => assertPaise(12.5)).toThrow(MoneyError);
    expect(() => assertPaise(12.5)).toThrow(/integer number of paise/);
  });

  it('rejects NaN, Infinity and negatives', () => {
    expect(() => assertPaise(NaN)).toThrow(MoneyError);
    expect(() => assertPaise(Infinity)).toThrow(MoneyError);
    expect(() => assertPaise(-1)).toThrow(MoneyError);
  });

  it('accepts zero', () => {
    expect(() => assertPaise(0)).not.toThrow();
  });
});

describe('rupee conversion', () => {
  it('round-trips whole rupees', () => {
    expect(rupeesToPaise(300)).toBe(30_000);
    expect(paiseToRupees(30_000)).toBe(300);
  });

  it('rounds rather than truncates at the third decimal', () => {
    expect(rupeesToPaise(12.345)).toBe(1235);
    expect(rupeesToPaise(12.344)).toBe(1234);
  });

  it('handles the classic floating point case', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in binary floating point. Converting at
    // the boundary rather than carrying decimals is what avoids it.
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
  });
});

describe('applyBasisPoints', () => {
  it('computes a 10 percent commission', () => {
    expect(applyBasisPoints(30_000, 1000)).toBe(3000);
  });

  it('rounds half away from zero', () => {
    // 5 paise at 50 percent is 2.5, which rounds to 3.
    expect(applyBasisPoints(5, 5000)).toBe(3);
  });

  it('rejects a fractional rate, which is how a percent gets passed by mistake', () => {
    expect(() => applyBasisPoints(30_000, 0.1)).toThrow(MoneyError);
  });
});

describe('splitPaise', () => {
  it('never loses or invents a paise', () => {
    const parts = splitPaise(100, 3);
    expect(parts).toEqual([34, 33, 33]);
    expect(sumPaise(...parts)).toBe(100);
  });

  it('handles an exact division', () => {
    expect(splitPaise(90, 3)).toEqual([30, 30, 30]);
  });

  it('handles a single part', () => {
    expect(splitPaise(7, 1)).toEqual([7]);
  });

  it('preserves the total for many random cases', () => {
    for (let i = 0; i < 200; i += 1) {
      const total = Math.floor(Math.random() * 1_000_000);
      const parts = 1 + Math.floor(Math.random() * 12);
      expect(sumPaise(...splitPaise(total, parts))).toBe(total);
    }
  });
});

describe('splitPaiseByWeights', () => {
  it('preserves the total using largest remainder', () => {
    const parts = splitPaiseByWeights(100, [1, 1, 1]);
    expect(sumPaise(...parts)).toBe(100);
  });

  it('weights proportionally', () => {
    expect(splitPaiseByWeights(1000, [3, 1])).toEqual([750, 250]);
  });

  it('falls back to an even split when all weights are zero', () => {
    expect(sumPaise(...splitPaiseByWeights(10, [0, 0, 0]))).toBe(10);
  });

  it('preserves the total for many random weightings', () => {
    for (let i = 0; i < 200; i += 1) {
      const total = Math.floor(Math.random() * 500_000);
      const weights = Array.from(
        { length: 1 + Math.floor(Math.random() * 8) },
        () => Math.floor(Math.random() * 100),
      );
      expect(sumPaise(...splitPaiseByWeights(total, weights))).toBe(total);
    }
  });
});

describe('computeBreakdown', () => {
  const rates = { commissionRateBp: 1000, serviceFeeRateBp: 500, taxRateBp: 1800 };

  it('computes the worked Rs 300 example from the business model', () => {
    const b = computeBreakdown({ baseAmount: 30_000, ...rates });

    expect(b.taxableAmount).toBe(30_000);
    expect(b.serviceFee).toBe(1500); // 5 percent of Rs 300 is Rs 15
    expect(b.taxAmount).toBe(270); // 18 percent of Rs 15 is Rs 2.70
    expect(b.totalAmount).toBe(31_770); // driver pays Rs 317.70
    expect(b.hostCommission).toBe(3000); // Rs 30
    expect(b.hostPayout).toBe(27_000); // host receives Rs 270
    expect(b.platformRevenue).toBe(4500); // Rs 45
  });

  it('keeps the identity total = taxable + fee + tax', () => {
    const b = computeBreakdown({ baseAmount: 47_531, discountAmount: 1_234, ...rates });
    expect(b.totalAmount).toBe(b.taxableAmount + b.serviceFee + b.taxAmount);
  });

  it('keeps the identity base - discount = commission + payout', () => {
    const b = computeBreakdown({ baseAmount: 47_531, discountAmount: 1_234, ...rates });
    expect(b.hostCommission + b.hostPayout).toBe(b.baseAmount - b.discountAmount);
  });

  it('does not charge the host for a wallet credit', () => {
    // A wallet credit is the platform's promotional cost. The host must be paid
    // exactly as if the driver had paid cash.
    const withWallet = computeBreakdown({ baseAmount: 30_000, walletApplied: 10_000, ...rates });
    const withoutWallet = computeBreakdown({ baseAmount: 30_000, ...rates });

    expect(withWallet.hostPayout).toBe(withoutWallet.hostPayout);
    expect(withWallet.hostCommission).toBe(withoutWallet.hostCommission);
    // But the driver pays less, and the platform earns less on the fee.
    expect(withWallet.totalAmount).toBeLessThan(withoutWallet.totalAmount);
  });

  it('caps the wallet application at the amount actually owed', () => {
    const b = computeBreakdown({ baseAmount: 10_000, walletApplied: 999_999, ...rates });
    expect(b.walletApplied).toBe(10_000);
    expect(b.taxableAmount).toBe(0);
    expect(b.totalAmount).toBe(0);
  });

  it('rejects a discount larger than the base', () => {
    expect(() => computeBreakdown({ baseAmount: 100, discountAmount: 500, ...rates })).toThrow(
      MoneyError,
    );
  });

  it('never produces a negative component for any input', () => {
    for (let i = 0; i < 500; i += 1) {
      const baseAmount = Math.floor(Math.random() * 2_000_000);
      const discountAmount = Math.floor(Math.random() * (baseAmount + 1));
      const walletApplied = Math.floor(Math.random() * 500_000);
      const b = computeBreakdown({ baseAmount, discountAmount, walletApplied, ...rates });

      for (const [key, value] of Object.entries(b)) {
        expect(value, `${key} was negative for base=${baseAmount}`).toBeGreaterThanOrEqual(0);
      }
      expect(b.totalAmount).toBe(b.taxableAmount + b.serviceFee + b.taxAmount);
    }
  });
});

describe('formatting', () => {
  it('uses Indian digit grouping', () => {
    // 12,34,567 rupees, not 1,234,567.
    expect(formatPaise(123_456_700)).toBe('₹12,34,567');
  });

  it('shows paise only when they are non-zero', () => {
    expect(formatPaise(30_000)).toBe('₹300');
    expect(formatPaise(31_770)).toBe('₹317.70');
  });

  it('can be forced to show decimals', () => {
    expect(formatPaise(30_000, { showDecimals: true })).toBe('₹300.00');
  });

  it('compacts for map pins', () => {
    expect(formatPaiseCompact(5_000)).toBe('₹50');
    expect(formatPaiseCompact(150_000)).toBe('₹1.5k');
    expect(formatPaiseCompact(2_500_000)).toBe('₹25k');
    expect(formatPaiseCompact(15_000_000)).toBe('₹1.5L');
  });
});
