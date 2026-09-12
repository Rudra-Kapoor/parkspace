import Link from 'next/link';
import { Alert, Card, EmptyState, Stat } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { formatPaise } from '@/lib/money';
import {
  formatDateTime,
  formatMonth,
  istMonthKey,
  istMonthStart,
  PAYOUT_STATUS_LABELS,
  labelFor,
} from '@/lib/dashboard';
import { EarningsChart, type MonthlyEarning } from './earnings-chart';

export const dynamic = 'force-dynamic';

interface CompletedBooking {
  id: string;
  code: string;
  ends_at: string;
  base_amount_paise: number;
  discount_amount_paise: number;
  host_commission_paise: number;
  host_payout_paise: number;
  commission_rate_bp: number;
  parking_spaces: { title: string } | null;
}

interface PayoutRow {
  id: string;
  amount_paise: number;
  status: string;
  booking_count: number;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  scheduled_for: string | null;
}

const MONTHS_CHARTED = 12;

/**
 * Earnings.
 *
 * Every number here is derived from the booking rows themselves rather than
 * from a running total, so it can always be reconciled: the table under the
 * chart adds up to the chart, and the chart adds up to the lifetime figure.
 */
export default async function HostEarningsPage() {
  let completed: CompletedBooking[] = [];
  let payouts: PayoutRow[] = [];
  let payableBalancePaise = 0;
  let lifetimePaise = 0;
  let loadError: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('No session');

    const chartStart = istMonthStart(-(MONTHS_CHARTED - 1));

    const [bookingsResult, hostProfileResult, payoutsResult] = await Promise.all([
      supabase
        .from('bookings')
        .select(
          'id, code, ends_at, base_amount_paise, discount_amount_paise, host_commission_paise, host_payout_paise, commission_rate_bp, parking_spaces(title)',
        )
        .eq('host_id', user.id)
        .eq('status', 'completed')
        .gte('ends_at', chartStart.toISOString())
        .order('ends_at', { ascending: false })
        .limit(500),
      supabase
        .from('host_profiles')
        .select('payable_balance_paise, total_earnings_paise')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('payouts')
        .select('id, amount_paise, status, booking_count, period_start, period_end, paid_at, scheduled_for')
        .eq('host_id', user.id)
        .order('created_at', { ascending: false })
        .limit(12),
    ]);

    completed = (bookingsResult.data as CompletedBooking[] | null) ?? [];
    payouts = (payoutsResult.data as PayoutRow[] | null) ?? [];

    const hostProfile = hostProfileResult.data as
      | { payable_balance_paise: number; total_earnings_paise: number }
      | null;
    payableBalancePaise = Math.round(Number(hostProfile?.payable_balance_paise ?? 0));
    lifetimePaise = Math.round(Number(hostProfile?.total_earnings_paise ?? 0));
  } catch {
    loadError =
      'We could not load your earnings. The database may be unreachable, or the migrations may not have been applied yet.';
  }

  // Bucket by IST month. Buckets are created for every month in the window so a
  // quiet month reads as a zero bar rather than disappearing from the axis.
  const buckets = new Map<string, MonthlyEarning>();
  const bucketOrder: string[] = [];
  for (let offset = MONTHS_CHARTED - 1; offset >= 0; offset -= 1) {
    const start = istMonthStart(-offset);
    const key = istMonthKey(start);
    bucketOrder.push(key);
    buckets.set(key, { month: formatMonth(start), payoutPaise: 0, bookings: 0 });
  }

  for (const booking of completed) {
    const bucket = buckets.get(istMonthKey(booking.ends_at));
    if (!bucket) continue;
    bucket.payoutPaise += Math.round(Number(booking.host_payout_paise) || 0);
    bucket.bookings += 1;
  }

  const chartData: MonthlyEarning[] = bucketOrder.map(
    (key) => buckets.get(key) ?? { month: '', payoutPaise: 0, bookings: 0 },
  );

  const thisMonthKey = bucketOrder[bucketOrder.length - 1];
  const lastMonthKey = bucketOrder[bucketOrder.length - 2];
  const thisMonthPaise = thisMonthKey ? (buckets.get(thisMonthKey)?.payoutPaise ?? 0) : 0;
  const lastMonthPaise = lastMonthKey ? (buckets.get(lastMonthKey)?.payoutPaise ?? 0) : 0;

  const windowTotalPaise = chartData.reduce((total, entry) => total + entry.payoutPaise, 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Earnings</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          What your spaces have made, booking by booking.
        </p>
      </header>

      {loadError && (
        <Alert tone="warning" title="Nothing to show">
          <p className="mt-1">{loadError}</p>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Payable now"
          value={formatPaise(payableBalancePaise)}
          hint="Released 24 hours after checkout"
          tone="accent"
        />
        <Stat label="This month" value={formatPaise(thisMonthPaise)} hint="Completed stays" />
        <Stat label="Last month" value={formatPaise(lastMonthPaise)} hint="Completed stays" />
        <Stat
          label="Lifetime"
          value={formatPaise(lifetimePaise > 0 ? lifetimePaise : windowTotalPaise)}
          hint={lifetimePaise > 0 ? 'All time, after commission' : 'Last 12 months, after commission'}
        />
      </div>

      <Alert tone="info" title="How and when you are paid">
        <p className="mt-1">
          A booking becomes payable 24 hours after the driver checks out. The delay is the window
          in which a dispute can be raised, and paying out before it closes would mean clawing money
          back afterwards.
        </p>
        <p className="mt-2">
          This build does not move real money. Payouts are recorded and shown, and the payment
          provider is a mock adapter, so nothing here reaches a bank account.
        </p>
      </Alert>

      <section aria-labelledby="chart-heading">
        <h2 id="chart-heading" className="text-lg font-semibold">
          Month by month
        </h2>
        <Card className="mt-3 p-4">
          <EarningsChart data={chartData} />
        </Card>
      </section>

      <section aria-labelledby="bookings-heading">
        <h2 id="bookings-heading" className="text-lg font-semibold">
          Completed bookings
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          The commission is taken from the amount the driver paid for the space, before the service
          fee they pay on top. That fee is not yours and is never deducted from your share.
        </p>

        {completed.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No completed stays yet"
              description="A booking appears here once the driver has checked out."
              action={
                <Link href="/host/bookings" className="ps-btn ps-btn-secondary">
                  See upcoming bookings
                </Link>
              }
            />
          </div>
        ) : (
          <Card className="mt-3 overflow-hidden">
            <div className="ps-scroll-x">
              <table className="w-full min-w-[44rem] text-sm">
                <caption className="sr-only">
                  Completed bookings with the base amount, commission and payout for each
                </caption>
                <thead>
                  <tr className="border-b bg-[var(--surface-sunken)] text-left">
                    <Th>Ended</Th>
                    <Th>Space</Th>
                    <Th>Code</Th>
                    <Th align="right">Base</Th>
                    <Th align="right">Commission</Th>
                    <Th align="right">Your payout</Th>
                  </tr>
                </thead>
                <tbody>
                  {completed.map((booking) => {
                    const base = Math.round(Number(booking.base_amount_paise) || 0);
                    const discount = Math.round(Number(booking.discount_amount_paise) || 0);
                    const commission = Math.round(Number(booking.host_commission_paise) || 0);
                    const payout = Math.round(Number(booking.host_payout_paise) || 0);
                    return (
                      <tr key={booking.id} className="border-b last:border-b-0">
                        <Td>{formatDateTime(booking.ends_at)}</Td>
                        <Td>{booking.parking_spaces?.title ?? 'Your space'}</Td>
                        <Td>
                          <Link
                            href={`/bookings/${booking.id}`}
                            className="font-mono text-xs hover:underline"
                          >
                            {booking.code}
                          </Link>
                        </Td>
                        <Td align="right">
                          {formatPaise(base)}
                          {discount > 0 && (
                            <span className="block text-xs text-[var(--text-muted)]">
                              less {formatPaise(discount)} discount
                            </span>
                          )}
                        </Td>
                        <Td align="right">
                          <span className="text-[var(--text-muted)]">
                            −{formatPaise(commission)}
                          </span>
                          <span className="block text-xs text-[var(--text-muted)]">
                            {(Number(booking.commission_rate_bp) / 100).toFixed(1)}%
                          </span>
                        </Td>
                        <Td align="right">
                          <span className="font-bold">{formatPaise(payout)}</span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {payouts.length > 0 && (
        <section aria-labelledby="payouts-heading">
          <h2 id="payouts-heading" className="text-lg font-semibold">
            Payout runs
          </h2>
          <Card className="mt-3 overflow-hidden">
            <div className="ps-scroll-x">
              <table className="w-full min-w-[34rem] text-sm">
                <caption className="sr-only">Payout runs and their status</caption>
                <thead>
                  <tr className="border-b bg-[var(--surface-sunken)] text-left">
                    <Th>Period</Th>
                    <Th>Bookings</Th>
                    <Th>Status</Th>
                    <Th align="right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((payout) => (
                    <tr key={payout.id} className="border-b last:border-b-0">
                      <Td>
                        {formatDateTime(payout.period_start)} to {formatDateTime(payout.period_end)}
                      </Td>
                      <Td>{payout.booking_count}</Td>
                      <Td>
                        {labelFor(PAYOUT_STATUS_LABELS, payout.status)}
                        {payout.paid_at && (
                          <span className="block text-xs text-[var(--text-muted)]">
                            {formatDateTime(payout.paid_at)}
                          </span>
                        )}
                      </Td>
                      <Td align="right">
                        <span className="font-bold">
                          {formatPaise(Math.round(Number(payout.amount_paise) || 0))}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}
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
