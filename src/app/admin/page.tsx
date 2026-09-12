import Link from 'next/link';
import { Alert, Card, EmptyState, Stat } from '@/components/ui';
import { formatPaise } from '@/lib/money';
import { adminServiceClient } from '@/lib/admin';
import { istDayStart, istMonthStart } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

interface MoneyRow {
  total_amount_paise: number;
  host_commission_paise: number;
  service_fee_paise: number;
  status: string;
}

interface SearchEventRow {
  lat: number | null;
  lng: number | null;
  query_text: string | null;
  radius_m: number | null;
  created_at: string;
}

interface SupplyGap {
  key: string;
  label: string;
  lat: number;
  lng: number;
  searches: number;
  lastSeen: string;
}

const REVENUE_STATUSES = ['confirmed', 'active', 'completed'];

/**
 * Platform overview.
 *
 * Every read here crosses an RLS boundary by design: an admin needs totals over
 * rows no single user owns. The service client is obtained only after the role
 * check in `adminServiceClient`, which returns null rather than a client when
 * the caller is not entitled to one.
 */
export default async function AdminOverviewPage() {
  let loadError: string | null = null;

  let totalUsers = 0;
  let totalHosts = 0;
  let activeListings = 0;
  let pendingModeration = 0;
  let openDisputes = 0;
  let bookingsToday = 0;
  let gmvPaise = 0;
  let revenuePaise = 0;
  let monthBookings = 0;
  let monthCancelled = 0;
  let supplyGaps: SupplyGap[] = [];
  let zeroResultTotal = 0;

  try {
    const service = await adminServiceClient();
    if (!service) throw new Error('Not authorised');

    const monthStart = istMonthStart(0).toISOString();
    const todayStart = istDayStart(0).toISOString();
    const tomorrowStart = istDayStart(1).toISOString();
    const fourteenDaysAgo = istDayStart(-14).toISOString();

    const [
      usersCount,
      hostsCount,
      activeCount,
      pendingCount,
      disputesCount,
      todayCount,
      moneyRows,
      searchRows,
    ] = await Promise.all([
      service.from('profiles').select('id', { count: 'exact', head: true }),
      service.from('host_profiles').select('user_id', { count: 'exact', head: true }),
      service
        .from('parking_spaces')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      service
        .from('parking_spaces')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_review'),
      service
        .from('disputes')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'investigating', 'awaiting_user']),
      service
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .gte('starts_at', todayStart)
        .lt('starts_at', tomorrowStart)
        .in('status', ['pending', 'confirmed', 'active', 'completed']),
      service
        .from('bookings')
        .select('total_amount_paise, host_commission_paise, service_fee_paise, status')
        .gte('starts_at', monthStart)
        .limit(5000),
      service
        .from('search_events')
        .select('lat, lng, query_text, radius_m, created_at')
        .eq('result_count', 0)
        .gte('created_at', fourteenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(2000),
    ]);

    totalUsers = usersCount.count ?? 0;
    totalHosts = hostsCount.count ?? 0;
    activeListings = activeCount.count ?? 0;
    pendingModeration = pendingCount.count ?? 0;
    openDisputes = disputesCount.count ?? 0;
    bookingsToday = todayCount.count ?? 0;

    const rows = (moneyRows.data as MoneyRow[] | null) ?? [];
    for (const row of rows) {
      if (REVENUE_STATUSES.includes(row.status)) {
        gmvPaise += Math.round(Number(row.total_amount_paise) || 0);
        revenuePaise +=
          Math.round(Number(row.host_commission_paise) || 0) +
          Math.round(Number(row.service_fee_paise) || 0);
      }
      if (['confirmed', 'active', 'completed', 'cancelled', 'no_show'].includes(row.status)) {
        monthBookings += 1;
      }
      if (row.status === 'cancelled') monthCancelled += 1;
    }

    // --------------------------------------------------------------------
    // The supply gap.
    //
    // A search that returned nothing is the cheapest demand signal this
    // product has: it names a place where somebody wanted to park and could
    // not. Grouped to roughly 1.1 km by rounding to two decimal places,
    // which is about the radius a driver will walk from.
    // --------------------------------------------------------------------
    const events = (searchRows.data as SearchEventRow[] | null) ?? [];
    zeroResultTotal = events.length;

    const grouped = new Map<string, SupplyGap & { queries: Map<string, number> }>();
    for (const event of events) {
      if (event.lat == null || event.lng == null) continue;
      const lat = Math.round(event.lat * 100) / 100;
      const lng = Math.round(event.lng * 100) / 100;
      const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;

      const existing = grouped.get(key);
      const entry =
        existing ??
        {
          key,
          label: key,
          lat,
          lng,
          searches: 0,
          lastSeen: event.created_at,
          queries: new Map<string, number>(),
        };

      entry.searches += 1;
      if (event.created_at > entry.lastSeen) entry.lastSeen = event.created_at;
      const query = event.query_text?.trim();
      if (query) entry.queries.set(query, (entry.queries.get(query) ?? 0) + 1);

      grouped.set(key, entry);
    }

    supplyGaps = Array.from(grouped.values())
      .map((entry) => {
        let topQuery: string | null = null;
        let topCount = 0;
        for (const [query, count] of entry.queries) {
          if (count > topCount) {
            topQuery = query;
            topCount = count;
          }
        }
        return {
          key: entry.key,
          label: topQuery ?? `${entry.lat.toFixed(2)}, ${entry.lng.toFixed(2)}`,
          lat: entry.lat,
          lng: entry.lng,
          searches: entry.searches,
          lastSeen: entry.lastSeen,
        };
      })
      .sort((a, b) => b.searches - a.searches)
      .slice(0, 10);
  } catch {
    loadError =
      'We could not load the platform figures. Check that SUPABASE_SERVICE_ROLE_KEY is set and that the migrations have been applied.';
  }

  const cancellationRate = monthBookings > 0 ? (monthCancelled / monthBookings) * 100 : 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Platform overview</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Everything below covers the current calendar month in India Standard Time, unless a card
          says otherwise.
        </p>
      </header>

      {loadError && (
        <Alert tone="warning" title="Figures unavailable">
          <p className="mt-1">{loadError}</p>
        </Alert>
      )}

      <section aria-labelledby="supply-heading">
        <h2 id="supply-heading" className="sr-only">
          Headline figures
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Users" value={totalUsers.toLocaleString('en-IN')} hint="All accounts" />
          <Stat label="Hosts" value={totalHosts.toLocaleString('en-IN')} hint="With a host profile" />
          <Stat
            label="Live listings"
            value={activeListings.toLocaleString('en-IN')}
            hint="Bookable right now"
          />
          <Stat
            label="Bookings today"
            value={bookingsToday.toLocaleString('en-IN')}
            hint="Starting today"
          />
          <Stat
            label="GMV this month"
            value={formatPaise(gmvPaise)}
            hint="Confirmed, active and completed"
            tone="accent"
          />
          <Stat
            label="Platform revenue"
            value={formatPaise(revenuePaise)}
            hint="Commission plus service fees"
            tone="accent"
          />
          <Stat
            label="Cancellation rate"
            value={`${cancellationRate.toFixed(1)}%`}
            hint={`${monthCancelled} of ${monthBookings} bookings this month`}
          />
          <Stat
            label="Needs attention"
            value={`${pendingModeration} + ${openDisputes}`}
            hint="Listings in review, open disputes"
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Moderation queue</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {pendingModeration === 0
              ? 'Nothing waiting. Every submitted listing has been reviewed.'
              : `${pendingModeration} ${pendingModeration === 1 ? 'listing is' : 'listings are'} waiting for a decision. A listing sitting in review is a host who has done the work and is earning nothing.`}
          </p>
          <p className="mt-4">
            <Link href="/admin/spaces" className="ps-btn ps-btn-primary">
              Open the queue
            </Link>
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold">Open disputes</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {openDisputes === 0
              ? 'No open disputes.'
              : `${openDisputes} ${openDisputes === 1 ? 'dispute needs' : 'disputes need'} a decision. Safety cases are P0 and come first.`}
          </p>
          <p className="mt-4">
            <Link href="/admin/disputes" className="ps-btn ps-btn-secondary">
              Review disputes
            </Link>
          </p>
        </Card>
      </div>

      <section aria-labelledby="gap-heading">
        <h2 id="gap-heading" className="text-lg font-semibold">
          Supply gap
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Searches in the last 14 days that returned nothing, grouped to about a kilometre. These
          are places where a driver wanted to park and we had nothing to sell, which makes them the
          list the field team should be working from. {zeroResultTotal.toLocaleString('en-IN')} such
          searches in the window.
        </p>

        <Card className="mt-3 overflow-hidden">
          {supplyGaps.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No zero result searches recorded"
                description="Either every search found something, or no searches have been logged yet. Both are worth knowing, and only one of them is good news."
              />
            </div>
          ) : (
            <div className="ps-scroll-x">
              <table className="w-full min-w-[36rem] text-sm">
                <caption className="sr-only">
                  Areas where searches returned no results, most searched first
                </caption>
                <thead>
                  <tr className="border-b bg-[var(--surface-sunken)] text-left">
                    <Th>Area</Th>
                    <Th>Coordinates</Th>
                    <Th align="right">Empty searches</Th>
                    <Th>Map</Th>
                  </tr>
                </thead>
                <tbody>
                  {supplyGaps.map((gap) => (
                    <tr key={gap.key} className="border-b last:border-b-0">
                      <Td>{gap.label}</Td>
                      <Td>
                        <span className="font-mono text-xs">
                          {gap.lat.toFixed(2)}, {gap.lng.toFixed(2)}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="font-bold tabular-nums">{gap.searches}</span>
                      </Td>
                      <Td>
                        <Link
                          href={`/search?lat=${gap.lat}&lng=${gap.lng}&radius_m=2000`}
                          className="font-semibold text-[var(--accent-text)] hover:underline"
                        >
                          Search here
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)] ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <td className={`px-3 py-2.5 align-top ${align === 'right' ? 'text-right tabular-nums' : ''}`}>
      {children}
    </td>
  );
}
