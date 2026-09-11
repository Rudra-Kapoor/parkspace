import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@/lib/env';
import type { GeocodeResult } from '@/lib/geo';
import { callerKey, LIMITS, rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';

/**
 * Geocoding proxy for Nominatim.
 *
 * This route exists rather than calling Nominatim from the browser for three
 * reasons, and all three are obligations rather than conveniences:
 *
 * 1. The Nominatim usage policy requires an identifying User-Agent. A browser
 *    cannot set one. Calling it directly from client JavaScript would breach
 *    the policy of a service run on donated infrastructure.
 *
 * 2. The policy asks for at most one request per second from an application.
 *    That can only be enforced centrally, which is what the queue below does.
 *
 * 3. A shared cache means a hundred people searching "Park Street" cost the
 *    upstream one request rather than a hundred.
 *
 * If this product ever reaches real traffic, the correct next step is a
 * self-hosted Nominatim or a commercial geocoder, not a higher rate here.
 */

interface CacheEntry {
  results: GeocodeResult[];
  expiresAt: number;
}

const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

// Serialises upstream calls to at most one per second, process-wide.
let lastCallAt = 0;
let queue: Promise<unknown> = Promise.resolve();

function scheduleUpstream<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const since = Date.now() - lastCallAt;
    if (since < 1100) {
      await new Promise((resolve) => setTimeout(resolve, 1100 - since));
    }
    lastCallAt = Date.now();
    return task();
  });
  // Keep the chain alive even if one task rejects.
  queue = run.catch(() => undefined);
  return run;
}

function cacheKey(query: string, viewbox: string | null): string {
  return `${query.trim().toLowerCase()}|${viewbox ?? ''}`;
}

function readCache(key: string): GeocodeResult[] | null {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    CACHE.delete(key);
    return null;
  }
  return entry.results;
}

function writeCache(key: string, results: GeocodeResult[]): void {
  if (CACHE.size >= CACHE_MAX_ENTRIES) {
    // Cheap eviction: drop the oldest inserted key. Map preserves insertion order.
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  CACHE.set(key, { results, expiresAt: Date.now() + CACHE_TTL_MS });
}

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  address?: Record<string, string>;
}

export async function GET(request: NextRequest) {
  // This route spends someone else's donated capacity, so it is the one that
  // most deserves a limit.
  const limit = rateLimit(callerKey(request), LIMITS.geocode.limit, LIMITS.geocode.windowMs);
  if (!limit.ok) {
    return NextResponse.json(new AppError('RATE_LIMITED').toResponseBody(), {
      status: 429,
      headers: rateLimitHeaders(limit),
    });
  }

  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (query.length < 3) {
    return NextResponse.json({ results: [] });
  }
  if (query.length > 200) {
    return NextResponse.json(
      { ...new AppError('VALIDATION_FAILED').toResponseBody(), results: [] },
      { status: 400 },
    );
  }

  // Bias results towards the operating region. Without this, "Park Street"
  // returns a road in Bristol before the one in Kolkata.
  const viewbox = request.nextUrl.searchParams.get('viewbox');
  const key = cacheKey(query, viewbox);

  const cached = readCache(key);
  if (cached) {
    return NextResponse.json(
      { results: cached, cached: true },
      { headers: { 'Cache-Control': 'public, max-age=3600' } },
    );
  }

  let userAgent = 'ParkSpace/0.1 (+https://github.com/kapoorrudraa)';
  try {
    userAgent = serverEnv().NOMINATIM_USER_AGENT;
  } catch {
    // Server env incomplete. The default above is still policy-compliant enough
    // to identify the application, so geocoding keeps working during setup.
  }

  const upstream = new URL('https://nominatim.openstreetmap.org/search');
  upstream.searchParams.set('q', query);
  upstream.searchParams.set('format', 'jsonv2');
  upstream.searchParams.set('addressdetails', '1');
  upstream.searchParams.set('limit', '6');
  upstream.searchParams.set('countrycodes', 'in');
  if (viewbox) {
    upstream.searchParams.set('viewbox', viewbox);
    upstream.searchParams.set('bounded', '0');
  }

  try {
    const response = await scheduleUpstream(() =>
      fetch(upstream, {
        headers: {
          'User-Agent': userAgent,
          'Accept-Language': 'en',
        },
        signal: AbortSignal.timeout(8000),
      }),
    );

    if (!response.ok) {
      return NextResponse.json(
        { ...new AppError('UPSTREAM_UNAVAILABLE').toResponseBody(), results: [] },
        { status: 503, headers: rateLimitHeaders(limit) },
      );
    }

    const items = (await response.json()) as NominatimItem[];

    const results: GeocodeResult[] = items.map((item) => ({
      displayName: item.display_name,
      lat: Number.parseFloat(item.lat),
      lng: Number.parseFloat(item.lon),
      type: item.type ?? 'place',
      locality:
        item.address?.suburb ??
        item.address?.neighbourhood ??
        item.address?.city_district ??
        undefined,
      city: item.address?.city ?? item.address?.town ?? item.address?.village ?? undefined,
      state: item.address?.state ?? undefined,
      postcode: item.address?.postcode ?? undefined,
    }));

    writeCache(key, results);

    return NextResponse.json(
      { results },
      { headers: { 'Cache-Control': 'public, max-age=3600' } },
    );
  } catch {
    return NextResponse.json(
      { ...new AppError('UPSTREAM_UNAVAILABLE').toResponseBody(), results: [] },
      { status: 503, headers: rateLimitHeaders(limit) },
    );
  }
}
