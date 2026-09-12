import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { SpaceCard } from '@/components/space-card';
import { SearchHero } from '@/components/search-hero';
import { Card, EmptyState } from '@/components/ui';
import { createPublicClient } from '@/lib/supabase/server';
import { formatPaise } from '@/lib/money';
import type { SearchResult, SeoLocality } from '@/lib/types';

/**
 * Neighbourhood landing pages.
 *
 * These are the organic acquisition channel described in the go-to-market plan.
 * Somebody searching for parking near Park Street should find a page about
 * parking near Park Street, not a generic homepage.
 *
 * They are real pages with real inventory, not doorway pages: each one shows the
 * spaces actually available there, and when there are none it says so and offers
 * to notify rather than padding with results from three kilometres away. A page
 * that promises parking and delivers a list of spaces nowhere near the place is
 * the kind of thing that earns a manual action, and deserves to.
 */

export const revalidate = 1800;

export async function generateStaticParams() {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from('seo_localities')
      .select('city_slug, slug')
      .eq('is_published', true);

    return (data ?? []).map((row: { city_slug: string; slug: string }) => ({
      city: row.city_slug,
      area: row.slug,
    }));
  } catch {
    return [];
  }
}

async function loadLocality(city: string, area: string): Promise<SeoLocality | null> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from('seo_localities')
      .select('*')
      .eq('city_slug', city)
      .eq('slug', area)
      .eq('is_published', true)
      .maybeSingle();
    return (data as SeoLocality | null) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; area: string }>;
}): Promise<Metadata> {
  const { city, area } = await params;
  const locality = await loadLocality(city, area);

  if (!locality) return { title: 'Parking' };

  const title = `Parking in ${locality.locality}, ${locality.city}`;

  return {
    title,
    description:
      `Find and book parking in ${locality.locality}. Reserve a guaranteed space by the ` +
      `hour, day or month before you arrive.`,
    alternates: { canonical: `/parking/${city}/${area}` },
    openGraph: { title, type: 'website' },
  };
}

export default async function LocalityPage({
  params,
}: {
  params: Promise<{ city: string; area: string }>;
}) {
  const { city, area } = await params;
  const locality = await loadLocality(city, area);

  if (!locality) notFound();

  let results: SearchResult[] = [];

  try {
    const supabase = createPublicClient();
    const { data } = await supabase.rpc('search_spaces', {
      p_lat: locality.lat,
      p_lng: locality.lng,
      p_radius_m: 1200,
      p_starts_at: null,
      p_ends_at: null,
      p_vehicle_type: null,
      p_max_price_paise: null,
      p_space_types: null,
      p_amenities: null,
      p_min_rating: null,
      p_instant_only: false,
      p_ev_only: false,
      p_sort: 'relevance',
      p_limit: 24,
      p_offset: 0,
    });
    results = (data ?? []) as SearchResult[];
  } catch {
    results = [];
  }

  const cheapest = results
    .map((r) => r.price_hourly_paise)
    .filter((p): p is number => p != null)
    .sort((a, b) => a - b)[0];

  const searchHref = `/search?lat=${locality.lat}&lng=${locality.lng}&q=${encodeURIComponent(
    `${locality.locality}, ${locality.city}`,
  )}`;

  // Structured data. Only ever describes the neighbourhood and the aggregate
  // offer, never an individual host's address.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: `Parking in ${locality.locality}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: locality.locality,
      addressRegion: locality.state,
      addressCountry: 'IN',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: locality.lat,
      longitude: locality.lng,
    },
  };

  return (
    <>
      <SiteHeader />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main id="main">
        <section className="border-b bg-[var(--surface-sunken)]">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
            <nav aria-label="Breadcrumb" className="mb-3 text-sm text-[var(--text-muted)]">
              <Link href="/" className="hover:underline">
                ParkSpace
              </Link>
              <span className="mx-1.5">/</span>
              <span className="capitalize">{locality.city}</span>
            </nav>

            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Parking in {locality.locality}
            </h1>

            {locality.blurb && (
              <p className="mt-3 max-w-2xl text-[var(--text-muted)]">{locality.blurb}</p>
            )}

            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span>
                <strong className="text-lg font-bold">{results.length}</strong>{' '}
                <span className="text-[var(--text-muted)]">
                  {results.length === 1 ? 'space' : 'spaces'} nearby
                </span>
              </span>
              {cheapest != null && (
                <span>
                  <span className="text-[var(--text-muted)]">From</span>{' '}
                  <strong className="text-lg font-bold">{formatPaise(cheapest)}</strong>{' '}
                  <span className="text-[var(--text-muted)]">an hour</span>
                </span>
              )}
            </div>

            <div className="mt-7">
              <SearchHero initialQuery={`${locality.locality}, ${locality.city}`} />
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <h2 className="text-xl font-bold tracking-tight">
            Available in {locality.locality}
          </h2>

          {results.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title={`No spaces in ${locality.locality} yet`}
                description="We are building supply one neighbourhood at a time, and this one is next. If you have parking here, listing it takes about ten minutes."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link href="/list-your-space" className="ps-btn ps-btn-primary">
                      List your space here
                    </Link>
                    <Link href={searchHref} className="ps-btn ps-btn-secondary">
                      Search a wider area
                    </Link>
                  </div>
                }
              />
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {results.map((result) => (
                  <SpaceCard key={result.id} result={result} href={`/space/${result.id}`} />
                ))}
              </div>

              <div className="mt-7 text-center">
                <Link href={searchHref} className="ps-btn ps-btn-secondary">
                  Search with your own dates and times
                </Link>
              </div>
            </>
          )}

          {locality.landmarks.length > 0 && (
            <section className="mt-12 border-t pt-8">
              <h2 className="text-xl font-bold tracking-tight">What is nearby</h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {locality.landmarks.map((landmark) => (
                  <li
                    key={landmark}
                    className="rounded-full border bg-[var(--surface-sunken)] px-3 py-1.5 text-sm"
                  >
                    {landmark}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-12 border-t pt-8">
            <h2 className="text-xl font-bold tracking-tight">
              Renting out parking in {locality.locality}
            </h2>
            <Card className="mt-4 p-6">
              <p className="text-[var(--text-muted)]">
                If you have a driveway, a garage or a bay in {locality.locality} that sits
                empty during the day, it is worth something to somebody parking a few streets
                away. You set the hours, the price and the rules, and ParkSpace keeps 10
                percent of each booking.
              </p>
              <Link href="/list-your-space" className="ps-btn ps-btn-primary mt-5">
                See how hosting works
              </Link>
            </Card>
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
