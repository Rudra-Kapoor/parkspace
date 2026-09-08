import Link from 'next/link';
import { Alert, Badge, Card, EmptyState, Rating } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { formatPaise } from '@/lib/money';
import {
  formatDate,
  formatMm,
  labelFor,
  LISTING_STATUS_LABELS,
  LISTING_STATUS_TONES,
  toneFor,
} from '@/lib/dashboard';
import { SPACE_TYPE_LABELS, VEHICLE_TYPE_LABELS } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface SpaceRow {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  locality: string;
  city: string;
  space_type: string;
  vehicle_types: string[];
  capacity: number;
  max_height_mm: number | null;
  price_hourly_paise: number | null;
  price_daily_paise: number | null;
  price_monthly_paise: number | null;
  avg_rating: number | null;
  review_count: number;
  booking_count: number;
  instant_book: boolean;
  created_at: string;
  published_at: string | null;
}

/**
 * The host's listings.
 *
 * Ordered with the ones that need attention first: a rejected listing and a
 * draft are both stalled, and burying them under live listings is how a host
 * ends up wondering why nothing is earning.
 */
const STATUS_ORDER: Record<string, number> = {
  rejected: 0,
  draft: 1,
  pending_review: 2,
  paused: 3,
  active: 4,
  delisted: 5,
};

export default async function HostSpacesPage() {
  let spaces: SpaceRow[] = [];
  let rejectionReasons: Record<string, string | null> = {};
  let loadError: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('No session');

    const { data, error } = await supabase
      .from('parking_spaces')
      .select(
        'id, title, slug, status, locality, city, space_type, vehicle_types, capacity, max_height_mm, price_hourly_paise, price_daily_paise, price_monthly_paise, avg_rating, review_count, booking_count, instant_book, created_at, published_at',
      )
      .eq('host_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    spaces = (data as SpaceRow[] | null) ?? [];

    // rejection_reason is written by moderation and is not part of the column
    // grant the browser role holds, so it is fetched separately and the page
    // degrades to a generic explanation if that read is not permitted.
    const rejectedIds = spaces.filter((space) => space.status === 'rejected').map((s) => s.id);
    if (rejectedIds.length > 0) {
      const { data: reasons } = await supabase
        .from('parking_spaces')
        .select('id, rejection_reason')
        .in('id', rejectedIds);
      for (const row of (reasons as Array<{ id: string; rejection_reason: string | null }> | null) ??
        []) {
        rejectionReasons[row.id] = row.rejection_reason;
      }
    }
  } catch {
    loadError =
      'We could not load your listings. The database may be unreachable, or the migrations may not have been applied yet.';
  }

  const sorted = [...spaces].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your spaces</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {spaces.length === 0
              ? 'Nothing listed yet.'
              : `${spaces.length} ${spaces.length === 1 ? 'listing' : 'listings'}.`}
          </p>
        </div>
        <Link href="/host/spaces/new" className="ps-btn ps-btn-primary">
          New listing
        </Link>
      </header>

      {loadError && (
        <Alert tone="warning" title="Nothing to show">
          <p className="mt-1">{loadError}</p>
        </Alert>
      )}

      {!loadError && spaces.length === 0 && (
        <EmptyState
          title="No listings yet"
          description="A listing takes about ten minutes. You set the hours, the price and the rules, and you can pause it at any time."
          action={
            <Link href="/host/spaces/new" className="ps-btn ps-btn-primary">
              List your first space
            </Link>
          }
        />
      )}

      <ul className="space-y-4">
        {sorted.map((space) => {
          const prices: string[] = [];
          if (space.price_hourly_paise != null) {
            prices.push(`${formatPaise(Math.round(Number(space.price_hourly_paise)))} / hour`);
          }
          if (space.price_daily_paise != null) {
            prices.push(`${formatPaise(Math.round(Number(space.price_daily_paise)))} / day`);
          }
          if (space.price_monthly_paise != null) {
            prices.push(`${formatPaise(Math.round(Number(space.price_monthly_paise)))} / month`);
          }

          return (
            <Card key={space.id} as="li" className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{space.title}</h2>
                    <Badge tone={toneFor(LISTING_STATUS_TONES, space.status)}>
                      {labelFor(LISTING_STATUS_LABELS, space.status)}
                    </Badge>
                    {space.instant_book && <Badge tone="accent">Instant book</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {labelFor(SPACE_TYPE_LABELS, space.space_type)} in {space.locality}, {space.city}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link
                    href={`/host/spaces/${space.id}/edit`}
                    className="ps-btn ps-btn-secondary text-sm"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/host/calendar?space=${space.id}`}
                    className="ps-btn ps-btn-ghost text-sm"
                  >
                    Calendar
                  </Link>
                  {space.status === 'active' && (
                    <Link href={`/space/${space.id}`} className="ps-btn ps-btn-ghost text-sm">
                      View
                    </Link>
                  )}
                </div>
              </div>

              {space.status === 'rejected' && (
                <div className="mt-4">
                  <Alert tone="danger" title="This listing was not approved">
                    <p className="mt-1">
                      {rejectionReasons[space.id] ??
                        'Our moderation team asked for changes before this listing can go live. Open the listing to edit it and submit it again.'}
                    </p>
                    <p className="mt-2">
                      Edit the listing to address the note above, then submit it for review again.
                    </p>
                  </Alert>
                </div>
              )}

              {space.status === 'pending_review' && (
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  Submitted for review. We check every listing before it goes live, usually within a
                  working day.
                </p>
              )}

              <dl className="ps-scroll-x mt-4 flex gap-6 border-t pt-4 text-sm">
                <Fact label="Price">
                  {prices.length > 0 ? prices.join(' · ') : 'No price set'}
                </Fact>
                <Fact label="Bays">{space.capacity}</Fact>
                <Fact label="Height limit">{formatMm(space.max_height_mm)}</Fact>
                <Fact label="Bookings">{space.booking_count}</Fact>
                <Fact label="Rating">
                  <Rating value={space.avg_rating} count={space.review_count} />
                </Fact>
                <Fact label={space.published_at ? 'Live since' : 'Created'}>
                  {formatDate(space.published_at ?? space.created_at)}
                </Fact>
              </dl>

              {space.vehicle_types.length > 0 && (
                <p className="mt-3 flex flex-wrap gap-1.5">
                  {space.vehicle_types.map((type) => (
                    <Badge key={type}>{labelFor(VEHICLE_TYPE_LABELS, type)}</Badge>
                  ))}
                </p>
              )}
            </Card>
          );
        })}
      </ul>
    </div>
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
