import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { Alert, Card } from '@/components/ui';
import { CheckoutClient } from './checkout-client';
import { createClient } from '@/lib/supabase/server';
import { formatPaise } from '@/lib/money';
import { CANCELLATION_POLICY_COPY, type Booking } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/checkout/${id}`)}`);

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle<Booking>();

  if (!booking) notFound();
  if (booking.driver_id !== user.id) notFound();

  // Already paid. Send them to the booking rather than showing a payment screen
  // for something they have bought.
  if (booking.status === 'confirmed' || booking.status === 'active') {
    redirect(`/bookings/${booking.id}?just_booked=1`);
  }

  if (booking.status !== 'pending') {
    return (
      <>
        <SiteHeader />
        <main id="main" className="mx-auto max-w-lg px-4 py-16">
          <Alert tone="warning" title="This booking is no longer awaiting payment">
            <p className="mt-1">
              Its status is {booking.status}. If the hold ran out, the space was released so
              someone else could book it. You have not been charged.
            </p>
          </Alert>
          <a href="/search" className="ps-btn ps-btn-primary mt-5">
            Search again
          </a>
        </main>
      </>
    );
  }

  const { data: space } = await supabase
    .from('public_spaces')
    .select('title, locality, city, cancellation_policy')
    .eq('id', booking.space_id)
    .maybeSingle();

  const { data: vehicle } = booking.vehicle_id
    ? await supabase
        .from('vehicles')
        .select('registration_number, make, model')
        .eq('id', booking.vehicle_id)
        .maybeSingle()
    : { data: null };

  const snapshot = (booking.space_snapshot ?? {}) as Record<string, unknown>;
  const title = space?.title ?? (snapshot.title as string) ?? 'Parking space';
  const locality = space?.locality ?? (snapshot.locality as string) ?? '';

  return (
    <>
      <SiteHeader />

      <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <h1 className="text-2xl font-bold tracking-tight">Confirm and pay</h1>
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">
          Booking {booking.code}. Your space is held while you pay.
        </p>

        {/* ------------------------------------------------------------- */}
        {/* What is being bought                                           */}
        {/* ------------------------------------------------------------- */}
        <Card className="mt-6 p-5">
          <h2 className="font-semibold">{title}</h2>
          {locality && <p className="text-sm text-[var(--text-muted)]">{locality}</p>}

          <dl className="mt-4 space-y-2.5 border-t pt-4 text-sm">
            <Row
              label="Arriving"
              value={new Date(booking.starts_at).toLocaleString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
            <Row
              label="Leaving"
              value={new Date(booking.ends_at).toLocaleString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
            {vehicle && (
              <Row
                label="Vehicle"
                value={`${vehicle.registration_number}${
                  vehicle.make ? ` · ${vehicle.make} ${vehicle.model ?? ''}`.trimEnd() : ''
                }`}
              />
            )}
          </dl>
        </Card>

        {/* ------------------------------------------------------------- */}
        {/* Price                                                          */}
        {/* ------------------------------------------------------------- */}
        <Card className="mt-4 p-5">
          <h2 className="font-semibold">Price</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <Row label="Parking" value={formatPaise(booking.base_amount_paise)} />
            {booking.discount_amount_paise > 0 && (
              <Row
                label={`Promo ${booking.coupon_code ?? ''}`.trim()}
                value={`−${formatPaise(booking.discount_amount_paise)}`}
                accent
              />
            )}
            {booking.wallet_applied_paise > 0 && (
              <Row
                label="Credit applied"
                value={`−${formatPaise(booking.wallet_applied_paise)}`}
                accent
              />
            )}
            <Row label="Service fee" value={formatPaise(booking.service_fee_paise)} muted />
            {booking.tax_amount_paise > 0 && (
              <Row label="Tax on the fee" value={formatPaise(booking.tax_amount_paise)} muted />
            )}
            <div className="border-t pt-3">
              <Row label="Total to pay" value={formatPaise(booking.total_amount_paise)} strong />
            </div>
          </dl>
        </Card>

        <p className="mt-4 rounded-lg bg-[var(--surface-sunken)] px-4 py-3 text-xs text-[var(--text-muted)]">
          {CANCELLATION_POLICY_COPY[booking.cancellation_policy]} A 10 minute grace period
          applies at the end of your booking, after which overstay is charged at 1.5 times
          the hourly rate.
        </p>

        <CheckoutClient
          bookingId={booking.id}
          bookingCode={booking.code}
          totalPaise={booking.total_amount_paise}
          holdExpiresAt={booking.hold_expires_at}
        />
      </main>
    </>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted ? 'text-[var(--text-muted)]' : ''}>{label}</dt>
      <dd
        className={[
          'tabular-nums',
          strong ? 'text-lg font-bold' : '',
          accent ? 'font-medium text-[var(--accent-text)]' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}
