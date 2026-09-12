import Link from 'next/link';
import { Alert, Badge, Card, EmptyState } from '@/components/ui';
import { formatPaise } from '@/lib/money';
import { adminServiceClient } from '@/lib/admin';
import {
  formatDateTime,
  formatMm,
  labelFor,
  toneFor,
  VERIFICATION_STATUS_LABELS,
  VERIFICATION_STATUS_TONES,
} from '@/lib/dashboard';
import {
  AMENITY_LABELS,
  CANCELLATION_POLICY_LABELS,
  SPACE_TYPE_LABELS,
  VEHICLE_TYPE_LABELS,
} from '@/lib/types';
import { ModerationActions } from './moderation-actions';

export const dynamic = 'force-dynamic';

interface PendingSpace {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  address_line: string;
  landmark: string | null;
  locality: string;
  city: string;
  state: string;
  postal_code: string | null;
  lat: number;
  lng: number;
  space_type: string;
  vehicle_types: string[];
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
  cancellation_policy: string;
  access_method: string;
  access_instructions: string | null;
  has_ev_charging: boolean;
  ev_connector_type: string | null;
  created_at: string;
}

interface HostSummary {
  userId: string;
  displayName: string;
  fullName: string | null;
  kycStatus: string;
  isBusiness: boolean;
  businessName: string | null;
  listingCount: number;
}

/**
 * The moderation queue.
 *
 * Admins see the exact address, which is the one place in this product where
 * the location privacy rule yields: a listing cannot be verified against the
 * real world without it. Everything shown here is recorded in the audit log the
 * moment a decision is taken.
 */
export default async function AdminModerationPage() {
  let spaces: PendingSpace[] = [];
  let hosts = new Map<string, HostSummary>();
  let photoCounts = new Map<string, number>();
  let loadError: string | null = null;

  try {
    const service = await adminServiceClient();
    if (!service) throw new Error('Not authorised');

    const { data, error } = await service
      .from('parking_spaces')
      .select('*')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) throw new Error(error.message);
    spaces = (data as PendingSpace[] | null) ?? [];

    const hostIds = Array.from(new Set(spaces.map((space) => space.host_id)));
    const spaceIds = spaces.map((space) => space.id);

    if (hostIds.length > 0) {
      const [hostProfiles, profiles, hostListings] = await Promise.all([
        service
          .from('host_profiles')
          .select('user_id, display_name, kyc_status, is_business, business_name')
          .in('user_id', hostIds),
        service.from('profiles').select('id, full_name').in('id', hostIds),
        service.from('parking_spaces').select('host_id').in('host_id', hostIds).limit(2000),
      ]);

      const nameById = new Map<string, string | null>();
      for (const row of (profiles.data as Array<{ id: string; full_name: string | null }> | null) ??
        []) {
        nameById.set(row.id, row.full_name);
      }

      const listingCounts = new Map<string, number>();
      for (const row of (hostListings.data as Array<{ host_id: string }> | null) ?? []) {
        listingCounts.set(row.host_id, (listingCounts.get(row.host_id) ?? 0) + 1);
      }

      for (const row of (hostProfiles.data as Array<{
        user_id: string;
        display_name: string;
        kyc_status: string;
        is_business: boolean;
        business_name: string | null;
      }> | null) ?? []) {
        hosts.set(row.user_id, {
          userId: row.user_id,
          displayName: row.display_name,
          fullName: nameById.get(row.user_id) ?? null,
          kycStatus: row.kyc_status,
          isBusiness: row.is_business,
          businessName: row.business_name,
          listingCount: listingCounts.get(row.user_id) ?? 0,
        });
      }

      // A host who submitted a listing without ever saving a host profile still
      // needs a row here, otherwise the card renders blank where the reviewer
      // most needs context.
      for (const hostId of hostIds) {
        if (hosts.has(hostId)) continue;
        hosts.set(hostId, {
          userId: hostId,
          displayName: nameById.get(hostId) ?? 'Unnamed host',
          fullName: nameById.get(hostId) ?? null,
          kycStatus: 'unverified',
          isBusiness: false,
          businessName: null,
          listingCount: listingCounts.get(hostId) ?? 0,
        });
      }
    }

    if (spaceIds.length > 0) {
      const { data: photos } = await service
        .from('space_photos')
        .select('space_id')
        .in('space_id', spaceIds)
        .limit(2000);
      for (const row of (photos as Array<{ space_id: string }> | null) ?? []) {
        photoCounts.set(row.space_id, (photoCounts.get(row.space_id) ?? 0) + 1);
      }
    }
  } catch {
    loadError =
      'We could not load the moderation queue. Check that SUPABASE_SERVICE_ROLE_KEY is set and that the migrations have been applied.';
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Moderation</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {spaces.length === 0
            ? 'Nothing waiting.'
            : `${spaces.length} ${spaces.length === 1 ? 'listing' : 'listings'} waiting, oldest first.`}
        </p>
      </header>

      {loadError && (
        <Alert tone="warning" title="Queue unavailable">
          <p className="mt-1">{loadError}</p>
        </Alert>
      )}

      {!loadError && spaces.length === 0 && (
        <EmptyState
          title="The queue is empty"
          description="Every submitted listing has been decided. New submissions appear here immediately."
        />
      )}

      <Alert tone="info" title="What to check">
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Does the address exist, and does the pin land on it rather than on the street name.</li>
          <li>
            Is a height limit stated for anything covered. An unstated limit is the most common
            cause of a driver arriving and being unable to park.
          </li>
          <li>Is the price plausible for the area, and does the description match the type.</li>
          <li>Does the host look like they are entitled to let this space.</li>
        </ul>
      </Alert>

      <ul className="space-y-5">
        {spaces.map((space) => {
          const host = hosts.get(space.host_id);
          const photos = photoCounts.get(space.id) ?? 0;
          const prices = [
            space.price_hourly_paise != null
              ? `${formatPaise(Math.round(Number(space.price_hourly_paise)))} / hour`
              : null,
            space.price_daily_paise != null
              ? `${formatPaise(Math.round(Number(space.price_daily_paise)))} / day`
              : null,
            space.price_monthly_paise != null
              ? `${formatPaise(Math.round(Number(space.price_monthly_paise)))} / month`
              : null,
          ].filter(Boolean) as string[];

          return (
            <Card key={space.id} as="li" className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{space.title}</h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {labelFor(SPACE_TYPE_LABELS, space.space_type)} · submitted{' '}
                    {formatDateTime(space.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={photos === 0 ? 'danger' : 'neutral'}>
                    {photos} {photos === 1 ? 'photo' : 'photos'}
                  </Badge>
                  {space.instant_book && <Badge tone="accent">Instant book</Badge>}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    Exact location
                  </h3>
                  <dl className="mt-2 space-y-1.5 text-sm">
                    <Row label="Address">{space.address_line}</Row>
                    {space.landmark && <Row label="Landmark">{space.landmark}</Row>}
                    <Row label="Area">
                      {[space.locality, space.city, space.state, space.postal_code]
                        .filter(Boolean)
                        .join(', ')}
                    </Row>
                    <Row label="Coordinates">
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${space.lat}&mlon=${space.lng}#map=18/${space.lat}/${space.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-[var(--accent-text)] hover:underline"
                      >
                        {space.lat.toFixed(6)}, {space.lng.toFixed(6)}
                      </a>
                    </Row>
                    <Row label="Access">
                      {space.access_method.replace(/_/g, ' ')}
                      {space.access_instructions && (
                        <span className="block whitespace-pre-line text-[var(--text-muted)]">
                          {space.access_instructions}
                        </span>
                      )}
                    </Row>
                  </dl>
                </section>

                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    Host
                  </h3>
                  <dl className="mt-2 space-y-1.5 text-sm">
                    <Row label="Name">
                      {host?.displayName ?? 'Unknown'}
                      {host?.fullName && host.fullName !== host.displayName && (
                        <span className="block text-[var(--text-muted)]">
                          Account name: {host.fullName}
                        </span>
                      )}
                    </Row>
                    <Row label="Verification">
                      <Badge tone={toneFor(VERIFICATION_STATUS_TONES, host?.kycStatus)}>
                        {labelFor(VERIFICATION_STATUS_LABELS, host?.kycStatus)}
                      </Badge>
                    </Row>
                    {host?.isBusiness && <Row label="Business">{host.businessName ?? 'Yes'}</Row>}
                    <Row label="Listings">{host?.listingCount ?? 0} in total</Row>
                    <Row label="Host record">
                      <Link
                        href={`/admin/users?q=${encodeURIComponent(host?.fullName ?? '')}`}
                        className="font-semibold text-[var(--accent-text)] hover:underline"
                      >
                        Open in users
                      </Link>
                    </Row>
                  </dl>
                </section>

                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    The space
                  </h3>
                  <dl className="mt-2 space-y-1.5 text-sm">
                    <Row label="Bays">{space.capacity}</Row>
                    <Row label="Vehicles">
                      {space.vehicle_types
                        .map((type) => labelFor(VEHICLE_TYPE_LABELS, type))
                        .join(', ')}
                    </Row>
                    <Row label="Height limit">
                      <span
                        className={
                          space.max_height_mm == null &&
                          ['garage', 'basement', 'covered_lot', 'stack_parking'].includes(
                            space.space_type,
                          )
                            ? 'font-bold text-rose-600 dark:text-rose-400'
                            : ''
                        }
                      >
                        {formatMm(space.max_height_mm)}
                      </span>
                    </Row>
                    <Row label="Length and width">
                      {formatMm(space.max_length_mm)} by {formatMm(space.max_width_mm)}
                    </Row>
                    <Row label="Amenities">
                      {space.amenities.length > 0
                        ? space.amenities.map((key) => labelFor(AMENITY_LABELS, key)).join(', ')
                        : 'None listed'}
                    </Row>
                    {space.has_ev_charging && (
                      <Row label="EV">{space.ev_connector_type ?? 'Connector not stated'}</Row>
                    )}
                  </dl>
                </section>

                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    Commercial terms
                  </h3>
                  <dl className="mt-2 space-y-1.5 text-sm">
                    <Row label="Price">
                      {prices.length > 0 ? prices.join(' · ') : 'No price set'}
                    </Row>
                    <Row label="Stay length">
                      {space.min_booking_minutes} minutes minimum
                      {space.max_booking_minutes
                        ? `, ${space.max_booking_minutes} minutes maximum`
                        : ''}
                    </Row>
                    <Row label="Notice">{space.min_notice_minutes} minutes</Row>
                    <Row label="Cancellation">
                      {labelFor(CANCELLATION_POLICY_LABELS, space.cancellation_policy)}
                    </Row>
                  </dl>
                </section>
              </div>

              {space.description && (
                <div className="mt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    Description
                  </h3>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">
                    {space.description}
                  </p>
                </div>
              )}

              {space.rules.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    House rules
                  </h3>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                    {space.rules.map((rule, index) => (
                      <li key={`${index}-${rule}`}>{rule}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-5 border-t pt-4">
                <ModerationActions spaceId={space.id} title={space.title} />
              </div>
            </Card>
          );
        })}
      </ul>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[8rem_1fr] sm:gap-3">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  );
}
