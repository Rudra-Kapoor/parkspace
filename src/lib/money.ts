/**
 * Money.
 *
 * Every amount in ParkSpace is an integer number of paise, held in a JavaScript
 * number. There are no floats and no decimal rupees anywhere below the
 * presentation layer.
 *
 * Why paise and not a decimal library: the largest amount this product will ever
 * represent is a monthly corporate invoice, comfortably under a crore of rupees,
 * which is 10^9 paise. JavaScript integers are exact to 2^53, about 9 x 10^15, so
 * we have six orders of magnitude of headroom. A decimal library would buy
 * nothing and cost a dependency.
 *
 * The one rule: never divide without deciding how to round, and never let a
 * rounded value feed back into a sum that is compared against an unrounded one.
 */

export type Paise = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Guard at every trust boundary. A non-integer paise value is a bug, not a value. */
export function assertPaise(value: unknown, label = 'amount'): asserts value is Paise {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MoneyError(`${label} must be a finite number, received ${String(value)}`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `${label} must be an integer number of paise, received ${value}. ` +
        `Rupee amounts must be converted with rupeesToPaise() before entering the money layer.`,
    );
  }
  if (value < 0) {
    throw new MoneyError(`${label} must not be negative, received ${value}`);
  }
}

export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) {
    throw new MoneyError(`Cannot convert ${rupees} to paise`);
  }
  // Multiply then round, never round then multiply. 12.345 rupees is 1235 paise.
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: Paise): number {
  assertPaise(paise);
  return paise / 100;
}

/**
 * Apply a rate expressed in basis points. 1000 bp is 10 percent.
 *
 * Basis points rather than a fraction because a rate stored as 0.1 in JSON and
 * read back as 0.09999999999999999 is a real thing that happens, and because
 * "1000" is unambiguous in a database column in a way "0.1" is not.
 */
export function applyBasisPoints(amount: Paise, basisPoints: number): Paise {
  assertPaise(amount);
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new MoneyError(`Basis points must be a non-negative integer, received ${basisPoints}`);
  }
  return Math.round((amount * basisPoints) / 10_000);
}

export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}

/**
 * Format for display. Uses the Indian digit grouping, so 1234567 paise reads as
 * Rs 12,345.67 rather than Rs 12,345.67 with western grouping.
 */
export function formatPaise(
  paise: Paise,
  options: { showDecimals?: boolean; symbol?: string } = {},
): string {
  assertPaise(paise);
  const { showDecimals = paise % 100 !== 0, symbol = '₹' } = options;

  const rupees = paise / 100;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(rupees);

  return `${symbol}${formatted}`;
}

/** Compact form for map pins, where horizontal space is scarce. */
export function formatPaiseCompact(paise: Paise): string {
  assertPaise(paise);
  const rupees = Math.round(paise / 100);
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(1)}L`;
  if (rupees >= 1_000) return `₹${(rupees / 1_000).toFixed(rupees >= 10_000 ? 0 : 1)}k`;
  return `₹${rupees}`;
}

export function sumPaise(...amounts: Paise[]): Paise {
  return amounts.reduce<Paise>((total, amount) => {
    assertPaise(amount);
    return total + amount;
  }, 0);
}

/**
 * Split an amount across n recipients without losing or inventing a paise.
 *
 * The naive approach, round(total / n) per recipient, either loses paise or
 * creates them. This distributes the remainder one paise at a time to the
 * earliest recipients, so the parts always sum exactly to the total.
 *
 * Used by the payout run when one settlement covers several bookings.
 */
export function splitPaise(total: Paise, parts: number): Paise[] {
  assertPaise(total);
  if (!Number.isInteger(parts) || parts < 1) {
    throw new MoneyError(`Cannot split into ${parts} parts`);
  }
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

/**
 * Split an amount by weights, preserving the total exactly.
 *
 * Largest-remainder method: floor every share, then hand the leftover paise to
 * whichever shares lost the most in the flooring. This is the same method used
 * for apportioning seats, and it is the correct one here for the same reason.
 */
export function splitPaiseByWeights(total: Paise, weights: number[]): Paise[] {
  assertPaise(total);
  if (weights.length === 0) return [];
  if (weights.some((w) => w < 0)) {
    throw new MoneyError('Weights must not be negative');
  }

  const weightTotal = weights.reduce((a, b) => a + b, 0);
  if (weightTotal === 0) return splitPaise(total, weights.length);

  const exact = weights.map((w) => (total * w) / weightTotal);
  const floored = exact.map(Math.floor);
  let remainder = total - floored.reduce((a, b) => a + b, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...floored];
  for (const { index } of order) {
    if (remainder <= 0) break;
    result[index] = (result[index] ?? 0) + 1;
    remainder -= 1;
  }

  return result;
}

/**
 * The canonical booking price breakdown.
 *
 * This mirrors quote_booking() in the database exactly. It exists on the client
 * so the checkout screen can show a live total while the user drags a time
 * slider, without a round trip per pixel.
 *
 * The server's number is always authoritative. This one is a preview, and the
 * checkout flow re-quotes against the database before taking any money.
 */
export interface PriceBreakdownInput {
  baseAmount: Paise;
  discountAmount?: Paise;
  walletApplied?: Paise;
  commissionRateBp: number;
  serviceFeeRateBp: number;
  taxRateBp: number;
}

export interface PriceBreakdown {
  baseAmount: Paise;
  discountAmount: Paise;
  walletApplied: Paise;
  taxableAmount: Paise;
  serviceFee: Paise;
  taxAmount: Paise;
  totalAmount: Paise;
  hostCommission: Paise;
  hostPayout: Paise;
  platformRevenue: Paise;
}

export function computeBreakdown(input: PriceBreakdownInput): PriceBreakdown {
  const {
    baseAmount,
    discountAmount = 0,
    walletApplied = 0,
    commissionRateBp,
    serviceFeeRateBp,
    taxRateBp,
  } = input;

  assertPaise(baseAmount, 'baseAmount');
  assertPaise(discountAmount, 'discountAmount');
  assertPaise(walletApplied, 'walletApplied');

  if (discountAmount > baseAmount) {
    throw new MoneyError('Discount cannot exceed the base amount');
  }

  const afterDiscount = baseAmount - discountAmount;
  const appliedWallet = Math.min(walletApplied, afterDiscount);
  const taxableAmount = afterDiscount - appliedWallet;

  const serviceFee = applyBasisPoints(taxableAmount, serviceFeeRateBp);
  const taxAmount = applyBasisPoints(serviceFee, taxRateBp);
  const totalAmount = taxableAmount + serviceFee + taxAmount;

  // Commission is charged on the pre-wallet amount. A wallet credit is the
  // platform's promotional cost and must not be taken out of the host's earnings.
  const hostCommission = applyBasisPoints(afterDiscount, commissionRateBp);
  const hostPayout = afterDiscount - hostCommission;

  return {
    baseAmount,
    discountAmount,
    walletApplied: appliedWallet,
    taxableAmount,
    serviceFee,
    taxAmount,
    totalAmount,
    hostCommission,
    hostPayout,
    platformRevenue: hostCommission + serviceFee,
  };
}
