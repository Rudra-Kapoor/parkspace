import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { mmToMetres } from '@/lib/dashboard';
import { paiseToRupees } from '@/lib/money';
import type { CancellationPolicy, SpaceType, VehicleType } from '@/lib/types';
import { EditListingForm, type EditableSpace } from './edit-form';

export const dynamic = 'force-dynamic';

interface SpaceRow {
  id: string;
  title: string;
  description: string | null;
  address_line: string | null;
  landmark: string | null;
  locality: string;
  city: string;
  state: string;
  postal_code: string | null;
  exact_lat: number | null;
  exact_lng: number | null;
  approx_lat: number;
  approx_lng: number;
  space_type: SpaceType;
  vehicle_types: VehicleType[];
  capacity: number;
  max_length_mm: number | null;
  max_width_mm: number | null;
  max_height_mm: number | null;
  amenities: string[];
  rules: string[];
  price_hourly_paise: number | null;
  price_daily_paise: number | null;
  price_monthly_paise: number | null;
  min_booking_minutes: number;
  max_booking_minutes: number | null;
  min_notice_minutes: number;
  instant_book: boolean;
  cancellation_policy: CancellationPolicy;
  host_id: string;
}

function rupeesOrBlank(paise: number | null): string {
  if (paise == null) return '';
  return String(paiseToRupees(Math.round(Number(paise))));
}

/**
 * Edit one listing.
 *
 * Reads through public_spaces rather than the base table, because that view is
 * where the conditional address release is implemented. A host reading their
 * own listing gets the exact address back from it; anyone else would not, and
 * this page would render blank rather than leaking.
 */
export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let space: SpaceRow | null = null;
  let status = 'draft';
  let loadError: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('No session');

    // Two reads, because the two things needed here live in two places. The
    // public_spaces view is where the conditional address release happens and
    // deliberately carries no moderation state; status is a granted column on
    // the base table.
    const [viewResult, statusResult] = await Promise.all([
      supabase.from('public_spaces').select('*').eq('id', id).maybeSingle(),
      supabase.from('parking_spaces').select('id, status').eq('id', id).maybeSingle(),
    ]);

    if (viewResult.error) throw new Error(viewResult.error.message);

    const row = viewResult.data as SpaceRow | null;
    if (row && row.host_id === user.id) {
      space = row;
      status = (statusResult.data as { status: string } | null)?.status ?? 'draft';
    } else if (row) {
      // RLS let the row through because it is a live listing, but it is not
      // this user's. Editing is not theirs to do.
      notFound();
    }
  } catch {
    loadError =
      'We could not load that listing. The database may be unreachable, or the migrations may not have been applied yet.';
  }

  if (!loadError && !space) notFound();

  if (loadError || !space) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Edit listing</h1>
        <Alert tone="warning" title="Nothing to show">
          <p className="mt-1">{loadError}</p>
        </Alert>
      </div>
    );
  }

  const initial: EditableSpace = {
    id: space.id,
    status,
    title: space.title,
    description: space.description ?? '',
    address_line: space.address_line ?? '',
    landmark: space.landmark ?? '',
    locality: space.locality,
    city: space.city,
    state: space.state,
    postal_code: space.postal_code ?? '',
    lat: String(space.exact_lat ?? space.approx_lat ?? ''),
    lng: String(space.exact_lng ?? space.approx_lng ?? ''),
    space_type: space.space_type,
    vehicle_types: space.vehicle_types ?? [],
    capacity: String(space.capacity),
    max_length_m: mmToMetres(space.max_length_mm),
    max_width_m: mmToMetres(space.max_width_mm),
    max_height_m: mmToMetres(space.max_height_mm),
    amenities: space.amenities ?? [],
    rules: space.rules ?? [],
    price_hourly: rupeesOrBlank(space.price_hourly_paise),
    price_daily: rupeesOrBlank(space.price_daily_paise),
    price_monthly: rupeesOrBlank(space.price_monthly_paise),
    min_booking_minutes: String(space.min_booking_minutes),
    max_booking_minutes: space.max_booking_minutes != null ? String(space.max_booking_minutes) : '',
    min_notice_minutes: String(space.min_notice_minutes),
    instant_book: space.instant_book,
    cancellation_policy: space.cancellation_policy,
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm">
          <Link href="/host/spaces" className="text-[var(--text-muted)] hover:underline">
            Your spaces
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{space.title}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Changes to a live listing take effect immediately. Changes that affect price apply to new
          bookings only, never to bookings already made.
        </p>
      </header>

      <EditListingForm initial={initial} />
    </div>
  );
}
