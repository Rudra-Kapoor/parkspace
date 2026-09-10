import Link from 'next/link';
import { Alert, Badge, Card, EmptyState } from '@/components/ui';
import { TableShell, THead, Th, Td, Tr } from '@/components/table';
import { formatPaise } from '@/lib/money';
import { adminServiceClient } from '@/lib/admin';
import {
  BOOKING_STATUS_TONES,
  formatDateTime,
  formatDuration,
  labelFor,
  minutesBetween,
  one,
  toneFor,
} from '@/lib/dashboard';
import { BOOKING_STATUS_LABELS, type BookingStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface BookingRow {
  id: string;
  code: string;
  status: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  driver_id: string;
  host_id: string;
  total_amount_paise: number;
  host_payout_paise: number;
  host_commission_paise: number;
  service_fee_paise: number;
  refund_amount_paise: number;
  cancelled_by: string | null;
  overstay_minutes: number;
  parking_spaces: { title: string; city: string } | { title: string; city: string }[] | null;
}

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Any status' },
  ...(Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[]).map((status) => ({
    value: status,
    label: BOOKING_STATUS_LABELS[status],
  })),
];

/**
 * Bookings, read only.
 *
 * Nothing on this page changes a booking. A booking is a contract between two
 * people and a chain of money movements, and the only safe ways to change one
 * are the operations that also write the events, the refunds and the audit
 * trail. An admin who needs to intervene does it through a dispute.
 */
export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const status = params.status && params.status !== 'all' ? params.status : 'all';
  const query = (params.q ?? '').trim();

  let bookings: BookingRow[] = [];
  let names = new Map<string, string>();
  let loadError: string | null = null;

  try {
    const service = await adminServiceClient();
    if (!service) throw new Error('Not authorised');

    let request = service
      .from('bookings')
      .select(
        'id, code, status, starts_at, ends_at, created_at, driver_id, host_id, total_amount_paise, host_payout_paise, host_commission_paise, service_fee_paise, refund_amount_paise, cancelled_by, overstay_minutes, parking_spaces(title, city)',
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (status !== 'all') request = request.eq('status', status);
    if (query) request = request.ilike('code', `%${query.replace(/[%,()]/g, '')}%`);

    const { data, error } = await request;
    if (error) throw new Error(error.message);

    bookings = (data as unknown as BookingRow[] | null) ?? [];

    const personIds = Array.from(
      new Set(bookings.flatMap((booking) => [booking.driver_id, booking.host_id])),
    );
    if (personIds.length > 0) {
      const { data: profiles } = await service
        .from('profiles')
        .select('id, full_name')
        .in('id', personIds);
      for (const row of (profiles as Array<{ id: string; full_name: string | null }> | null) ?? []) {
        names.set(row.id, row.full_name ?? 'Unnamed');
      }
    }
  } catch {
    loadError =
      'We could not load bookings. Check that SUPABASE_SERVICE_ROLE_KEY is set and that the migrations have been applied.';
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Read only. The 100 most recent bookings matching the filters.
        </p>
      </header>

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto]" method="get">
          <div>
            <label className="ps-label" htmlFor="q">
              Booking code
            </label>
            <input id="q" name="q" className="ps-input" defaultValue={query} placeholder="PS-XXXXXX" />
          </div>
          <div>
            <label className="ps-label" htmlFor="status">
              Status
            </label>
            <select id="status" name="status" className="ps-input" defaultValue={status}>
              {STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className="ps-btn ps-btn-primary w-full">
              Filter
            </button>
          </div>
        </form>
      </Card>

      {loadError && (
        <Alert tone="warning" title="Bookings unavailable">
          <p className="mt-1">{loadError}</p>
        </Alert>
      )}

      {!loadError && bookings.length === 0 && (
        <EmptyState
          title="No bookings match"
          description="Clear the filters, or check the booking code. Codes are case insensitive."
        />
      )}

      {bookings.length > 0 && (
        <Card className="overflow-hidden">
          <TableShell caption="Bookings with their times, parties and money" minWidth="62rem">
            <THead>
              <Th>Code</Th>
              <Th>Space</Th>
              <Th>Driver</Th>
              <Th>Host</Th>
              <Th>When</Th>
              <Th>Status</Th>
              <Th align="right">Total</Th>
              <Th align="right">Platform</Th>
              <Th align="right">Payout</Th>
            </THead>
            <tbody>
              {bookings.map((booking) => {
                const space = one(booking.parking_spaces);
                const platform =
                  Math.round(Number(booking.host_commission_paise) || 0) +
                  Math.round(Number(booking.service_fee_paise) || 0);
                const refunded = Math.round(Number(booking.refund_amount_paise) || 0);

                return (
                  <Tr key={booking.id}>
                    <Td>
                      <Link href={`/bookings/${booking.id}`} className="font-mono text-xs hover:underline">
                        {booking.code}
                      </Link>
                      <span className="block text-xs text-[var(--text-muted)]">
                        Booked {formatDateTime(booking.created_at)}
                      </span>
                    </Td>
                    <Td>
                      {space?.title ?? 'Removed listing'}
                      {space?.city && (
                        <span className="block text-xs text-[var(--text-muted)]">{space.city}</span>
                      )}
                    </Td>
                    <Td>{names.get(booking.driver_id) ?? 'Unknown'}</Td>
                    <Td>{names.get(booking.host_id) ?? 'Unknown'}</Td>
                    <Td>
                      {formatDateTime(booking.starts_at)}
                      <span className="block text-xs text-[var(--text-muted)]">
                        {formatDuration(minutesBetween(booking.starts_at, booking.ends_at))}
                        {booking.overstay_minutes > 0 && (
                          <> · overstayed {formatDuration(booking.overstay_minutes)}</>
                        )}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={toneFor(BOOKING_STATUS_TONES, booking.status)}>
                        {labelFor(BOOKING_STATUS_LABELS, booking.status)}
                      </Badge>
                      {booking.cancelled_by && (
                        <span className="block text-xs text-[var(--text-muted)]">
                          by {booking.cancelled_by}
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      {formatPaise(Math.round(Number(booking.total_amount_paise) || 0))}
                      {refunded > 0 && (
                        <span className="block text-xs text-[var(--text-muted)]">
                          refunded {formatPaise(refunded)}
                        </span>
                      )}
                    </Td>
                    <Td align="right">{formatPaise(platform)}</Td>
                    <Td align="right">
                      {formatPaise(Math.round(Number(booking.host_payout_paise) || 0))}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableShell>
        </Card>
      )}
    </div>
  );
}
