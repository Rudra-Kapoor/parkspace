import Link from 'next/link';
import { Alert, Badge, Card, EmptyState, Rating, Stat } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { formatPaise } from '@/lib/money';
import {
  BOOKING_STATUS_TONES,
  formatDateTime,
  formatShortDate,
  formatTime,
  istDayStart,
  istMonthStart,
  labelFor,
  LISTING_STATUS_LABELS,
  LISTING_STATUS_TONES,
  toneFor,
} from '@/lib/dashboard';
import { BOOKING_STATUS_LABELS } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface HostProfileRow {
  display_name: string;
  is_superhost: boolean;
  kyc_status: string;
  payable_balance_paise: number;
  total_earnings_paise: number;
}

interface SpaceRow {
  id: string;
  title: string;
  status: string;
  capacity: number;
  avg_rating: number | null;
  review_count: number;
}

interface BookingRow {
  id: string;
  code: string;
  status: string;
  starts_at: string;
  ends_at: string;
  host_payout_paise: number;
  total_amount_paise: number;
  space_id: string;
  parking_spaces: { title: string; locality: string } | null;
}

/**
 * Host overview.
 *
 * Answers the three questions a host actually opens this page with, in order:
 * who is arriving today, what is coming, and how much have I made. Anything
 * that does not serve one of those is a link rather than a panel.
 */
export default async function HostOverviewPage() {
  let loadError: string | null = null;
  let hostProfile: HostProfileRow | null = null;
  let spaces: SpaceRow[] = [];
  let windowBookings: BookingRow[] = [];
  let monthEarningsPaise = 0;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error('No session');

    const todayStart = istDayStart(0);
    const weekEnd = istDayStart(8);
    const monthStart = istMonthStart(0);

    const [hostProfileResult, spacesResult, bookingsResult, earningsResult] = await Promise.all([
      supabase
        .from('host_profiles')
        .select('display_name, is_superhost, kyc_status, payable_balance_paise, total_earnings_paise')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('parking_spaces')
        .select('id, title, status, capacity, avg_rating, review_count')
        .eq('host_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('bookings')
        .select(
          'id, code, status, starts_at, ends_at, host_payout_paise, total_amount_paise, space_id, parking_spaces(title, locality)',
        )
        .eq('host_id', user.id)
        .gte('starts_at', todayStart.toISOString())
        .lt('starts_at', weekEnd.toISOString())
        .in('status', ['pending', 'confirmed', 'active', 'completed'])
        .order('starts_at', { ascending: true })
        .limit(100),
      supabase
        .from('bookings')
        .select('host_payout_paise')
        .eq('host_id', user.id)
        .eq('status', 'completed')
        .gte('ends_at', monthStart.toISOString())
        .limit(2000),
    ]);

    hostProfile = (hostProfileResult.data as HostProfileRow | null) ?? null;
    spaces = (spacesResult.data as SpaceRow[] | null) ?? [];
    windowBookings = (bookingsResult.data as BookingRow[] | null) ?? [];

    const earningsRows = (earningsResult.data as Array<{ host_payout_paise: number }> | null) ?? [];
    monthEarningsPaise = earningsRows.reduce(
      (total, row) => total + Math.round(Number(row.host_payout_paise) || 0),
      0,
    );
  } catch {
    loadError =
      'We could not load your hosting data. The database may still be starting up, or the migrations may not have been applied yet.';
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Hosting</h1>
        <Alert tone="warning" title="Nothing to show yet">
          <p className="mt-1">{loadError}</p>
        </Alert>
      </div>
    );
  }

  const tomorrowStartMs = istDayStart(1).getTime();
  const todayBookings = windowBookings.filter(
    (booking) => new Date(booking.starts_at).getTime() < tomorrowStartMs,
  );
  const upcomingBookings = windowBookings.filter(
    (booking) => new Date(booking.starts_at).getTime() >= tomorrowStartMs,
  );

  const statusCounts = spaces.reduce<Record<string, number>>((counts, space) => {
    counts[space.status] = (counts[space.status] ?? 0) + 1;
    return counts;
  }, {});

  const ratedSpaces = spaces.filter((space) => space.avg_rating != null && space.review_count > 0);
  const totalReviews = ratedSpaces.reduce((total, space) => total + space.review_count, 0);
  const averageRating =
    totalReviews > 0
      ? ratedSpaces.reduce(
          (total, space) => total + (space.avg_rating ?? 0) * space.review_count,
          0,
        ) / totalReviews
      : null;

  const payableBalancePaise = Math.round(Number(hostProfile?.payable_balance_paise ?? 0));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {hostProfile ? `Hello, ${hostProfile.display_name}` : 'Hosting'}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Everything about the spaces you rent out, in one place.
          </p>
        </div>
        {spaces.length > 0 && (
          <Link href="/host/spaces/new" className="ps-btn ps-btn-primary">
            New listing
          </Link>
        )}
      </header>

      {!hostProfile && (
        <Alert tone="warning" title="Finish setting up your host profile">
          <p className="mt-1">
            Drivers see your host name and a short bio next to every listing. It takes a minute
            and it measurably improves the chance of a booking.
          </p>
          <p className="mt-3">
            <Link href="/host/settings" className="ps-btn ps-btn-secondary">
              Set up your host profile
            </Link>
          </p>
        </Alert>
      )}

      {spaces.length === 0 ? (
        <Card className="p-6 sm:p-8">
          <p className="ps-badge ps-badge-accent w-fit">Nothing listed yet</p>
          <h2 className="mt-4 text-xl font-bold tracking-tight sm:text-2xl">
            List your first space
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--text-muted)]">
            The wizard walks through location, size, access, availability and price. Most hosts
            finish in under ten minutes, and you can leave and come back without losing anything.
            Once you submit it, our team reviews the listing before it goes live.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/host/spaces/new" className="ps-btn ps-btn-primary">
              Start a listing
            </Link>
            <Link href="/list-your-space" className="ps-btn ps-btn-secondary">
              How hosting works
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <section aria-label="Summary">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Arriving today"
                value={todayBookings.length}
                hint={
                  todayBookings.length === 0
                    ? 'No cars expected today'
                    : `${todayBookings.length === 1 ? 'One booking' : `${todayBookings.length} bookings`} starting today`
                }
              />
              <Stat
                label="Earned this month"
                value={formatPaise(monthEarningsPaise)}
                hint="From completed stays, after commission"
                tone="accent"
              />
              <Stat
                label="Payable balance"
                value={formatPaise(payableBalancePaise)}
                hint="Released 24 hours after checkout"
              />
              <Stat
                label="Average rating"
                value={averageRating != null ? averageRating.toFixed(1) : 'No reviews'}
                hint={totalReviews > 0 ? `Across ${totalReviews} reviews` : 'Reviews appear after a stay'}
              />
            </div>
          </section>

          <section aria-labelledby="today-heading">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="today-heading" className="text-lg font-semibold">
                Today
              </h2>
              <span className="text-sm text-[var(--text-muted)]">{formatShortDate(new Date())}</span>
            </div>
            <div className="mt-3">
              {todayBookings.length === 0 ? (
                <EmptyState
                  title="Nothing arriving today"
                  description="When a driver books one of your spaces for today, they appear here with their arrival time."
                />
              ) : (
                <ul className="space-y-3">
                  {todayBookings.map((booking) => (
                    <BookingLine key={booking.id} booking={booking} />
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section aria-labelledby="upcoming-heading">
            <h2 id="upcoming-heading" className="text-lg font-semibold">
              Next 7 days
            </h2>
            <div className="mt-3">
              {upcomingBookings.length === 0 ? (
                <EmptyState
                  title="Nothing booked in the week ahead"
                  description="Check your availability and price if the week stays empty. Both are the usual reason a live listing gets no bookings."
                  action={
                    <Link href="/host/calendar" className="ps-btn ps-btn-secondary">
                      Open the calendar
                    </Link>
                  }
                />
              ) : (
                <ul className="space-y-3">
                  {upcomingBookings.slice(0, 8).map((booking) => (
                    <BookingLine key={booking.id} booking={booking} showDate />
                  ))}
                </ul>
              )}
            </div>
            {upcomingBookings.length > 8 && (
              <p className="mt-3 text-sm">
                <Link href="/host/bookings" className="font-semibold text-[var(--accent-text)] hover:underline">
                  See all {upcomingBookings.length} upcoming bookings
                </Link>
              </p>
            )}
          </section>

          <section aria-labelledby="spaces-heading">
            <h2 id="spaces-heading" className="text-lg font-semibold">
              Your spaces
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(statusCounts).map(([status, count]) => (
                <Badge key={status} tone={toneFor(LISTING_STATUS_TONES, status)}>
                  {count} {labelFor(LISTING_STATUS_LABELS, status).toLowerCase()}
                </Badge>
              ))}
            </div>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {spaces.slice(0, 4).map((space) => (
                <Card key={space.id} as="li" className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/host/spaces?space=${space.id}`}
                      className="font-semibold hover:text-[var(--accent-text)]"
                    >
                      {space.title}
                    </Link>
                    <Badge tone={toneFor(LISTING_STATUS_TONES, space.status)}>
                      {labelFor(LISTING_STATUS_LABELS, space.status)}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]">
                    <Rating value={space.avg_rating} count={space.review_count} />
                    <span>
                      {space.capacity} {space.capacity === 1 ? 'bay' : 'bays'}
                    </span>
                  </div>
                </Card>
              ))}
            </ul>
            {spaces.length > 4 && (
              <p className="mt-3 text-sm">
                <Link href="/host/spaces" className="font-semibold text-[var(--accent-text)] hover:underline">
                  Manage all {spaces.length} spaces
                </Link>
              </p>
            )}
          </section>
        </>
      )}

      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="text-lg font-semibold">
          Quick actions
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickAction
            href="/host/spaces/new"
            title="Add a space"
            body="List another driveway, bay or garage."
          />
          <QuickAction
            href="/host/calendar"
            title="Block some dates"
            body="Going away, or need the space yourself? Close it off."
          />
          <QuickAction
            href="/host/earnings"
            title="Check earnings"
            body="What each booking paid, and what is payable now."
          />
          <QuickAction
            href="/host/reviews"
            title="Reply to reviews"
            body="A reply from the host is read by every future driver."
          />
          <QuickAction
            href="/host/settings"
            title="Host profile"
            body="Your display name, bio and verification status."
          />
          <QuickAction
            href="/host/bookings"
            title="Check someone in"
            body="Look up a booking code when a driver arrives at the gate."
          />
        </div>
      </section>
    </div>
  );
}

function BookingLine({ booking, showDate }: { booking: BookingRow; showDate?: boolean }) {
  return (
    <Card as="li" className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/bookings/${booking.id}`}
            className="font-semibold hover:text-[var(--accent-text)]"
          >
            {booking.parking_spaces?.title ?? 'Your space'}
          </Link>
          <Badge tone={toneFor(BOOKING_STATUS_TONES, booking.status)}>
            {labelFor(BOOKING_STATUS_LABELS, booking.status)}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {showDate ? (
            <>
              {formatDateTime(booking.starts_at)} to {formatTime(booking.ends_at)}
            </>
          ) : (
            <>
              {formatTime(booking.starts_at)} to {formatTime(booking.ends_at)}
            </>
          )}
          {' · '}
          <span className="font-mono text-xs">{booking.code}</span>
        </p>
      </div>
      <p className="shrink-0 text-right">
        <span className="block text-sm font-bold tabular-nums">
          {formatPaise(Math.round(Number(booking.host_payout_paise) || 0))}
        </span>
        <span className="block text-xs text-[var(--text-muted)]">your payout</span>
      </p>
    </Card>
  );
}

function QuickAction({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="ps-card group p-4 transition-shadow hover:shadow-[var(--shadow-raised)]">
      <h3 className="font-semibold group-hover:text-[var(--accent-text)]">{title}</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{body}</p>
    </Link>
  );
}
