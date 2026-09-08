import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchParamsSchema } from '@/lib/validation';
import { fieldErrors } from '@/lib/validation';
import type { SearchResult } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Search.
 *
 * Thin by design. All the work happens in the search_spaces() database function,
 * which is also what the server-rendered search page calls. One implementation,
 * one set of ranking rules, no chance of the map and the list disagreeing about
 * what is available.
 *
 * The function returns only the jittered coordinate, so this endpoint cannot
 * leak an exact address even if someone later adds a careless field to the
 * response.
 */
export async function GET(request: NextRequest) {
  const raw = Object.fromEntries(request.nextUrl.searchParams);

  const parsed = searchParamsSchema.safeParse({
    ...raw,
    space_types: request.nextUrl.searchParams.getAll('space_types').filter(Boolean),
    amenities: request.nextUrl.searchParams.getAll('amenities').filter(Boolean),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'VALIDATION_FAILED', fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const params = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('search_spaces', {
    p_lat: params.lat,
    p_lng: params.lng,
    p_radius_m: params.radius_m,
    p_starts_at: params.starts_at ?? null,
    p_ends_at: params.ends_at ?? null,
    p_vehicle_type: params.vehicle_type ?? null,
    p_max_price_paise: params.max_price_paise ?? null,
    p_space_types: params.space_types?.length ? params.space_types : null,
    p_amenities: params.amenities?.length ? params.amenities : null,
    p_min_rating: params.min_rating ?? null,
    p_instant_only: params.instant_only,
    p_ev_only: params.ev_only,
    p_sort: params.sort,
    p_limit: params.limit,
    p_offset: params.offset,
  });

  if (error) {
    console.error('[search] rpc failed', error.message);
    return NextResponse.json({ ok: false, error: 'UNKNOWN' }, { status: 500 });
  }

  const results = (data ?? []) as SearchResult[];
  const total = results[0]?.total_count ?? 0;

  // Record the search. A zero-result search in a locality is the single most
  // valuable analytics row this product produces: it names a street where the
  // field team should go and recruit a host.
  void supabase
    .from('search_events')
    .insert({
      query_text: params.q ?? null,
      lat: params.lat,
      lng: params.lng,
      radius_m: params.radius_m,
      starts_at: params.starts_at ?? null,
      ends_at: params.ends_at ?? null,
      filters: {
        vehicle_type: params.vehicle_type ?? null,
        instant_only: params.instant_only,
        ev_only: params.ev_only,
        sort: params.sort,
      },
      result_count: results.length,
    })
    .then(
      () => undefined,
      () => undefined, // analytics must never break a search
    );

  return NextResponse.json({
    ok: true,
    results,
    total: Number(total),
    centre: { lat: params.lat, lng: params.lng },
    radius_m: params.radius_m,
  });
}
