import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Badge, Card, EmptyState } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { formatPaise } from '@/lib/money';
import { BOOKING_STATUS_LABELS, type Booking, type BookingStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My bookings',
  robots: { index: false, follow: false },
};

const ACTIVE_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'active'];

export default async function BookingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login?next=/bookings');

  const { data } = await supabase
    .from('bookings')
    .select('*')
    .eq('driver_id', user.id)
    .order('starts_at', { ascending: false })
    .limit(100);

  const bookings = (data ?? []) as Booking[];
  const now = Date.now();

  const upcoming = bookings
    .filter((b) => ACTIVE_STATUSES.includes(b.status) && new Date(b.ends_at).getTime() >= now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  const past = bookings.filter(
    (b) => !ACTIVE_STATUSES.includes(b.status) || new Date(b.ends_at).getTime() < now,
  );

  return (
    <>
      <SiteHeader />

      <main id="main" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">My bookings</h1>

        {bookings.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title="No bookings yet"
              description="When you reserve a parking space it will appear here, with your access details and a code for the gate."
              action={
                <Link href="/search" className="ps-btn ps-btn-primary">
                  Find parking
                </Link>
              }
            />
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <section className="mt-7">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Upcoming
                </h2>
                <ul className="mt-3 space-y-3">
                  {upcoming.map((booking) => (
                    <BookingRow key={booking.id} booking={booking} />
                  ))}
                </ul>
              </section>
            )}

            {past.length > 0 && (
              <section className="mt-9">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Past
                </h2>
                <ul className="mt-3 space-y-3">
                  {past.map((booking) => (
                    <BookingRow key={booking.id} booking={booking} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function BookingRow({ booking }: { booking: Booking }) {
  const snapshot = (booking.space_snapshot ?? {}) as Record<string, unknown>;
  const title = (snapshot.title as string) ?? 'Parking space';
  const locality = (snapshot.locality as string) ?? '';

  const tone =
    booking.status === 'confirmed' || booking.status === 'active'
      ? 'success'
      : booking.status === 'pending'
        ? 'warning'
        : booking.status === 'cancelled' || booking.status === 'expired' || booking.status === 'no_show'
          ? 'danger'
          : 'neutral';

  return (
    <li>
      <Card className="relative p-4 transition-shadow hover:shadow-[var(--shadow-raised)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">
              <Link
                href={`/bookings/${booking.id}`}
                className="after:absolute after:inset-0 after:content-['']"
              >
                {title}
              </Link>
            </h3>
            {locality && (
              <p className="mt-0.5 truncate text-sm text-[var(--text-muted)]">{locality}</p>
            )}
            <p className="mt-2 text-sm">
              {new Date(booking.starts_at).toLocaleString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {' to '}
              {new Date(booking.ends_at).toLocaleString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <Badge tone={tone}>{BOOKING_STATUS_LABELS[booking.status]}</Badge>
            <p className="mt-2 text-sm font-semibold tabular-nums">
              {formatPaise(booking.total_amount_paise)}
            </p>
          </div>
        </div>

        <p className="mt-2.5 font-mono text-xs text-[var(--text-muted)]">{booking.code}</p>

        {booking.status === 'pending' && booking.hold_expires_at && (
          <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
            Awaiting payment. This hold expires at{' '}
            {new Date(booking.hold_expires_at).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            .
          </p>
        )}

        {booking.overstay_amount_paise > 0 && !booking.overstay_settled && (
          <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
            Overstay charge outstanding: {formatPaise(booking.overstay_amount_paise)}
          </p>
        )}
      </Card>
    </li>
  );
}
