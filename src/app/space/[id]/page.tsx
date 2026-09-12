import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Alert, AmenityIcon, Badge, Card, Rating } from '@/components/ui';
import { BookingPanel } from '@/components/booking-panel';
import { StaticMap } from '@/components/static-map';
import { createClient } from '@/lib/supabase/server';
import { formatPaise } from '@/lib/money';
import { photoUrl } from '@/lib/storage';
import {
  AMENITY_LABELS,
  CANCELLATION_POLICY_COPY,
  CANCELLATION_POLICY_LABELS,
  SPACE_TYPE_LABELS,
  VEHICLE_TYPE_LABELS,
  type PublicSpace,
  type Review,
  type Vehicle,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('public_spaces')
      .select('title, locality, city, description, price_hourly_paise')
      .eq('id', id)
      .maybeSingle();

    if (!data) return { title: 'Parking space' };

    return {
      title: `${data.title}, ${data.locality}`,
      description:
        data.description?.slice(0, 155) ??
        `Book parking in ${data.locality}, ${data.city}. Reserve before you arrive.`,
      // The listing page is indexable, but only the approximate location is on
      // it, so indexing cannot expose a home address.
      robots: { index: true, follow: true },
    };
  } catch {
    return { title: 'Parking space' };
  }
}

export default async function SpacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const first = (key: string): string | undefined => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const supabase = await createClient();

  const { data: space } = await supabase
    .from('public_spaces')
    .select('*')
    .eq('id', id)
    .maybeSingle<PublicSpace>();

  if (!space) notFound();

  const [{ data: photos }, { data: reviews }, { data: host }, { data: user }] = await Promise.all([
    supabase.from('space_photos').select('*').eq('space_id', id).order('sort_order'),
    supabase
      .from('reviews')
      .select('*')
      .eq('space_id', id)
      .eq('direction', 'driver_to_host')
      .eq('is_published', true)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('public_profiles').select('*').eq('id', space.host_id).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  let vehicles: Vehicle[] = [];
  if (user?.user) {
    const { data } = await supabase
      .from('vehicles')
      .select('*')
      .eq('owner_id', user.user.id)
      .order('is_default', { ascending: false });
    vehicles = data ?? [];
  }

  const startsAt = first('starts_at');
  const endsAt = first('ends_at');

  // The exact coordinate is present only when this viewer is entitled to it.
  // The page adapts rather than the API trimming: what the viewer sees is
  // decided in the database.
  const hasExact = space.exact_lat != null && space.exact_lng != null;
  const mapLat = space.exact_lat ?? space.approx_lat;
  const mapLng = space.exact_lng ?? space.approx_lng;

  const reviewList = (reviews ?? []) as Review[];

  return (
    <>
      <SiteHeader />

      <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-[var(--text-muted)]">
          <Link href="/search" className="hover:text-[var(--text)] hover:underline">
            Search
          </Link>
          <span className="mx-1.5">/</span>
          <span>{space.locality}</span>
        </nav>

        {/* ------------------------------------------------------------- */}
        {/* Photos                                                         */}
        {/* ------------------------------------------------------------- */}
        <PhotoGallery photos={photos ?? []} title={space.title} />

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
          {/* --------------------------------------------------------- */}
          {/* Details                                                    */}
          {/* --------------------------------------------------------- */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{space.title}</h1>
                <p className="mt-1.5 text-[var(--text-muted)]">
                  {SPACE_TYPE_LABELS[space.space_type]} in {space.locality}, {space.city}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Rating value={space.avg_rating} count={space.review_count} size="md" />
              {host?.is_superhost && <Badge tone="accent">Superhost</Badge>}
              {space.instant_book && <Badge tone="success">Instant book</Badge>}
              {space.has_ev_charging && <Badge tone="neutral">EV charging</Badge>}
            </div>

            {space.description && (
              <section className="mt-7 border-t pt-7">
                <h2 className="text-lg font-semibold">About this space</h2>
                <p className="mt-2.5 whitespace-pre-line leading-relaxed text-[var(--text-muted)]">
                  {space.description}
                </p>
              </section>
            )}

            {/* Fit. The single most useful block on the page, because the
                commonest failure in parking is arriving and not fitting. */}
            <section className="mt-7 border-t pt-7">
              <h2 className="text-lg font-semibold">Will your vehicle fit</h2>
              <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <FitItem
                  label="Height limit"
                  value={space.max_height_mm ? `${(space.max_height_mm / 1000).toFixed(2)} m` : 'Not stated'}
                  emphasise={space.max_height_mm != null}
                />
                <FitItem
                  label="Length"
                  value={space.max_length_mm ? `${(space.max_length_mm / 1000).toFixed(2)} m` : 'Not stated'}
                />
                <FitItem
                  label="Width"
                  value={space.max_width_mm ? `${(space.max_width_mm / 1000).toFixed(2)} m` : 'Not stated'}
                />
                <FitItem label="Bays" value={String(space.capacity)} />
              </dl>

              <p className="mt-4 text-sm text-[var(--text-muted)]">
                Accepts:{' '}
                {space.vehicle_types.map((type) => VEHICLE_TYPE_LABELS[type]).join(', ')}
              </p>
            </section>

            {space.amenities.length > 0 && (
              <section className="mt-7 border-t pt-7">
                <h2 className="text-lg font-semibold">What this space offers</h2>
                <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {space.amenities.map((amenity) => (
                    <li key={amenity} className="flex items-center gap-2.5 text-sm">
                      <AmenityIcon name={amenity} className="h-4 w-4 text-[var(--accent-text)]" />
                      {AMENITY_LABELS[amenity] ?? amenity}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {space.rules.length > 0 && (
              <section className="mt-7 border-t pt-7">
                <h2 className="text-lg font-semibold">House rules</h2>
                <ul className="mt-3 space-y-2">
                  {space.rules.map((rule, index) => (
                    <li key={index} className="flex gap-2.5 text-sm text-[var(--text-muted)]">
                      <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--text-muted)]" />
                      {rule}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ------------------------------------------------------- */}
            {/* Location                                                 */}
            {/* ------------------------------------------------------- */}
            <section className="mt-7 border-t pt-7">
              <h2 className="text-lg font-semibold">Where it is</h2>

              {hasExact ? (
                <Alert tone="success" className="mt-3">
                  <p className="font-medium text-[var(--text)]">{space.address_line}</p>
                  {space.landmark && <p className="mt-0.5">Near {space.landmark}</p>}
                </Alert>
              ) : (
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  The map shows the approximate area. The exact address, and any gate or
                  access instructions, are sent to you once your booking is confirmed and
                  become visible here 24 hours before you arrive.
                </p>
              )}

              <div className="mt-4 h-72 overflow-hidden rounded-xl border">
                <StaticMap
                  lat={mapLat}
                  lng={mapLng}
                  exact={hasExact}
                  label={space.title}
                />
              </div>
            </section>

            {/* ------------------------------------------------------- */}
            {/* Cancellation                                             */}
            {/* ------------------------------------------------------- */}
            <section className="mt-7 border-t pt-7">
              <h2 className="text-lg font-semibold">
                Cancellation: {CANCELLATION_POLICY_LABELS[space.cancellation_policy]}
              </h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {CANCELLATION_POLICY_COPY[space.cancellation_policy]}
              </p>
              <Link
                href="/legal/refunds"
                className="mt-2 inline-block text-sm font-medium text-[var(--accent-text)] hover:underline"
              >
                Read the full policy
              </Link>
            </section>

            {/* ------------------------------------------------------- */}
            {/* Host                                                     */}
            {/* ------------------------------------------------------- */}
            {host && (
              <section className="mt-7 border-t pt-7">
                <h2 className="text-lg font-semibold">Your host</h2>
                <Card className="mt-3 flex items-center gap-4 p-5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-base font-bold text-white">
                    {(host.host_display_name ?? host.full_name ?? 'H').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {host.host_display_name ?? host.full_name ?? 'Host'}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {host.is_verified ? 'Identity verified' : 'Not yet verified'}
                      {host.avg_response_minutes != null && (
                        <> · Usually replies within {host.avg_response_minutes} min</>
                      )}
                    </p>
                  </div>
                </Card>
              </section>
            )}

            {/* ------------------------------------------------------- */}
            {/* Reviews                                                  */}
            {/* ------------------------------------------------------- */}
            <section className="mt-7 border-t pt-7">
              <h2 className="text-lg font-semibold">
                Reviews {space.review_count > 0 && <>({space.review_count})</>}
              </h2>

              {reviewList.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  No reviews yet. Reviews appear only after a completed stay, and both sides
                  stay hidden until each has written one.
                </p>
              ) : (
                <ul className="mt-4 space-y-5">
                  {reviewList.map((review) => (
                    <li key={review.id} className="border-b pb-5 last:border-0">
                      <Rating value={review.rating} />
                      {review.comment && (
                        <p className="mt-2 text-sm leading-relaxed">{review.comment}</p>
                      )}
                      <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                        {new Date(review.created_at).toLocaleDateString('en-IN', {
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                      {review.host_response && (
                        <div className="mt-3 rounded-lg border-l-2 border-[var(--accent)] bg-[var(--surface-sunken)] px-3.5 py-2.5">
                          <p className="text-xs font-semibold">Response from the host</p>
                          <p className="mt-1 text-sm text-[var(--text-muted)]">
                            {review.host_response}
                          </p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* --------------------------------------------------------- */}
          {/* Booking panel                                              */}
          {/* --------------------------------------------------------- */}
          <div className="lg:relative">
            <div className="lg:sticky lg:top-20">
              <BookingPanel
                space={space}
                vehicles={vehicles}
                isSignedIn={Boolean(user?.user)}
                isOwnSpace={user?.user?.id === space.host_id}
                initialStartsAt={startsAt}
                initialEndsAt={endsAt}
              />
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function FitItem({
  label,
  value,
  emphasise,
}: {
  label: string;
  value: string;
  emphasise?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-[var(--surface-sunken)] p-3">
      <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
      <dd className={`mt-0.5 font-semibold ${emphasise ? 'text-[var(--accent-text)]' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function PhotoGallery({
  photos,
  title,
}: {
  photos: Array<{ id: string; storage_path: string; caption: string | null }>;
  title: string;
}) {
  if (photos.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed bg-[var(--surface-sunken)] text-sm text-[var(--text-muted)] sm:h-72">
        No photos yet for this space
      </div>
    );
  }

  const usable = photos
    .map((photo) => ({ ...photo, url: photoUrl(photo.storage_path) }))
    .filter((photo): photo is typeof photo & { url: string } => photo.url !== null);

  if (usable.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed bg-[var(--surface-sunken)] text-sm text-[var(--text-muted)] sm:h-72">
        No photos yet for this space
      </div>
    );
  }

  const [lead, ...rest] = usable;

  return (
    <div className="grid gap-2 overflow-hidden rounded-xl sm:h-80 sm:grid-cols-4 sm:grid-rows-2">
      {lead && (
        <figure className="relative sm:col-span-2 sm:row-span-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lead.url}
            alt={lead.caption ?? `${title}, main photo`}
            className="h-56 w-full object-cover sm:h-full"
          />
        </figure>
      )}
      {rest.slice(0, 4).map((photo) => (
        <figure key={photo.id} className="relative hidden sm:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={photo.caption ?? ''}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </figure>
      ))}
    </div>
  );
}
