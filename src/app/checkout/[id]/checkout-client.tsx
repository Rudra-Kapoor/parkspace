'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPaise } from '@/lib/money';
import { Alert } from '@/components/ui';

/**
 * Checkout.
 *
 * Two things happen here that are worth explaining.
 *
 * The countdown is real. The hold genuinely expires at hold_expires_at and the
 * bay genuinely returns to inventory, so showing a timer is honest rather than
 * a pressure tactic. When it reaches zero the page says so plainly and stops
 * offering a Pay button that would fail.
 *
 * The mock provider path opens a demo sheet that posts a properly HMAC-signed
 * event to the real webhook endpoint. It is not a shortcut that flips the
 * booking to confirmed: the same verification, deduplication and confirmation
 * code runs as in production. That is the point of it.
 */
export function CheckoutClient({
  bookingId,
  bookingCode,
  totalPaise,
  holdExpiresAt,
}: {
  bookingId: string;
  bookingCode: string;
  totalPaise: number;
  holdExpiresAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<Record<string, unknown> | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [waiting, setWaiting] = useState(false);

  const idempotencyKeyRef = useRef(newKey());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown.
  useEffect(() => {
    if (!holdExpiresAt) return;

    function tick() {
      const remaining = Math.floor((new Date(holdExpiresAt as string).getTime() - Date.now()) / 1000);
      setSecondsLeft(remaining);
    }

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [holdExpiresAt]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const expired = secondsLeft != null && secondsLeft <= 0;

  async function startPayment() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId,
          idempotency_key: idempotencyKeyRef.current,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        setError(data.message ?? 'We could not start the payment. Try again.');
        return;
      }

      // A booking fully covered by credit has nothing to charge.
      if (data.zero_amount) {
        router.push(`/bookings/${bookingId}?just_booked=1`);
        return;
      }

      setIntent(data.intent);

      if (data.intent?.provider === 'razorpay') {
        await openRazorpay(data.intent);
      }
    } catch {
      setError('We could not reach the payment service. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Poll for confirmation.
   *
   * The webhook confirms the booking, and the webhook is server-to-server, so
   * the browser has to find out some other way. Polling for up to 30 seconds is
   * the simple, reliable answer. Realtime would be prettier and is a natural V2
   * improvement, but it adds a failure mode for no correctness gain.
   */
  function awaitConfirmation() {
    setWaiting(true);
    let attempts = 0;

    pollRef.current = setInterval(async () => {
      attempts += 1;

      try {
        const response = await fetch(`/api/bookings?scope=driver`, { cache: 'no-store' });
        const data = await response.json();
        const booking = data.bookings?.find((b: { id: string }) => b.id === bookingId);

        if (booking && (booking.status === 'confirmed' || booking.status === 'active')) {
          if (pollRef.current) clearInterval(pollRef.current);
          router.push(`/bookings/${bookingId}?just_booked=1`);
          return;
        }
      } catch {
        // Keep polling; a single failed poll is not meaningful.
      }

      if (attempts >= 15) {
        if (pollRef.current) clearInterval(pollRef.current);
        setWaiting(false);
        setError(
          'Your payment went through but we have not had confirmation yet. ' +
            'Do not pay again. Open My bookings in a moment and it should be there.',
        );
      }
    }, 2000);
  }

  async function openRazorpay(payload: Record<string, unknown>) {
    // The Razorpay checkout script is loaded on demand so it never costs anyone
    // who does not reach this page.
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');

    const RazorpayConstructor = (window as unknown as { Razorpay?: new (o: unknown) => { open: () => void } })
      .Razorpay;

    if (!RazorpayConstructor) {
      setError('The payment sheet could not load. Check your connection and try again.');
      return;
    }

    const checkout = new RazorpayConstructor({
      ...payload,
      handler: () => {
        // The browser says it succeeded. That is a hint, not proof: the webhook
        // is what confirms. So we wait for the server rather than celebrating.
        awaitConfirmation();
      },
      modal: { ondismiss: () => setBusy(false) },
    });

    checkout.open();
  }

  async function payWithMock(outcome: 'success' | 'failure') {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/payments/mock-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, outcome }),
      });

      const data = await response.json();

      if (!data.ok) {
        setError(data.message ?? 'The simulated payment did not complete.');
        return;
      }

      if (outcome === 'failure') {
        setError('The payment was declined. Your space is still held, so you can try again.');
        return;
      }

      awaitConfirmation();
    } catch {
      setError('Could not complete the simulated payment.');
    } finally {
      setBusy(false);
    }
  }

  if (expired) {
    return (
      <Alert tone="warning" title="Your hold has run out" className="mt-6">
        <p className="mt-1">
          We released the space so somebody else could book it, and you have not been
          charged. Search again and the same space may still be free.
        </p>
        <a href="/search" className="ps-btn ps-btn-primary mt-4">
          Search again
        </a>
      </Alert>
    );
  }

  if (waiting) {
    return (
      <div className="mt-6 rounded-xl border bg-[var(--surface-sunken)] p-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto block h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--border-strong)] border-t-[var(--accent)]"
        />
        <p className="mt-3 font-medium">Confirming your booking</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Your payment is going through. Do not close this page or pay again.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {secondsLeft != null && secondsLeft > 0 && (
        <p
          className="mb-4 text-center text-sm text-[var(--text-muted)]"
          aria-live="polite"
        >
          Your space is held for{' '}
          <strong className="tabular-nums text-[var(--text)]">
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
          </strong>
        </p>
      )}

      {error && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {!intent ? (
        <button
          type="button"
          onClick={startPayment}
          disabled={busy}
          className="ps-btn ps-btn-primary w-full !py-3.5 !text-base"
        >
          {busy ? 'Starting...' : `Pay ${formatPaise(totalPaise)}`}
        </button>
      ) : intent.provider === 'mock' ? (
        <div className="rounded-xl border-2 border-dashed p-5">
          <p className="text-sm font-semibold">Demonstration payment</p>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            No real gateway is configured, so this build simulates one. Both buttons post a
            properly signed event to the same webhook a real gateway would call, so the
            whole confirmation path runs exactly as it would in production.
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => payWithMock('success')}
              disabled={busy}
              className="ps-btn ps-btn-primary flex-1"
            >
              Simulate a successful payment
            </button>
            <button
              type="button"
              onClick={() => payWithMock('failure')}
              disabled={busy}
              className="ps-btn ps-btn-secondary flex-1"
            >
              Simulate a decline
            </button>
          </div>

          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Booking {bookingCode} · {formatPaise(totalPaise)}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void openRazorpay(intent)}
          className="ps-btn ps-btn-primary w-full !py-3.5 !text-base"
        >
          Reopen the payment sheet
        </button>
      )}

      <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
        Payment details never touch ParkSpace servers. They go straight to the payment
        provider.
      </p>
    </div>
  );
}

function newKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}
