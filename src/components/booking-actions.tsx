'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPaise } from '@/lib/money';
import type { BookingStatus, RefundCalculation } from '@/lib/types';
import { Alert, Card } from './ui';

/**
 * Booking actions: check in, check out, extend, cancel.
 *
 * The cancellation dialog states the exact refund before the driver commits,
 * computed by the same database function that will perform the cancellation. A
 * marketplace that makes you cancel to find out what you get back has already
 * decided whose side it is on.
 */
export function BookingActions({
  bookingId,
  status,
  startsAt,
  endsAt,
  isDriver,
  isHost,
  refundPreview,
  cancellationCopy,
}: {
  bookingId: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  isDriver: boolean;
  isHost: boolean;
  refundPreview: RefundCalculation | null;
  cancellationCopy: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [extending, setExtending] = useState(false);
  const [newEnd, setNewEnd] = useState(() => {
    const end = new Date(endsAt);
    end.setHours(end.getHours() + 1);
    return toLocalInput(end);
  });

  async function call(path: string, body?: unknown, label?: string) {
    setBusy(label ?? path);
    setError(null);

    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });

      const data = await response.json();

      if (!data.ok) {
        setError(data.message ?? 'That did not work. Try again.');
        return false;
      }

      router.refresh();
      return true;
    } catch {
      setError('We could not reach the server. Check your connection.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function checkIn() {
    // Try for a coordinate but never block on it. A basement car park is exactly
    // where GPS fails and exactly where someone needs to check in.
    const position = await new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        resolve,
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 30_000 },
      );
    });

    await call(
      `/api/bookings/${bookingId}/checkin`,
      position
        ? { lat: position.coords.latitude, lng: position.coords.longitude }
        : {},
      'checkin',
    );
  }

  const canCheckIn =
    status === 'confirmed' &&
    Date.now() >= new Date(startsAt).getTime() - 30 * 60 * 1000;

  const canCancel = status === 'pending' || status === 'confirmed';
  const canExtend = (status === 'confirmed' || status === 'active') && isDriver;
  const canReview = status === 'completed';

  if (!canCheckIn && !canCancel && !canExtend && status !== 'active' && !canReview) {
    return null;
  }

  return (
    <Card className="mt-4 p-5">
      <h2 className="font-semibold">What would you like to do</h2>

      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canCheckIn && (
          <button
            type="button"
            onClick={checkIn}
            disabled={busy !== null}
            className="ps-btn ps-btn-primary"
          >
            {busy === 'checkin' ? 'Checking in...' : 'I have arrived'}
          </button>
        )}

        {status === 'active' && (
          <button
            type="button"
            onClick={() => void call(`/api/bookings/${bookingId}/checkout`, {}, 'checkout')}
            disabled={busy !== null}
            className="ps-btn ps-btn-primary"
          >
            {busy === 'checkout' ? 'Checking out...' : 'I am leaving'}
          </button>
        )}

        {canExtend && (
          <button
            type="button"
            onClick={() => setExtending((v) => !v)}
            className="ps-btn ps-btn-secondary"
          >
            Extend my stay
          </button>
        )}

        {canReview && (
          <a href={`/bookings/${bookingId}/review`} className="ps-btn ps-btn-secondary">
            Leave a review
          </a>
        )}

        {canCancel && !confirmingCancel && (
          <button
            type="button"
            onClick={() => setConfirmingCancel(true)}
            className="ps-btn ps-btn-ghost text-[var(--text-muted)]"
          >
            Cancel booking
          </button>
        )}
      </div>

      {/* ----------------------------------------------------------- */}
      {/* Extend                                                       */}
      {/* ----------------------------------------------------------- */}
      {extending && (
        <div className="mt-5 rounded-xl border p-4">
          <label htmlFor="extend-until" className="ps-label">
            New leaving time
          </label>
          <input
            id="extend-until"
            type="datetime-local"
            className="ps-input"
            value={newEnd}
            onChange={(event) => setNewEnd(event.target.value)}
          />
          <p className="ps-hint">
            We will only extend if nobody is booked into the bay right after you. You will be
            charged for the extra time at the same rate.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                const ok = await call(
                  `/api/bookings/${bookingId}/extend`,
                  { new_ends_at: new Date(newEnd).toISOString() },
                  'extend',
                );
                if (ok) setExtending(false);
              }}
              className="ps-btn ps-btn-primary"
            >
              {busy === 'extend' ? 'Checking...' : 'Extend'}
            </button>
            <button
              type="button"
              onClick={() => setExtending(false)}
              className="ps-btn ps-btn-secondary"
            >
              Never mind
            </button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------- */}
      {/* Cancel                                                       */}
      {/* ----------------------------------------------------------- */}
      {confirmingCancel && (
        <div className="mt-5 rounded-xl border border-rose-500/35 bg-rose-500/5 p-4">
          <h3 className="font-semibold">Cancel this booking?</h3>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">{cancellationCopy}</p>

          {refundPreview?.ok && (
            <dl className="mt-4 space-y-2 border-t border-rose-500/20 pt-4 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="font-semibold">You would get back</dt>
                <dd className="text-lg font-bold tabular-nums">
                  {formatPaise(refundPreview.refund_paise)}
                </dd>
              </div>
              {refundPreview.wallet_return_paise > 0 && (
                <div className="flex items-baseline justify-between gap-3 text-[var(--text-muted)]">
                  <dt>Returned to your credit balance</dt>
                  <dd className="tabular-nums">
                    {formatPaise(refundPreview.wallet_return_paise)}
                  </dd>
                </div>
              )}
              {isDriver && refundPreview.service_fee_retained_paise > 0 && (
                <div className="flex items-baseline justify-between gap-3 text-[var(--text-muted)]">
                  <dt>Service fee, not refunded</dt>
                  <dd className="tabular-nums">
                    {formatPaise(refundPreview.service_fee_retained_paise)}
                  </dd>
                </div>
              )}
            </dl>
          )}

          {isHost && (
            <Alert tone="warning" className="mt-4">
              Cancelling a confirmed booking refunds the driver in full and counts against
              your reliability score, which affects where your listings rank.
            </Alert>
          )}

          <div className="mt-4">
            <label htmlFor="cancel-reason" className="ps-label">
              Reason, optional
            </label>
            <input
              id="cancel-reason"
              type="text"
              className="ps-input"
              maxLength={500}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Plans changed"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void call(`/api/bookings/${bookingId}/cancel`, { reason: cancelReason }, 'cancel')
              }
              className="ps-btn ps-btn-danger"
            >
              {busy === 'cancel' ? 'Cancelling...' : 'Yes, cancel it'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              className="ps-btn ps-btn-secondary"
            >
              Keep my booking
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
