import { applyBasisPoints, assertPaise, type Paise } from './money';
import type { CancellationPolicy, CancelledByParty } from './types';

/**
 * Cancellation policy.
 *
 * This is a faithful TypeScript mirror of compute_refund_paise() in migration
 * 0009. The database is authoritative at runtime, but the rules live in two
 * places for two reasons: the UI needs to show a refund preview without a round
 * trip, and policy logic in SQL is close to untestable while policy logic here
 * can be exercised exhaustively.
 *
 * The two implementations are kept in step by the test suite, which asserts the
 * same worked examples that appear in docs/23_Refund_Policy.md. If you change
 * one, change all three.
 */

export const POLICY_CUTOFF_HOURS: Record<CancellationPolicy, number | null> = {
  flexible: 1,
  moderate: 24,
  strict: 48,
  non_refundable: null,
};

export interface RefundInput {
  /** Amount paid for the parking itself, excluding the service fee. */
  baseAmount: Paise;
  discountAmount?: Paise;
  walletApplied?: Paise;
  serviceFee: Paise;
  taxAmount?: Paise;
  policy: CancellationPolicy;
  /** Hours between now and the booking start. Negative means it already began. */
  hoursBeforeStart: number;
  cancelledBy: CancelledByParty;
  /** True once the driver has checked in. */
  alreadyCheckedIn?: boolean;
  commissionRateBp: number;
}

export interface RefundOutcome {
  /** Returned to the payment instrument. */
  refundAmount: Paise;
  /** Returned to the credit balance. */
  walletReturn: Paise;
  /** The part of the parking charge the driver does not get back. */
  forfeited: Paise;
  /** Of the forfeit plus the retained fee, what the platform keeps. */
  platformKeeps: Paise;
  /** Of the forfeit, what the host keeps. */
  hostKeeps: Paise;
  serviceFeeRetained: Paise;
  reason:
    | 'full_refund_host_or_platform'
    | 'already_checked_in'
    | 'before_cutoff'
    | 'after_cutoff'
    | 'non_refundable_policy';
}

export function computeRefund(input: RefundInput): RefundOutcome {
  const {
    baseAmount,
    discountAmount = 0,
    walletApplied = 0,
    serviceFee,
    taxAmount = 0,
    policy,
    hoursBeforeStart,
    cancelledBy,
    alreadyCheckedIn = false,
    commissionRateBp,
  } = input;

  assertPaise(baseAmount, 'baseAmount');
  assertPaise(serviceFee, 'serviceFee');

  const netPaid = baseAmount - discountAmount;
  const totalPaid = netPaid - walletApplied + serviceFee + taxAmount;

  // ---------------------------------------------------------------------------
  // Host or platform cancelled. The driver is made whole including the fee, and
  // nobody keeps anything. The driver did nothing wrong and should not be out of
  // pocket for someone else's change of mind.
  // ---------------------------------------------------------------------------
  if (cancelledBy === 'host' || cancelledBy === 'platform') {
    return {
      refundAmount: totalPaid,
      walletReturn: walletApplied,
      forfeited: 0,
      platformKeeps: 0,
      hostKeeps: 0,
      serviceFeeRetained: 0,
      reason: 'full_refund_host_or_platform',
    };
  }

  // ---------------------------------------------------------------------------
  // Already parked. Nothing is refundable: the space was delivered and used.
  // ---------------------------------------------------------------------------
  if (alreadyCheckedIn) {
    const platformCut = applyBasisPoints(netPaid, commissionRateBp);
    return {
      refundAmount: 0,
      walletReturn: 0,
      forfeited: netPaid,
      platformKeeps: platformCut + serviceFee,
      hostKeeps: netPaid - platformCut,
      serviceFeeRetained: serviceFee,
      reason: 'already_checked_in',
    };
  }

  // ---------------------------------------------------------------------------
  // Policy table. Spec kernel section 8.
  // ---------------------------------------------------------------------------
  const cutoff = POLICY_CUTOFF_HOURS[policy];
  let refundableParking: Paise;
  let reason: RefundOutcome['reason'];

  if (policy === 'non_refundable') {
    refundableParking = 0;
    reason = 'non_refundable_policy';
  } else if (policy === 'flexible') {
    const beforeCutoff = hoursBeforeStart >= 1;
    refundableParking = beforeCutoff ? netPaid : 0;
    reason = beforeCutoff ? 'before_cutoff' : 'after_cutoff';
  } else if (policy === 'moderate') {
    const beforeCutoff = hoursBeforeStart >= 24;
    refundableParking = beforeCutoff ? netPaid : Math.floor(netPaid / 2);
    reason = beforeCutoff ? 'before_cutoff' : 'after_cutoff';
  } else {
    const beforeCutoff = hoursBeforeStart >= 48;
    refundableParking = beforeCutoff ? Math.floor(netPaid / 2) : 0;
    reason = beforeCutoff ? 'before_cutoff' : 'after_cutoff';
  }

  void cutoff;

  const forfeited = netPaid - refundableParking;

  // The forfeit splits on the same terms as a delivered booking. The host held
  // the bay and turned other drivers away for it, so they are owed their share.
  const platformCut = applyBasisPoints(forfeited, commissionRateBp);
  const hostKeeps = forfeited - platformCut;

  // Wallet credit never reached an instrument, so it returns to the wallet in
  // the same proportion as the cash refund.
  const walletReturn =
    netPaid === 0
      ? 0
      : Math.min(walletApplied, Math.round((walletApplied * refundableParking) / netPaid));

  const refundAmount = Math.max(refundableParking - walletReturn, 0);

  return {
    refundAmount,
    walletReturn,
    forfeited,
    platformKeeps: platformCut + serviceFee,
    hostKeeps,
    serviceFeeRetained: serviceFee,
    reason,
  };
}

/**
 * Overstay.
 *
 * Charged from the ORIGINAL end time, not from the end of the grace period.
 * The grace period decides whether any charge applies at all; once it does, the
 * whole overstay is billable. Charging from the end of grace would mean a driver
 * 11 minutes late pays for 1 minute, which reads as a trick the first time
 * somebody works it out.
 */
export function computeOverstay({
  minutesLate,
  gracePeriodMinutes,
  hourlyRate,
  multiplierBp = 15_000,
}: {
  minutesLate: number;
  gracePeriodMinutes: number;
  hourlyRate: Paise;
  multiplierBp?: number;
}): { chargeableMinutes: number; amount: Paise } {
  if (minutesLate <= gracePeriodMinutes) {
    return { chargeableMinutes: 0, amount: 0 };
  }

  const hours = Math.ceil(minutesLate / 60);
  const amount = applyBasisPoints(hours * hourlyRate, multiplierBp);

  return { chargeableMinutes: minutesLate, amount };
}

/** Whether a booking may still be cancelled at all. */
export function isCancellable(status: string): boolean {
  return status === 'pending' || status === 'confirmed';
}

/** Whether check-in is open. Opens 30 minutes early, deliberately generously. */
export function isCheckInOpen(startsAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= startsAt.getTime() - 30 * 60 * 1000;
}
