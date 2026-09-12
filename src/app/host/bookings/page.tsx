import Link from 'next/link';
import { Alert, Badge, Card, EmptyState } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { formatPaise } from '@/lib/money';
import {
  BOOKING_STATUS_TONES,
  formatDateTime,
  formatDuration,
  formatTime,
  istDayStart,
  labelFor,
  minutesBetween,
  one,
  toneFor,
} from '@/lib/dashboard';
import { BOOKING_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface VehicleEmbed {
  registration_number: string;
  vehicle_type: string;
  make: string | null;
  model: string | null;
  colour: string | null;
}

interface BookingRow {
  id: string;
  code: string;
  status: string;
  starts_at: string;
  ends_at: string;
  driver_id: string;
  bay_index: number;
  qr_token: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  host_payout_paise: number;
  total_amount_paise: number;
  driver_notes: string | null;
  parking_spaces: { title: string; locality: string } | { title: string; locality: string }[] | null;
  vehicles: VehicleEmbed | VehicleEmbed[] | null;
}

/**
 * The host's bookings.
 *
 * The driver's name comes from public_profiles rather than profiles: a host is
 * entitled to know who is arriving, not to the driver's full record. The
 * registration comes from the vehicle row, which a policy releases to the host
 * only for the duration of a live booking.
 */
export default async function HostBookingsPage() {
  let bookings: BookingRow[] = [];
  let driverNames = new Map<string, string>();
  let loadError: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('No session');

    const { data, error } = await supabase
      .from('bookings')
      .select(
        'id, code, status, starts_at, ends_at, driver_id, bay_index, qr_token, checked_in_at, checked_out_at, host_payout_paise, total_amount_paise, driver_notes, parking_spaces(title, locality), vehicles(registration_number, vehicle_type, make, model, colour)',
      )
      .eq('host_id', user.id)
      .order('starts_at', { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);
    bookings = (data as unknown as BookingRow[] | null) ?? [];

    const driverIds = Array.from(new Set(bookings.map((booking) => booking.driver_id)));
    if (driverIds.length > 0) {
      const { data: profiles } = await supabase
        .from('public_profiles')
        .select('id, full_name')
        .in('id', driverIds);

      for (const row of (profiles as Array<{ id: string; full_name: string | null }> | null) ?? []) {
        driverNames.set(row.id, row.full_name ?? 'A ParkSpace driver');
      }
    }
  } catch {
    loadError =
      'We could not load your bookings. The database may be unreachable, or the migrations may not have been applied yet.';
  }

  const todayStartMs = istDayStart(0).getTime();
  const tomorrowStartMs = istDayStart(1).getTime();

  const today: BookingRow[] = [];
  const upcoming: BookingRow[] = [];
  const past: BookingRow[] = [];

  for (const booking of bookings) {
    const startsMs = new Date(booking.starts_at).getTime();
    if (startsMs >= todayStartMs && startsMs < tomorrowStartMs) today.push(booking);
    else if (startsMs >= tomorrowStartMs) upcoming.push(booking);
    else past.push(booking);
  }

  today.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  upcoming.sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Everyone who has booked one of your spaces, and the code each of them will show you.
        </p>
      </header>

      {loadError && (
        <Alert tone="warning" title="Nothing to show">
          <p className="mt-1">{loadError}</p>
        </Alert>
      )}

      {!loadError && bookings.length === 0 && (
        <EmptyState
          title="No bookings yet"
          description="Once a driver reserves one of your spaces, they appear here with their arrival time, their vehicle and the code to check them in."
          action={
            <Link href="/host/spaces" className="ps-btn ps-btn-secondary">
              Check your listings
            </Link>
          }
        />
      )}

      <BookingGroup
        heading="Today"
        bookings={today}
        driverNames={driverNames}
        emptyNote="Nothing arriving today."
        showTimeOnly
      />
      <BookingGroup
        heading="Upcoming"
        bookings={upcoming}
        driverNames={driverNames}
        emptyNote="Nothing booked ahead."
      />
      <BookingGroup
        heading="Past"
        bookings={past.slice(0, 50)}
        driverNames={driverNames}
        emptyNote="Nothing has happened yet."
      />
    </div>
  );
}

function BookingGroup({
  heading,
  bookings,
  driverNames,
  emptyNote,
  showTimeOnly,
}: {
  heading: string;
  bookings: BookingRow[];
  driverNames: Map<string, string>;
  emptyNote: string;
  showTimeOnly?: boolean;
}) {
  return (
    <section aria-labelledby={`group-${heading.toLowerCase()}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`group-${heading.toLowerCase()}`} className="text-lg font-semibold">
          {heading}
        </h2>
        <span className="text-sm text-[var(--text-muted)]">
          {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'}
        </span>
      </div>

      {bookings.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">{emptyNote}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              driverName={driverNames.get(booking.driver_id) ?? 'A ParkSpace driver'}
              showTimeOnly={showTimeOnly}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function BookingCard({
  booking,
  driverName,
  showTimeOnly,
}: {
  booking: BookingRow;
  driverName: string;
  showTimeOnly?: boolean;
}) {
  const vehicle = one(booking.vehicles);
  const descriptors = [vehicle?.colour, vehicle?.make, vehicle?.model].filter(Boolean).join(' ');
  const duration = formatDuration(minutesBetween(booking.starts_at, booking.ends_at));
  const liveish = ['pending', 'confirmed', 'active'].includes(booking.status);

  return (
    <Card as="li" className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/bookings/${booking.id}`}
              className="font-semibold hover:text-[var(--accent-text)]"
            >
              {one(booking.parking_spaces)?.title ?? 'Your space'}
            </Link>
            <Badge tone={toneFor(BOOKING_STATUS_TONES, booking.status)}>
              {labelFor(BOOKING_STATUS_LABELS, booking.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {driverName} · {duration}
          </p>
        </div>

        <p className="shrink-0 text-right">
          <span className="block text-sm font-bold tabular-nums">
            {formatPaise(Math.round(Number(booking.host_payout_paise) || 0))}
          </span>
          <span className="block text-xs text-[var(--text-muted)]">your payout</span>
        </p>
      </div>

      <dl className="ps-scroll-x mt-4 flex gap-6 border-t pt-4 text-sm">
        <Fact label="Arrives">
          {showTimeOnly ? formatTime(booking.starts_at) : formatDateTime(booking.starts_at)}
        </Fact>
        <Fact label="Leaves">
          {showTimeOnly ? formatTime(booking.ends_at) : formatDateTime(booking.ends_at)}
        </Fact>
        <Fact label="Vehicle">
          {vehicle ? (
            <>
              <span className="font-mono font-bold">{vehicle.registration_number}</span>
              {descriptors && (
                <span className="block text-xs font-normal text-[var(--text-muted)]">
                  {descriptors} · {labelFor(VEHICLE_TYPE_LABELS, vehicle.vehicle_type)}
                </span>
              )}
            </>
          ) : (
            'Not stated'
          )}
        </Fact>
        <Fact label="Bay">{booking.bay_index + 1}</Fact>
        <Fact label="Booking code">
          <span className="font-mono">{booking.code}</span>
        </Fact>
      </dl>

      {liveish && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Check in by hand
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            The driver sees a QR code in their app. If scanning fails, ask them to read out the
            verification code and compare it with this one.
          </p>
          <p className="mt-2 break-all font-mono text-sm font-bold">{booking.qr_token}</p>
        </div>
      )}

      {booking.driver_notes && (
        <p className="mt-3 text-sm">
          <span className="text-[var(--text-muted)]">Note from the driver: </span>
          {booking.driver_notes}
        </p>
      )}

      {(booking.checked_in_at || booking.checked_out_at) && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {booking.checked_in_at && <>Checked in {formatDateTime(booking.checked_in_at)}. </>}
          {booking.checked_out_at && <>Checked out {formatDateTime(booking.checked_out_at)}.</>}
        </p>
      )}
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="shrink-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-nowrap font-medium">{children}</dd>
    </div>
  );
}
