import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Alert, Badge, Card } from '@/components/ui';
import { StaticMap } from '@/components/static-map';
import { BookingActions } from '@/components/booking-actions';
import { BookingThread } from '@/components/booking-thread';
import { createClient } from '@/lib/supabase/server';
import { formatPaise } from '@/lib/money';
import { directionsUrl } from '@/lib/geo';
import {
  BOOKING_STATUS_LABELS,
  CANCELLATION_POLICY_COPY,
  type Booking,
  type PublicSpace,
  type RefundCalculation,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your booking',
  robots: { index: false, follow: false },
};

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ just_booked?: string }>;
}) {
  const { id } = await params;
  const { just_booked: justBooked } = await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/bookings/${id}`)}`);

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle<Booking>();

  if (!booking) notFound();

  const isDriver = booking.driver_id === user.id;
  const isHost = booking.host_id === user.id;
  if (!isDriver && !isHost) notFound();

  // The space is read through the privacy-aware view, so access_instructions and
  // the exact coordinate arrive populated only if this viewer is entitled to
  // them. The page does not decide; the database does.
  const { data: space } = await supabase
    .from('public_spaces')
    .select('*')
    .eq('id', booking.space_id)
    .maybeSingle<PublicSpace>();

  const { data: vehicle } = booking.vehicle_id
    ? await supabase
        .from('vehicles')
        .select('registration_number, make, model, colour')
        .eq('id', booking.vehicle_id)
        .maybeSingle()
    : { data: null };

  // What a cancellation would cost, computed by the same function that would
  // perform it. Showing a number the driver can trust before they commit.
  let refundPreview: RefundCalculation | null = null;
  if (booking.status === 'confirmed' || booking.status === 'pending') {
    const { data } = await supabase.rpc('compute_refund_paise', {
      p_booking_id: booking.id,
      p_by: isDriver ? 'driver' : 'host',
    });
    refundPreview = (data ?? null) as RefundCalculation | null;
  }

  const snapshot = (booking.space_snapshot ?? {}) as Record<string, unknown>;
  const title = space?.title ?? (snapshot.title as string) ?? 'Parking space';

  const accessReleased = space?.access_instructions != null || space?.address_line != null;
  const hasExact = space?.exact_lat != null && space?.exact_lng != null;

  // The QR encodes the opaque rotating token, never the booking id, because the
  // booking id appears in URLs and a photographed QR should not become a
  // permanent key to the space.
  const qrDataUrl = await QRCode.toDataURL(
    JSON.stringify({ v: 1, code: booking.code, token: booking.qr_token }),
    { errorCorrectionLevel: 'M', margin: 1, width: 320, color: { dark: '#12161a', light: '#ffffff' } },
  ).catch(() => null);

  const statusTone =
    booking.status === 'confirmed' || booking.status === 'active'
      ? 'success'
      : booking.status === 'pending'
        ? 'warning'
        : ['cancelled', 'expired', 'no_show'].includes(booking.status)
          ? 'danger'
          : 'neutral';

  return (
    <>
      <SiteHeader />

      <main id="main" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {justBooked && (
          <Alert tone="success" title="You are booked" className="mb-6">
            <p className="mt-1">
              Booking {booking.code} is confirmed. Your access details appear below 24 hours
              before you arrive.
            </p>
          </Alert>
        )}

        <Link
          href={isHost ? '/host/bookings' : '/bookings'}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] hover:underline"
        >
          Back to bookings
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 font-mono text-sm text-[var(--text-muted)]">{booking.code}</p>
          </div>
          <Badge tone={statusTone}>{BOOKING_STATUS_LABELS[booking.status]}</Badge>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* When and what                                                  */}
        {/* ------------------------------------------------------------- */}
        <Card className="mt-6 p-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Arriving
              </dt>
              <dd className="mt-1 font-semibold">
                {new Date(booking.starts_at).toLocaleString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Leaving
              </dt>
              <dd className="mt-1 font-semibold">
                {new Date(booking.ends_at).toLocaleString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </dd>
            </div>
            {vehicle && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Vehicle
                </dt>
                <dd className="mt-1 font-semibold">
                  {vehicle.registration_number}
                  {vehicle.make && (
                    <span className="block text-sm font-normal text-[var(--text-muted)]">
                      {[vehicle.colour, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
                    </span>
                  )}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                {isHost ? 'Your payout' : 'Total paid'}
              </dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {formatPaise(isHost ? booking.host_payout_paise : booking.total_amount_paise)}
              </dd>
            </div>
          </dl>

          {booking.checked_in_at && (
            <p className="mt-4 border-t pt-4 text-sm text-[var(--text-muted)]">
              Checked in at{' '}
              {new Date(booking.checked_in_at).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {booking.checked_out_at && (
                <>
                  , out at{' '}
                  {new Date(booking.checked_out_at).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </>
              )}
            </p>
          )}

          {booking.overstay_minutes > 0 && (
            <Alert tone="warning" className="mt-4">
              You stayed {booking.overstay_minutes} minutes past the end of the booking.
              {booking.overstay_amount_paise > 0 && (
                <> An overstay charge of {formatPaise(booking.overstay_amount_paise)} applies.</>
              )}
            </Alert>
          )}
        </Card>

        {/* ------------------------------------------------------------- */}
        {/* Access                                                         */}
        {/* ------------------------------------------------------------- */}
        {(booking.status === 'confirmed' || booking.status === 'active') && (
          <Card className="mt-4 p-5">
            <h2 className="font-semibold">Getting in</h2>

            {accessReleased ? (
              <>
                {space?.address_line && (
                  <div className="mt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                      Address
                    </p>
                    <p className="mt-1 font-medium">{space.address_line}</p>
                    {space.landmark && (
                      <p className="text-sm text-[var(--text-muted)]">Near {space.landmark}</p>
                    )}
                  </div>
                )}

                {space?.access_instructions && (
                  <div className="mt-4 rounded-lg bg-[var(--surface-sunken)] p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                      Access instructions
                    </p>
                    <p className="mt-1.5 whitespace-pre-line text-sm">
                      {space.access_instructions}
                    </p>
                  </div>
                )}

                {space?.access_pin && (
                  <div className="mt-3 rounded-lg bg-[var(--surface-sunken)] p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                      Gate code
                    </p>
                    <p className="mt-1 font-mono text-xl font-bold tracking-widest">
                      {space.access_pin}
                    </p>
                  </div>
                )}

                {hasExact && space && (
                  <a
                    href={directionsUrl(
                      { lat: space.exact_lat as number, lng: space.exact_lng as number },
                      title,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ps-btn ps-btn-secondary mt-4 w-full"
                  >
                    Open directions
                  </a>
                )}
              </>
            ) : (
              <Alert tone="info" className="mt-3">
                The exact address and any gate instructions unlock 24 hours before your
                booking starts. This protects hosts, many of whom are letting space at their
                own home.
              </Alert>
            )}

            {/* QR */}
            {qrDataUrl && (
              <div className="mt-5 border-t pt-5 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Show this at the gate
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt={`QR code for booking ${booking.code}`}
                  className="mx-auto mt-3 h-44 w-44 rounded-lg bg-white p-2"
                />
                <p className="mt-2 font-mono text-lg font-bold tracking-wider">{booking.code}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  If the scanner does not work, read the code out. It is designed to be
                  unambiguous over the phone.
                </p>
              </div>
            )}
          </Card>
        )}

        {/* ------------------------------------------------------------- */}
        {/* Map                                                            */}
        {/* ------------------------------------------------------------- */}
        {space && (
          <Card className="mt-4 overflow-hidden">
            <div className="h-64">
              <StaticMap
                lat={space.exact_lat ?? space.approx_lat}
                lng={space.exact_lng ?? space.approx_lng}
                exact={hasExact}
                label={title}
              />
            </div>
          </Card>
        )}

        {/* ------------------------------------------------------------- */}
        {/* Actions                                                        */}
        {/* ------------------------------------------------------------- */}
        <BookingActions
          bookingId={booking.id}
          status={booking.status}
          startsAt={booking.starts_at}
          endsAt={booking.ends_at}
          isDriver={isDriver}
          isHost={isHost}
          refundPreview={refundPreview}
          cancellationCopy={CANCELLATION_POLICY_COPY[booking.cancellation_policy]}
        />

        {/* ------------------------------------------------------------- */}
        {/* Conversation and problem reporting                             */}
        {/* ------------------------------------------------------------- */}
        {booking.status !== 'expired' && booking.status !== 'pending' && (
          <BookingThread
            bookingId={booking.id}
            currentUserId={user.id}
            counterpartyName={isHost ? 'the driver' : 'your host'}
            canDispute={['confirmed', 'active', 'completed', 'no_show'].includes(booking.status)}
          />
        )}

        {/* ------------------------------------------------------------- */}
        {/* Receipt                                                        */}
        {/* ------------------------------------------------------------- */}
        <Card className="mt-4 p-5">
          <h2 className="font-semibold">Receipt</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <ReceiptRow label="Parking" value={formatPaise(booking.base_amount_paise)} />
            {booking.discount_amount_paise > 0 && (
              <ReceiptRow
                label={`Promo ${booking.coupon_code ?? ''}`.trim()}
                value={`−${formatPaise(booking.discount_amount_paise)}`}
              />
            )}
            {booking.wallet_applied_paise > 0 && (
              <ReceiptRow
                label="Credit applied"
                value={`−${formatPaise(booking.wallet_applied_paise)}`}
              />
            )}
            <ReceiptRow label="Service fee" value={formatPaise(booking.service_fee_paise)} />
            {booking.tax_amount_paise > 0 && (
              <ReceiptRow label="Tax on the fee" value={formatPaise(booking.tax_amount_paise)} />
            )}
            <div className="border-t pt-2">
              <ReceiptRow
                label="Total"
                value={formatPaise(booking.total_amount_paise)}
                strong
              />
            </div>
            {booking.refund_amount_paise > 0 && (
              <div className="border-t pt-2">
                <ReceiptRow
                  label="Refunded"
                  value={formatPaise(booking.refund_amount_paise)}
                  strong
                />
              </div>
            )}
          </dl>

          {isHost && (
            <div className="mt-4 border-t pt-4">
              <dl className="space-y-2 text-sm">
                <ReceiptRow
                  label="ParkSpace commission"
                  value={`−${formatPaise(booking.host_commission_paise)}`}
                />
                <ReceiptRow
                  label="Your payout"
                  value={formatPaise(booking.host_payout_paise)}
                  strong
                />
              </dl>
            </div>
          )}
        </Card>
      </main>

      <SiteFooter />
    </>
  );
}

function ReceiptRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'font-semibold' : 'text-[var(--text-muted)]'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-bold' : ''}`}>{value}</dd>
    </div>
  );
}
