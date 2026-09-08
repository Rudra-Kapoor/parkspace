'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPaise } from '@/lib/money';
import { errorCopy } from '@/lib/errors';
import type { PublicSpace, Quote, Vehicle } from '@/lib/types';
import { Alert, Card, cn } from './ui';

/**
 * The booking panel.
 *
 * Every price shown here comes from the server. There is a matching pure
 * implementation in lib/money used elsewhere for previews, but on this panel the
 * number is always the one the database computed, because this is the number the
 * driver is about to agree to pay.
 *
 * The panel re-quotes on every change, debounced. That costs a round trip per
 * edit and is worth it: a stale price on a booking screen is the single most
 * damaging thing this product could show.
 */
export function BookingPanel({
  space,
  vehicles,
  isSignedIn,
  isOwnSpace,
  initialStartsAt,
  initialEndsAt,
}: {
  space: PublicSpace;
  vehicles: Vehicle[];
  isSignedIn: boolean;
  isOwnSpace: boolean;
  initialStartsAt?: string;
  initialEndsAt?: string;
}) {
  const router = useRouter();

  const [startsAt, setStartsAt] = useState(() => toLocalInput(initialStartsAt));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(initialEndsAt));
  const [vehicleId, setVehicleId] = useState(
    () => vehicles.find((v) => v.is_default)?.id ?? vehicles[0]?.id ?? '',
  );
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState('');
  const [useWallet, setUseWallet] = useState(false);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // Stable across retries of the same intent, regenerated after a successful
  // booking. This is what makes a double-clicked Book button safe.
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey());

  // Defaults when the driver arrived without times.
  useEffect(() => {
    if (startsAt && endsAt) return;
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
    const minMinutes = Math.max(space.min_booking_minutes, 60);
    const later = new Date(now.getTime() + minMinutes * 60 * 1000);
    if (!startsAt) setStartsAt(toLocalInput(now.toISOString()));
    if (!endsAt) setEndsAt(toLocalInput(later.toISOString()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchQuote = useCallback(async () => {
    if (!startsAt || !endsAt) return;

    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!(end > start)) {
      setQuote(null);
      setError('The end time must be after the start time.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setQuoting(true);
    setError(null);

    try {
      const response = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          space_id: space.id,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          coupon_code: couponApplied || undefined,
          use_wallet: useWallet,
        }),
      });

      const data = (await response.json()) as Quote & { error?: string };

      if (!data.ok) {
        setQuote(null);
        setError(errorCopy(data.error ?? 'UNKNOWN').message);
        return;
      }

      setQuote(data);

      if (data.coupon_error) {
        setError(errorCopy(data.coupon_error).message);
        setCouponApplied('');
      }
    } catch (caught) {
      if ((caught as Error).name !== 'AbortError') {
        setError('We could not work out a price just now. Try again.');
      }
    } finally {
      setQuoting(false);
    }
  }, [space.id, startsAt, endsAt, couponApplied, useWallet]);

  // Debounced so dragging a time field does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void fetchQuote(), 400);
    return () => clearTimeout(timer);
  }, [fetchQuote]);

  async function book() {
    if (!isSignedIn) {
      const next = `/space/${space.id}?starts_at=${encodeURIComponent(
        new Date(startsAt).toISOString(),
      )}&ends_at=${encodeURIComponent(new Date(endsAt).toISOString())}`;
      router.push(`/auth/login?next=${encodeURIComponent(next)}`);
      return;
    }

    if (vehicles.length === 0) {
      router.push('/vehicles?reason=booking');
      return;
    }

    setBooking(true);
    setError(null);

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          space_id: space.id,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
          vehicle_id: vehicleId || undefined,
          coupon_code: couponApplied || undefined,
          use_wallet: useWallet,
          idempotency_key: idempotencyKeyRef.current,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        setError(data.message ?? errorCopy(data.error ?? 'UNKNOWN').message);

        // The bay went while they were deciding. Re-quote so the panel reflects
        // reality rather than leaving a stale, bookable-looking price on screen.
        if (data.error === 'SPACE_NO_LONGER_AVAILABLE') void fetchQuote();
        return;
      }

      idempotencyKeyRef.current = newIdempotencyKey();
      router.push(`/checkout/${data.booking_id}`);
    } catch {
      setError('We could not start that booking. Check your connection and try again.');
    } finally {
      setBooking(false);
    }
  }

  const unavailable = quote != null && !quote.available;
  const canBook = quote?.ok === true && quote.available && !quoting && !booking && !isOwnSpace;

  return (
    <Card className="p-5">
      {/* Headline price */}
      <div className="flex items-baseline gap-1.5">
        {space.price_hourly_paise != null ? (
          <>
            <span className="text-2xl font-bold">{formatPaise(space.price_hourly_paise)}</span>
            <span className="text-sm text-[var(--text-muted)]">per hour</span>
          </>
        ) : space.price_daily_paise != null ? (
          <>
            <span className="text-2xl font-bold">{formatPaise(space.price_daily_paise)}</span>
            <span className="text-sm text-[var(--text-muted)]">per day</span>
          </>
        ) : space.price_monthly_paise != null ? (
          <>
            <span className="text-2xl font-bold">{formatPaise(space.price_monthly_paise)}</span>
            <span className="text-sm text-[var(--text-muted)]">per month</span>
          </>
        ) : null}
      </div>

      {/* Times */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="book-from" className="ps-label">
            Arriving
          </label>
          <input
            id="book-from"
            type="datetime-local"
            className="ps-input !text-sm"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="book-until" className="ps-label">
            Leaving
          </label>
          <input
            id="book-until"
            type="datetime-local"
            className="ps-input !text-sm"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </div>
      </div>

      {/* Vehicle */}
      {isSignedIn && vehicles.length > 0 && (
        <div className="mt-3">
          <label htmlFor="book-vehicle" className="ps-label">
            Vehicle
          </label>
          <select
            id="book-vehicle"
            className="ps-input !text-sm"
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
          >
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.registration_number}
                {vehicle.make ? ` · ${vehicle.make} ${vehicle.model ?? ''}`.trimEnd() : ''}
              </option>
            ))}
          </select>
          <p className="ps-hint">The host uses this to identify your car at the gate.</p>
        </div>
      )}

      {/* Coupon */}
      <div className="mt-3">
        <label htmlFor="book-coupon" className="ps-label">
          Promo code
        </label>
        <div className="flex gap-2">
          <input
            id="book-coupon"
            type="text"
            className="ps-input !text-sm uppercase"
            placeholder="Optional"
            value={couponCode}
            onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
          />
          <button
            type="button"
            className="ps-btn ps-btn-secondary shrink-0 !text-sm"
            onClick={() => setCouponApplied(couponCode.trim())}
            disabled={!couponCode.trim() || couponCode.trim() === couponApplied}
          >
            Apply
          </button>
        </div>
      </div>

      {/* Price breakdown */}
      <div className="mt-5 border-t pt-4" aria-live="polite">
        {quoting && !quote ? (
          <p className="text-sm text-[var(--text-muted)]">Working out the price...</p>
        ) : quote?.ok ? (
          <dl className={cn('space-y-2 text-sm', quoting && 'opacity-60')}>
            <Row
              label={`Parking for ${formatDuration(quote.duration_minutes)}`}
              value={formatPaise(quote.base_amount_paise)}
            />
            {quote.discount_amount_paise > 0 && (
              <Row
                label={`Promo ${quote.coupon_code ?? ''}`.trim()}
                value={`−${formatPaise(quote.discount_amount_paise)}`}
                tone="accent"
              />
            )}
            {quote.wallet_applied_paise > 0 && (
              <Row
                label="Credit applied"
                value={`−${formatPaise(quote.wallet_applied_paise)}`}
                tone="accent"
              />
            )}
            <Row label="Service fee" value={formatPaise(quote.service_fee_paise)} muted />
            {quote.tax_amount_paise > 0 && (
              <Row label="Tax on the fee" value={formatPaise(quote.tax_amount_paise)} muted />
            )}
            <div className="border-t pt-2.5">
              <Row label="Total" value={formatPaise(quote.total_amount_paise)} strong />
            </div>
          </dl>
        ) : null}
      </div>

      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}

      {unavailable && !error && (
        <Alert tone="warning" className="mt-4">
          This space is not free for those times. Try a different window.
        </Alert>
      )}

      {isOwnSpace && (
        <Alert tone="info" className="mt-4">
          This is your own listing, so you cannot book it.
        </Alert>
      )}

      <button
        type="button"
        onClick={book}
        disabled={!canBook}
        className="ps-btn ps-btn-primary mt-4 w-full !py-3"
      >
        {booking
          ? 'Holding the space...'
          : !isSignedIn
            ? 'Sign in to book'
            : space.instant_book
              ? 'Book now'
              : 'Request to book'}
      </button>

      <p className="mt-3 text-center text-xs text-[var(--text-muted)]">
        You are not charged until the next step.
      </p>

      {quote?.ok && quote.free_bays > 0 && quote.free_bays <= 2 && space.capacity > 1 && (
        <p className="mt-2 text-center text-xs font-medium text-amber-600 dark:text-amber-400">
          Only {quote.free_bays} of {space.capacity} bays free for these times
        </p>
      )}
    </Card>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  tone?: 'accent';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn(muted && 'text-[var(--text-muted)]')}>{label}</dt>
      <dd
        className={cn(
          'tabular-nums',
          strong && 'text-base font-bold',
          tone === 'accent' && 'font-medium text-[var(--accent-text)]',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days} ${days === 1 ? 'day' : 'days'}`;
}

function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
