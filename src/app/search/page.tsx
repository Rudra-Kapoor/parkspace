import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import { createClient } from '@/lib/supabase/server';
import { isConfigured, publicEnv } from '@/lib/env';
import { DEFAULT_CENTRE } from '@/lib/geo';
import type { SearchResult } from '@/lib/types';
import { SearchClient } from './search-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Find parking',
  description: 'Search available parking spaces near your destination and reserve one before you arrive.',
  robots: { index: false, follow: true },
};

/**
 * Search page.
 *
 * The first page of results is rendered on the server. Two reasons: the driver
 * sees spaces rather than a spinner, and the page is useful before the map
 * bundle finishes downloading, which on a phone on mobile data is not instant.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const first = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  let defaultCentre = DEFAULT_CENTRE;
  try {
    const env = publicEnv();
    defaultCentre = { lat: env.NEXT_PUBLIC_DEFAULT_LAT, lng: env.NEXT_PUBLIC_DEFAULT_LNG };
  } catch {
    // Not configured. The default Kolkata centre is still a sensible map origin.
  }

  const rawLat = Number.parseFloat(first('lat') ?? '');
  const rawLng = Number.parseFloat(first('lng') ?? '');
  const lat = Number.isFinite(rawLat) && rawLat >= -90 && rawLat <= 90 ? rawLat : defaultCentre.lat;
  const lng = Number.isFinite(rawLng) && rawLng >= -180 && rawLng <= 180 ? rawLng : defaultCentre.lng;
  // Clamped, not trusted. The API route parses through searchParamsSchema, but
  // this page reads the query string directly, so without a bound here an
  // unauthenticated GET could ask the database for a continent-wide sweep.
  const rawRadius = Number.parseInt(first('radius_m') ?? '', 10);
  const radius = Number.isFinite(rawRadius)
    ? Math.min(Math.max(rawRadius, 100), 10_000)
    : 1500;
  const startsAt = first('starts_at');
  const endsAt = first('ends_at');
  const query = first('q') ?? '';

  let results: SearchResult[] = [];
  let total = 0;

  if (isConfigured()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.rpc('search_spaces', {
        p_lat: lat,
        p_lng: lng,
        p_radius_m: radius,
        p_starts_at: startsAt ?? null,
        p_ends_at: endsAt ?? null,
        p_vehicle_type: first('vehicle_type') ?? null,
        p_max_price_paise: null,
        p_space_types: null,
        p_amenities: null,
        p_min_rating: null,
        p_instant_only: first('instant_only') === 'true',
        p_ev_only: first('ev_only') === 'true',
        p_sort: first('sort') ?? 'relevance',
        p_limit: 60,
        p_offset: 0,
      });

      results = (data ?? []) as SearchResult[];
      total = Number(results[0]?.total_count ?? 0);
    } catch {
      // Fall through with an empty list; the client will retry on interaction.
    }
  }

  return (
    <>
      <SiteHeader variant="compact" />
      <main id="main">
        <h1 className="sr-only">
          {query ? `Parking near ${query}` : 'Search for parking'}
        </h1>
        <SearchClient
          initialResults={results}
          initialTotal={total}
          initialCentre={{ lat, lng }}
          initialRadius={radius}
          initialQuery={query}
        />
      </main>
    </>
  );
}
