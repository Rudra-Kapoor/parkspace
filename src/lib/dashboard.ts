/**
 * Shared presentation helpers for the host dashboard and the admin panel.
 *
 * Two things live here rather than being repeated across a dozen pages.
 *
 * 1. Day boundaries in the operating timezone. "Today's bookings" has to mean
 *    today in Kolkata, not today in whatever region the serverless function
 *    happened to run in. India Standard Time is a fixed +05:30 with no daylight
 *    saving, so the arithmetic is exact rather than approximate.
 *
 * 2. The status vocabulary. A listing status, a booking status and a dispute
 *    status each map to one label and one badge tone, decided once, so the same
 *    state never renders as a different colour on two different screens.
 */

import type {
  BookingStatus,
  DisputeStatus,
  ListingStatus,
  PayoutStatus,
  PaymentStatus,
  VerificationStatus,
} from './types';

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** India Standard Time, in minutes ahead of UTC. Fixed, no daylight saving. */
export const IST_OFFSET_MINUTES = 330;

export const OPERATING_TIME_ZONE = 'Asia/Kolkata';

/**
 * Midnight at the start of an IST day, expressed as a real instant.
 *
 * `dayOffset` moves whole days: 0 is today, 1 is tomorrow, -1 is yesterday.
 */
export function istDayStart(dayOffset = 0, from: Date = new Date()): Date {
  const shifted = new Date(from.getTime() + IST_OFFSET_MINUTES * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() + dayOffset);
  return new Date(shifted.getTime() - IST_OFFSET_MINUTES * 60_000);
}

/** Midnight at the start of an IST month. A `monthOffset` of -1 is last month. */
export function istMonthStart(monthOffset = 0, from: Date = new Date()): Date {
  const shifted = new Date(from.getTime() + IST_OFFSET_MINUTES * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + monthOffset);
  return new Date(shifted.getTime() - IST_OFFSET_MINUTES * 60_000);
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: OPERATING_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: OPERATING_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const timeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: OPERATING_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const monthFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: OPERATING_TIME_ZONE,
  month: 'short',
  year: 'numeric',
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : 'Not set';
}

export function formatShortDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? shortDateFormatter.format(date) : 'Not set';
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : 'Not set';
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return 'Not set';
  return `${shortDateFormatter.format(date)}, ${timeFormatter.format(date)}`;
}

export function formatMonth(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? monthFormatter.format(date) : 'Not set';
}

/** "3 h 30 m", for a booking window or an average response time. */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 m';
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${rest} m`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} m`;
}

export function minutesBetween(startsAt: string, endsAt: string): number {
  const start = toDate(startsAt);
  const end = toDate(endsAt);
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

/**
 * The bucket key for an IST calendar month.
 *
 * Computed by shifting the instant into IST wall time and then reading the UTC
 * fields of the shifted value, so a stay that ended at 2 am IST on the first of
 * the month lands in that month rather than the previous one.
 */
export function istMonthKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'invalid';
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
  return `${shifted.getUTCFullYear()}-${shifted.getUTCMonth()}`;
}

/** The YYYY-MM-DD key an IST calendar cell is addressed by. */
export function istDateKey(value: Date): string {
  const shifted = new Date(value.getTime() + IST_OFFSET_MINUTES * 60_000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Status vocabulary
// ---------------------------------------------------------------------------

export type BadgeTone = 'neutral' | 'accent' | 'warning' | 'danger' | 'success';

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  draft: 'Draft',
  pending_review: 'In review',
  active: 'Live',
  paused: 'Paused',
  rejected: 'Rejected',
  delisted: 'Delisted',
};

export const LISTING_STATUS_TONES: Record<ListingStatus, BadgeTone> = {
  draft: 'neutral',
  pending_review: 'warning',
  active: 'success',
  paused: 'neutral',
  rejected: 'danger',
  delisted: 'neutral',
};

export const BOOKING_STATUS_TONES: Record<BookingStatus, BadgeTone> = {
  draft: 'neutral',
  pending: 'warning',
  confirmed: 'accent',
  active: 'success',
  completed: 'success',
  cancelled: 'neutral',
  expired: 'neutral',
  no_show: 'danger',
  disputed: 'danger',
};

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  open: 'Open',
  investigating: 'Investigating',
  awaiting_user: 'Awaiting user',
  resolved_driver: 'Resolved for driver',
  resolved_host: 'Resolved for host',
  resolved_split: 'Resolved, split',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export const DISPUTE_STATUS_TONES: Record<DisputeStatus, BadgeTone> = {
  open: 'danger',
  investigating: 'warning',
  awaiting_user: 'warning',
  resolved_driver: 'success',
  resolved_host: 'success',
  resolved_split: 'success',
  rejected: 'neutral',
  withdrawn: 'neutral',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  created: 'Created',
  authorized: 'Authorised',
  captured: 'Captured',
  failed: 'Failed',
  refunded: 'Refunded',
  partially_refunded: 'Partly refunded',
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, BadgeTone> = {
  created: 'neutral',
  authorized: 'warning',
  captured: 'success',
  failed: 'danger',
  refunded: 'neutral',
  partially_refunded: 'warning',
};

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  scheduled: 'Scheduled',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  on_hold: 'On hold',
};

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  unverified: 'Not started',
  pending: 'Submitted',
  in_review: 'In review',
  verified: 'Verified',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

export const VERIFICATION_STATUS_TONES: Record<VerificationStatus, BadgeTone> = {
  unverified: 'neutral',
  pending: 'warning',
  in_review: 'warning',
  verified: 'success',
  rejected: 'danger',
  suspended: 'danger',
};

export const DISPUTE_PRIORITY_LABELS: Record<number, string> = {
  0: 'P0 safety',
  1: 'P1 blocked',
  2: 'P2 money',
  3: 'P3 other',
};

/**
 * A lookup that tolerates a value the database knows about and this build does
 * not. A readable fallback beats a blank cell.
 */
export function labelFor(
  map: Record<string, string>,
  value: string | null | undefined,
  fallback = 'Unknown',
): string {
  if (!value) return fallback;
  const found: string | undefined = map[value];
  return found ?? value.replace(/_/g, ' ');
}

export function toneFor(
  map: Record<string, BadgeTone>,
  value: string | null | undefined,
): BadgeTone {
  if (!value) return 'neutral';
  const found: BadgeTone | undefined = map[value];
  return found ?? 'neutral';
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/**
 * Hosts think in metres, the database stores millimetres. The conversion lives
 * here so no form reimplements it and quietly disagrees by a factor of ten.
 */
export function metresToMm(metres: number): number {
  return Math.round(metres * 1000);
}

export function mmToMetres(mm: number | null | undefined): string {
  if (mm == null) return '';
  return trimZeros((mm / 1000).toFixed(2));
}

/** "2.1 m" for a height limit, or a note when the host never stated one. */
export function formatMm(mm: number | null | undefined): string {
  if (mm == null) return 'Not stated';
  return `${trimZeros((mm / 1000).toFixed(2))} m`;
}

function trimZeros(value: string): string {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const DAY_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Read a day name safely under noUncheckedIndexedAccess. */
export function dayName(index: number): string {
  return DAY_NAMES[index] ?? 'Day';
}

export function dayShortName(index: number): string {
  return DAY_SHORT_NAMES[index] ?? '—';
}
