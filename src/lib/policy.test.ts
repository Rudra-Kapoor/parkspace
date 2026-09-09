import { describe, expect, it } from 'vitest';
import { computeOverstay, computeRefund, isCheckInOpen, POLICY_CUTOFF_HOURS } from './policy';
import { computeBreakdown } from './money';
import type { CancellationPolicy } from './types';

/**
 * These tests encode the worked examples from docs/23_Refund_Policy.md against a
 * Rs 500 booking. If a number here changes, the document and the SQL in
 * migration 0009 must change with it.
 */

const RATES = { commissionRateBp: 1000, serviceFeeRateBp: 500, taxRateBp: 1800 };

/** A Rs 500 booking, priced through the same function the product uses. */
function rs500Booking() {
  const breakdown = computeBreakdown({ baseAmount: 50_000, ...RATES });
  return {
    baseAmount: breakdown.baseAmount,
    serviceFee: breakdown.serviceFee,
    taxAmount: breakdown.taxAmount,
    commissionRateBp: RATES.commissionRateBp,
    breakdown,
  };
}

describe('the Rs 500 reference booking', () => {
  it('matches the documented split', () => {
    const { breakdown } = rs500Booking();

    expect(breakdown.baseAmount).toBe(50_000); // Rs 500
    expect(breakdown.serviceFee).toBe(2_500); // Rs 25
    expect(breakdown.taxAmount).toBe(450); // Rs 4.50
    expect(breakdown.totalAmount).toBe(52_950); // driver pays Rs 529.50
    expect(breakdown.hostPayout).toBe(45_000); // host receives Rs 450
    expect(breakdown.platformRevenue).toBe(7_500); // Rs 75
  });
});

describe('flexible policy', () => {
  const booking = rs500Booking();

  it('refunds the parking charge in full before the 1 hour cutoff', () => {
    const outcome = computeRefund({
      ...booking,
      policy: 'flexible',
      hoursBeforeStart: 2,
      cancelledBy: 'driver',
    });

    expect(outcome.refundAmount).toBe(50_000);
    expect(outcome.forfeited).toBe(0);
    expect(outcome.serviceFeeRetained).toBe(2_500);
    expect(outcome.reason).toBe('before_cutoff');
  });

  it('refunds nothing after the cutoff', () => {
    // Deliberate: flexible is the most generous policy before its cutoff and the
    // strictest after it. A space released an hour ahead can be resold; one
    // released ten minutes ahead cannot.
    const outcome = computeRefund({
      ...booking,
      policy: 'flexible',
      hoursBeforeStart: 0.5,
      cancelledBy: 'driver',
    });

    expect(outcome.refundAmount).toBe(0);
    expect(outcome.forfeited).toBe(50_000);
    expect(outcome.reason).toBe('after_cutoff');
  });

  it('splits the forfeit so the host is paid for holding the bay', () => {
    const outcome = computeRefund({
      ...booking,
      policy: 'flexible',
      hoursBeforeStart: 0.5,
      cancelledBy: 'driver',
    });

    expect(outcome.hostKeeps).toBe(45_000); // Rs 450, the normal payout
    expect(outcome.platformKeeps).toBe(7_500); // Rs 50 commission plus Rs 25 fee
    expect(outcome.hostKeeps + outcome.platformKeeps).toBe(
      outcome.forfeited + outcome.serviceFeeRetained,
    );
  });
});

describe('moderate policy', () => {
  const booking = rs500Booking();

  it('refunds in full beyond 24 hours', () => {
    const outcome = computeRefund({
      ...booking,
      policy: 'moderate',
      hoursBeforeStart: 25,
      cancelledBy: 'driver',
    });
    expect(outcome.refundAmount).toBe(50_000);
  });

  it('refunds half inside 24 hours', () => {
    const outcome = computeRefund({
      ...booking,
      policy: 'moderate',
      hoursBeforeStart: 5,
      cancelledBy: 'driver',
    });
    expect(outcome.refundAmount).toBe(25_000);
    expect(outcome.forfeited).toBe(25_000);
    expect(outcome.hostKeeps).toBe(22_500); // Rs 225
    expect(outcome.platformKeeps).toBe(5_000); // Rs 25 commission plus Rs 25 fee
  });

  it('treats exactly 24 hours as inside the full refund window', () => {
    const outcome = computeRefund({
      ...booking,
      policy: 'moderate',
      hoursBeforeStart: 24,
      cancelledBy: 'driver',
    });
    expect(outcome.refundAmount).toBe(50_000);
  });
});

describe('strict policy', () => {
  const booking = rs500Booking();

  it('refunds half beyond 48 hours', () => {
    const outcome = computeRefund({
      ...booking,
      policy: 'strict',
      hoursBeforeStart: 72,
      cancelledBy: 'driver',
    });
    expect(outcome.refundAmount).toBe(25_000);
  });

  it('refunds nothing inside 48 hours', () => {
    const outcome = computeRefund({
      ...booking,
      policy: 'strict',
      hoursBeforeStart: 12,
      cancelledBy: 'driver',
    });
    expect(outcome.refundAmount).toBe(0);
  });
});

describe('non refundable policy', () => {
  it('refunds nothing at any point', () => {
    const booking = rs500Booking();
    for (const hours of [1000, 48, 24, 1, 0.1]) {
      const outcome = computeRefund({
        ...booking,
        policy: 'non_refundable',
        hoursBeforeStart: hours,
        cancelledBy: 'driver',
      });
      expect(outcome.refundAmount, `at ${hours}h before start`).toBe(0);
    }
  });
});

describe('host and platform cancellation', () => {
  const booking = rs500Booking();

  it('makes the driver whole including the service fee, under every policy', () => {
    const policies: CancellationPolicy[] = ['flexible', 'moderate', 'strict', 'non_refundable'];

    for (const policy of policies) {
      const outcome = computeRefund({
        ...booking,
        policy,
        hoursBeforeStart: 0.1,
        cancelledBy: 'host',
      });

      // Rs 529.50, the entire amount the driver paid.
      expect(outcome.refundAmount, `policy ${policy}`).toBe(52_950);
      expect(outcome.serviceFeeRetained, `policy ${policy}`).toBe(0);
      expect(outcome.hostKeeps, `policy ${policy}`).toBe(0);
      expect(outcome.platformKeeps, `policy ${policy}`).toBe(0);
    }
  });

  it('treats a platform cancellation the same as a host one', () => {
    const byHost = computeRefund({ ...booking, policy: 'strict', hoursBeforeStart: 1, cancelledBy: 'host' });
    const byPlatform = computeRefund({ ...booking, policy: 'strict', hoursBeforeStart: 1, cancelledBy: 'platform' });
    expect(byPlatform).toEqual(byHost);
  });
});

describe('after check in', () => {
  it('refunds nothing, because the space was delivered and used', () => {
    const booking = rs500Booking();
    const outcome = computeRefund({
      ...booking,
      policy: 'flexible',
      hoursBeforeStart: -0.5,
      cancelledBy: 'driver',
      alreadyCheckedIn: true,
    });

    expect(outcome.refundAmount).toBe(0);
    expect(outcome.reason).toBe('already_checked_in');
    expect(outcome.hostKeeps).toBe(45_000);
  });
});

describe('wallet credit on cancellation', () => {
  it('returns credit to the wallet in proportion to the cash refund', () => {
    const breakdown = computeBreakdown({ baseAmount: 50_000, walletApplied: 20_000, ...RATES });

    const outcome = computeRefund({
      baseAmount: 50_000,
      walletApplied: breakdown.walletApplied,
      serviceFee: breakdown.serviceFee,
      taxAmount: breakdown.taxAmount,
      policy: 'moderate',
      hoursBeforeStart: 5, // half refund
      cancelledBy: 'driver',
      commissionRateBp: RATES.commissionRateBp,
    });

    // Half of the Rs 500 parking is refundable, which is Rs 250. Of the Rs 200
    // paid in credit, half returns to the wallet and the rest of the refundable
    // amount goes back to the card.
    expect(outcome.walletReturn).toBe(10_000);
    expect(outcome.refundAmount).toBe(15_000);
    expect(outcome.walletReturn + outcome.refundAmount).toBe(25_000);
  });

  it('never returns more credit than was applied', () => {
    const outcome = computeRefund({
      baseAmount: 50_000,
      walletApplied: 50_000,
      serviceFee: 0,
      policy: 'flexible',
      hoursBeforeStart: 5,
      cancelledBy: 'driver',
      commissionRateBp: 1000,
    });

    expect(outcome.walletReturn).toBe(50_000);
    expect(outcome.refundAmount).toBe(0);
  });
});

describe('invariants across every combination', () => {
  it('never refunds more than was paid, and never produces a negative', () => {
    const policies: CancellationPolicy[] = ['flexible', 'moderate', 'strict', 'non_refundable'];
    const parties = ['driver', 'host', 'platform'] as const;

    for (let i = 0; i < 400; i += 1) {
      const baseAmount = Math.floor(Math.random() * 500_000);
      const breakdown = computeBreakdown({ baseAmount, ...RATES });
      const policy = policies[Math.floor(Math.random() * policies.length)] as CancellationPolicy;
      const cancelledBy = parties[Math.floor(Math.random() * parties.length)]!;
      const hoursBeforeStart = Math.random() * 200 - 10;

      const outcome = computeRefund({
        baseAmount,
        serviceFee: breakdown.serviceFee,
        taxAmount: breakdown.taxAmount,
        policy,
        hoursBeforeStart,
        cancelledBy,
        commissionRateBp: RATES.commissionRateBp,
      });

      const context = `base=${baseAmount} policy=${policy} by=${cancelledBy} h=${hoursBeforeStart.toFixed(1)}`;

      expect(outcome.refundAmount, context).toBeGreaterThanOrEqual(0);
      expect(outcome.forfeited, context).toBeGreaterThanOrEqual(0);
      expect(outcome.hostKeeps, context).toBeGreaterThanOrEqual(0);
      expect(outcome.platformKeeps, context).toBeGreaterThanOrEqual(0);
      expect(outcome.refundAmount, context).toBeLessThanOrEqual(breakdown.totalAmount);

      // The forfeit is fully accounted for: nothing vanishes and nothing is
      // invented.
      if (cancelledBy === 'driver') {
        expect(outcome.hostKeeps + (outcome.platformKeeps - outcome.serviceFeeRetained), context).toBe(
          outcome.forfeited,
        );
      }
    }
  });
});

describe('overstay', () => {
  const hourlyRate = 5_000; // Rs 50 an hour

  it('charges nothing inside the grace period', () => {
    expect(computeOverstay({ minutesLate: 10, gracePeriodMinutes: 10, hourlyRate }).amount).toBe(0);
    expect(computeOverstay({ minutesLate: 1, gracePeriodMinutes: 10, hourlyRate }).amount).toBe(0);
  });

  it('charges from the original end time once grace is exceeded, not from the end of grace', () => {
    // 11 minutes late rounds up to one hour, at 1.5x, so Rs 75. Charging from
    // the end of grace would bill 1 minute and read as a trick the first time
    // somebody worked it out.
    const outcome = computeOverstay({ minutesLate: 11, gracePeriodMinutes: 10, hourlyRate });
    expect(outcome.chargeableMinutes).toBe(11);
    expect(outcome.amount).toBe(7_500);
  });

  it('rounds up to the next hour', () => {
    expect(computeOverstay({ minutesLate: 61, gracePeriodMinutes: 10, hourlyRate }).amount).toBe(15_000);
    expect(computeOverstay({ minutesLate: 120, gracePeriodMinutes: 10, hourlyRate }).amount).toBe(15_000);
    expect(computeOverstay({ minutesLate: 121, gracePeriodMinutes: 10, hourlyRate }).amount).toBe(22_500);
  });
});

describe('check in window', () => {
  it('opens 30 minutes before the booking starts', () => {
    const starts = new Date('2026-09-12T10:00:00Z');

    expect(isCheckInOpen(starts, new Date('2026-09-12T09:29:00Z'))).toBe(false);
    expect(isCheckInOpen(starts, new Date('2026-09-12T09:30:00Z'))).toBe(true);
    expect(isCheckInOpen(starts, new Date('2026-09-12T10:15:00Z'))).toBe(true);
  });
});

describe('policy cutoffs match the documented table', () => {
  it('has the cutoffs the spec kernel states', () => {
    expect(POLICY_CUTOFF_HOURS.flexible).toBe(1);
    expect(POLICY_CUTOFF_HOURS.moderate).toBe(24);
    expect(POLICY_CUTOFF_HOURS.strict).toBe(48);
    expect(POLICY_CUTOFF_HOURS.non_refundable).toBeNull();
  });
});
