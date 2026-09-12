/**
 * Error vocabulary.
 *
 * Every failure the user can encounter has a stable code and a sentence of copy
 * written for the person who hit it, not for the developer who wrote it. The
 * database returns the code, the API passes it through, and the UI renders the
 * copy. Nothing in between invents its own wording.
 */

export type AppErrorCode =
  // auth
  | 'NOT_AUTHENTICATED'
  | 'NOT_AUTHORIZED'
  | 'ACCOUNT_SUSPENDED'
  | 'EMAIL_NOT_VERIFIED'
  // listing
  | 'SPACE_NOT_FOUND'
  | 'SPACE_NOT_ACTIVE'
  | 'SPACE_NOT_AVAILABLE'
  | 'SPACE_NO_LONGER_AVAILABLE'
  | 'CANNOT_BOOK_OWN_SPACE'
  | 'CANNOT_PRICE'
  // vehicle
  | 'VEHICLE_NOT_YOURS'
  | 'VEHICLE_DOES_NOT_FIT'
  | 'VEHICLE_TYPE_NOT_ACCEPTED'
  | 'VEHICLE_REQUIRED'
  // booking
  | 'BOOKING_NOT_FOUND'
  | 'BOOKING_NOT_PENDING'
  | 'NOT_CANCELLABLE'
  | 'NOT_CHECKINABLE'
  | 'NOT_CHECKED_IN'
  | 'TOO_EARLY'
  | 'HOLD_EXPIRED_AND_TAKEN'
  | 'NOT_AN_EXTENSION'
  | 'EXTENSION_BLOCKED'
  | 'EXTENSION_LIMIT_REACHED'
  | 'INVALID_TIME_RANGE'
  | 'DURATION_TOO_SHORT'
  | 'DURATION_TOO_LONG'
  | 'STARTS_IN_PAST'
  // coupon
  | 'COUPON_NOT_FOUND'
  | 'COUPON_INACTIVE'
  | 'COUPON_EXPIRED'
  | 'COUPON_NOT_STARTED'
  | 'COUPON_EXHAUSTED'
  | 'COUPON_MIN_NOT_MET'
  | 'COUPON_ALREADY_USED'
  | 'COUPON_FIRST_BOOKING_ONLY'
  | 'COUPON_CITY_RESTRICTED'
  // payment
  | 'PAYMENT_FAILED'
  | 'PAYMENT_NOT_FOUND'
  | 'SIGNATURE_INVALID'
  | 'INSUFFICIENT_WALLET'
  // generic
  | 'RATE_LIMITED'
  | 'VALIDATION_FAILED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'NOT_CONFIGURED'
  | 'UNKNOWN';

interface ErrorPresentation {
  /** What the person sees. Written to be actionable, never to assign blame. */
  message: string;
  /** What they can do next, when there is something. */
  action?: string;
  /** HTTP status for API responses. */
  status: number;
  /** Whether retrying the identical request could plausibly succeed. */
  retryable: boolean;
}

export const ERROR_CATALOGUE: Record<AppErrorCode, ErrorPresentation> = {
  NOT_AUTHENTICATED: {
    message: 'You need to sign in to do that.',
    action: 'Sign in',
    status: 401,
    retryable: false,
  },
  NOT_AUTHORIZED: {
    message: 'This is not yours to change.',
    status: 403,
    retryable: false,
  },
  ACCOUNT_SUSPENDED: {
    message: 'Your account is on hold and cannot make bookings.',
    action: 'Contact support',
    status: 403,
    retryable: false,
  },
  EMAIL_NOT_VERIFIED: {
    message: 'Confirm your email address first. We sent you a link.',
    status: 403,
    retryable: false,
  },

  SPACE_NOT_FOUND: { message: 'That parking space no longer exists.', status: 404, retryable: false },
  SPACE_NOT_ACTIVE: {
    message: 'This space is not taking bookings at the moment.',
    status: 409,
    retryable: false,
  },
  SPACE_NOT_AVAILABLE: {
    message: 'This space is not available for the times you picked.',
    action: 'Try different times',
    status: 409,
    retryable: false,
  },
  SPACE_NO_LONGER_AVAILABLE: {
    // This is the lost-race message. It must not sound like a system failure,
    // because it is not one: somebody simply got there first.
    message: 'Someone just booked this space for those times.',
    action: 'See what else is nearby',
    status: 409,
    retryable: false,
  },
  CANNOT_BOOK_OWN_SPACE: {
    message: 'You cannot book your own parking space.',
    status: 409,
    retryable: false,
  },
  CANNOT_PRICE: {
    message: 'We could not work out a price for that length of stay.',
    status: 409,
    retryable: false,
  },

  VEHICLE_NOT_YOURS: { message: 'That vehicle is not on your account.', status: 403, retryable: false },
  VEHICLE_DOES_NOT_FIT: {
    message: 'Your vehicle is larger than this space allows.',
    action: 'Pick a different vehicle or space',
    status: 409,
    retryable: false,
  },
  VEHICLE_TYPE_NOT_ACCEPTED: {
    message: 'This host does not accept that type of vehicle.',
    status: 409,
    retryable: false,
  },
  VEHICLE_REQUIRED: {
    message: 'Add a vehicle before booking, so the host can identify it.',
    action: 'Add a vehicle',
    status: 400,
    retryable: false,
  },

  BOOKING_NOT_FOUND: { message: 'We could not find that booking.', status: 404, retryable: false },
  BOOKING_NOT_PENDING: {
    message: 'This booking has already moved on from awaiting payment.',
    status: 409,
    retryable: false,
  },
  NOT_CANCELLABLE: {
    message: 'This booking can no longer be cancelled.',
    status: 409,
    retryable: false,
  },
  NOT_CHECKINABLE: { message: 'This booking is not ready for check in.', status: 409, retryable: false },
  NOT_CHECKED_IN: { message: 'Check in before checking out.', status: 409, retryable: false },
  TOO_EARLY: {
    message: 'Check in opens 30 minutes before your booking starts.',
    status: 409,
    retryable: true,
  },
  HOLD_EXPIRED_AND_TAKEN: {
    message: 'Your hold ran out and the space was taken. You have not been charged.',
    action: 'Search again',
    status: 409,
    retryable: false,
  },
  NOT_AN_EXTENSION: { message: 'Pick a time later than your current end time.', status: 400, retryable: false },
  EXTENSION_BLOCKED: {
    message: 'The space is booked straight after you, so it cannot be extended.',
    status: 409,
    retryable: false,
  },
  EXTENSION_LIMIT_REACHED: {
    message: 'You have extended this booking as many times as allowed.',
    status: 409,
    retryable: false,
  },
  INVALID_TIME_RANGE: { message: 'The end time must be after the start time.', status: 400, retryable: false },
  DURATION_TOO_SHORT: { message: 'That stay is shorter than this host allows.', status: 400, retryable: false },
  DURATION_TOO_LONG: { message: 'That stay is longer than this host allows.', status: 400, retryable: false },
  STARTS_IN_PAST: { message: 'Pick a start time in the future.', status: 400, retryable: false },

  COUPON_NOT_FOUND: { message: 'That code is not one of ours.', status: 400, retryable: false },
  COUPON_INACTIVE: { message: 'That code is no longer active.', status: 400, retryable: false },
  COUPON_EXPIRED: { message: 'That code has expired.', status: 400, retryable: false },
  COUPON_NOT_STARTED: { message: 'That code is not valid yet.', status: 400, retryable: false },
  COUPON_EXHAUSTED: { message: 'That code has been fully claimed.', status: 400, retryable: false },
  COUPON_MIN_NOT_MET: {
    message: 'Your booking is below the minimum for that code.',
    status: 400,
    retryable: false,
  },
  COUPON_ALREADY_USED: { message: 'You have already used that code.', status: 400, retryable: false },
  COUPON_FIRST_BOOKING_ONLY: {
    message: 'That code is for a first booking only.',
    status: 400,
    retryable: false,
  },
  COUPON_CITY_RESTRICTED: {
    message: 'That code does not apply in this city.',
    status: 400,
    retryable: false,
  },

  PAYMENT_FAILED: {
    message: 'The payment did not go through. Nothing has been charged.',
    action: 'Try another method',
    status: 402,
    retryable: true,
  },
  PAYMENT_NOT_FOUND: { message: 'We could not find that payment.', status: 404, retryable: false },
  SIGNATURE_INVALID: { message: 'That request could not be verified.', status: 400, retryable: false },
  INSUFFICIENT_WALLET: { message: 'Your credit balance is too low.', status: 400, retryable: false },

  RATE_LIMITED: {
    message: 'That is a lot of requests. Give it a moment.',
    status: 429,
    retryable: true,
  },
  VALIDATION_FAILED: { message: 'Some of those details are not quite right.', status: 400, retryable: false },
  UPSTREAM_UNAVAILABLE: {
    message: 'A service we depend on is not responding. Try again shortly.',
    status: 503,
    retryable: true,
  },
  NOT_CONFIGURED: {
    message: 'This deployment is not finished setting up.',
    status: 503,
    retryable: false,
  },
  UNKNOWN: {
    message: 'Something went wrong at our end.',
    action: 'Try again',
    status: 500,
    retryable: true,
  },
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly userMessage: string;
  readonly userAction: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: AppErrorCode, details?: Record<string, unknown>) {
    const presentation = ERROR_CATALOGUE[code] ?? ERROR_CATALOGUE.UNKNOWN;
    super(`${code}: ${presentation.message}`);
    this.name = 'AppError';
    this.code = code;
    this.status = presentation.status;
    this.retryable = presentation.retryable;
    this.userMessage = presentation.message;
    this.userAction = presentation.action;
    this.details = details;
  }

  toResponseBody() {
    return {
      ok: false as const,
      error: this.code,
      message: this.userMessage,
      action: this.userAction ?? null,
      retryable: this.retryable,
      details: this.details ?? null,
    };
  }
}

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === 'string' && value in ERROR_CATALOGUE;
}

/** Turn whatever a database function returned into a presentable error. */
export function fromRpcError(value: unknown): AppError {
  if (isAppErrorCode(value)) return new AppError(value);
  if (typeof value === 'object' && value !== null) {
    const code = (value as Record<string, unknown>).error;
    if (isAppErrorCode(code)) return new AppError(code, value as Record<string, unknown>);
  }
  return new AppError('UNKNOWN', { original: value });
}

export function errorCopy(code: string): ErrorPresentation {
  return isAppErrorCode(code) ? ERROR_CATALOGUE[code] : ERROR_CATALOGUE.UNKNOWN;
}
