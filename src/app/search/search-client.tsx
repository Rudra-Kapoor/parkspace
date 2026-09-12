'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ParkingMap } from '@/components/parking-map';
import { SpaceCard } from '@/components/space-card';
import { SearchHero } from '@/components/search-hero';
import { EmptyState, SpaceCardSkeleton, cn } from '@/components/ui';
import { SPACE_TYPE_LABELS, VEHICLE_TYPE_LABELS, AMENITY_LABELS } from '@/lib/types';
import type { SearchResult, SpaceType, VehicleType } from '@/lib/types';
import type { LatLng } from '@/lib/geo';

const FILTER_AMENITIES = ['cctv', 'covered', 'gated', 'security_guard', 'lit', 'ev_charging'];

export function SearchClient({
  initialResults,
  initialTotal,
  initialCentre,
  initialRadius,
  initialQuery,
}: {
  initialResults: SearchResult[];
  initialTotal: number;
  initialCentre: LatLng;
  initialRadius: number;
  initialQuery: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [results, setResults] = useState(initialResults);
  const [total, setTotal] = useState(initialTotal);
  const [centre, setCentre] = useState(initialCentre);
  const [radius, setRadius] = useState(initialRadius);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [searchThisArea, setSearchThisArea] = useState<LatLng | null>(null);

  const startsAt = params.get('starts_at') ?? '';
  const endsAt = params.get('ends_at') ?? '';
  const sort = params.get('sort') ?? 'relevance';
  const vehicleType = params.get('vehicle_type') ?? '';
  const instantOnly = params.get('instant_only') === 'true';
  const evOnly = params.get('ev_only') === 'true';
  const spaceTypes = useMemo(() => params.getAll('space_types'), [params]);
  const amenities = useMemo(() => params.getAll('amenities'), [params]);

  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const runSearch = useCallback(
    async (overrides: { lat?: number; lng?: number; radius_m?: number } = {}) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      const query = new URLSearchParams();
      query.set('lat', String(overrides.lat ?? centre.lat));
      query.set('lng', String(overrides.lng ?? centre.lng));
      query.set('radius_m', String(overrides.radius_m ?? radius));
      if (startsAt) query.set('starts_at', startsAt);
      if (endsAt) query.set('ends_at', endsAt);
      if (vehicleType) query.set('vehicle_type', vehicleType);
      if (instantOnly) query.set('instant_only', 'true');
      if (evOnly) query.set('ev_only', 'true');
      query.set('sort', sort);
      for (const type of spaceTypes) query.append('space_types', type);
      for (const amenity of amenities) query.append('amenities', amenity);

      try {
        const response = await fetch(`/api/search?${query.toString()}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (data.ok) {
          setResults(data.results);
          setTotal(data.total);
          setSearchThisArea(null);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          // Leave the previous results on screen rather than blanking the page.
        }
      } finally {
        setLoading(false);
      }
    },
    [centre.lat, centre.lng, radius, startsAt, endsAt, vehicleType, instantOnly, evOnly, sort, spaceTypes, amenities],
  );

  // Re-run when a filter changes, but not on first mount: the server already
  // rendered the initial results and re-fetching them would be a wasted round
  // trip and a visible flash.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, vehicleType, instantOnly, evOnly, spaceTypes.join(','), amenities.join(',')]);

  function updateParam(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    router.replace(`/search?${next.toString()}`, { scroll: false });
  }

  function toggleMulti(key: string, value: string) {
    updateParam((next) => {
      const current = next.getAll(key);
      next.delete(key);
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      for (const v of updated) next.append(key, v);
    });
  }

  const handleMapMove = useCallback(
    (nextCentre: LatLng, nextRadius: number) => {
      const movedFar =
        Math.abs(nextCentre.lat - centre.lat) > 0.003 ||
        Math.abs(nextCentre.lng - centre.lng) > 0.003;

      // Offer rather than auto-search. A map that reloads results on every
      // small pan makes the list jump under the cursor while someone is reading it.
      if (movedFar) {
        setSearchThisArea(nextCentre);
        setRadius(nextRadius);
      }
    },
    [centre.lat, centre.lng],
  );

  const activeFilterCount =
    (vehicleType ? 1 : 0) +
    (instantOnly ? 1 : 0) +
    (evOnly ? 1 : 0) +
    spaceTypes.length +
    amenities.length;

  const buildHref = useCallback(
    (id: string) => {
      const query = new URLSearchParams();
      if (startsAt) query.set('starts_at', startsAt);
      if (endsAt) query.set('ends_at', endsAt);
      const suffix = query.toString();
      return `/space/${id}${suffix ? `?${suffix}` : ''}`;
    },
    [startsAt, endsAt],
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* ---------------------------------------------------------------- */}
      {/* Query bar                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-b bg-[var(--surface)] px-3 py-2.5">
        <SearchHero compact initialQuery={initialQuery} />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Filter bar                                                        */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex items-center gap-2 overflow-x-auto border-b bg-[var(--surface)] px-3 py-2">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className={cn(
            'ps-btn ps-btn-secondary shrink-0 !py-1.5 !text-xs',
            activeFilterCount > 0 && 'border-[var(--accent)] text-[var(--accent-text)]',
          )}
        >
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>

        <QuickToggle
          active={instantOnly}
          onClick={() => updateParam((n) => (instantOnly ? n.delete('instant_only') : n.set('instant_only', 'true')))}
        >
          Instant book
        </QuickToggle>

        <QuickToggle
          active={evOnly}
          onClick={() => updateParam((n) => (evOnly ? n.delete('ev_only') : n.set('ev_only', 'true')))}
        >
          EV charging
        </QuickToggle>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <label htmlFor="sort" className="sr-only">
            Sort results
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(event) => updateParam((n) => n.set('sort', event.target.value))}
            className="ps-input !w-auto !py-1.5 !text-xs"
          >
            <option value="relevance">Best match</option>
            <option value="distance">Closest</option>
            <option value="price_asc">Cheapest</option>
            <option value="price_desc">Most expensive</option>
            <option value="rating">Highest rated</option>
          </select>
        </div>
      </div>

      {showFilters && (
        <div className="border-b bg-[var(--surface-sunken)] px-4 py-4">
          <div className="mx-auto grid max-w-5xl gap-5 sm:grid-cols-3">
            <fieldset>
              <legend className="ps-label">Your vehicle</legend>
              <select
                value={vehicleType}
                onChange={(event) =>
                  updateParam((n) =>
                    event.target.value ? n.set('vehicle_type', event.target.value) : n.delete('vehicle_type'),
                  )
                }
                className="ps-input !text-sm"
              >
                <option value="">Any vehicle</option>
                {(Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map((type) => (
                  <option key={type} value={type}>
                    {VEHICLE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </fieldset>

            <fieldset>
              <legend className="ps-label">Type of space</legend>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(SPACE_TYPE_LABELS) as SpaceType[]).slice(0, 6).map((type) => (
                  <Chip
                    key={type}
                    active={spaceTypes.includes(type)}
                    onClick={() => toggleMulti('space_types', type)}
                  >
                    {SPACE_TYPE_LABELS[type]}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="ps-label">Must have</legend>
              <div className="flex flex-wrap gap-1.5">
                {FILTER_AMENITIES.map((amenity) => (
                  <Chip
                    key={amenity}
                    active={amenities.includes(amenity)}
                    onClick={() => toggleMulti('amenities', amenity)}
                  >
                    {AMENITY_LABELS[amenity] ?? amenity}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </div>

          {activeFilterCount > 0 && (
            <div className="mx-auto mt-4 max-w-5xl">
              <button
                type="button"
                onClick={() =>
                  updateParam((n) => {
                    n.delete('vehicle_type');
                    n.delete('instant_only');
                    n.delete('ev_only');
                    n.delete('space_types');
                    n.delete('amenities');
                  })
                }
                className="text-xs font-medium text-[var(--accent-text)] hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Body                                                              */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex min-h-0 flex-1">
        {/* Results list */}
        <div
          ref={listRef}
          className={cn(
            'min-h-0 w-full overflow-y-auto lg:w-[440px] lg:shrink-0 xl:w-[500px]',
            mobileView === 'map' && 'hidden lg:block',
          )}
        >
          <div className="px-4 py-3">
            <p className="text-sm text-[var(--text-muted)]" aria-live="polite">
              {loading
                ? 'Searching...'
                : total === 0
                  ? 'No spaces found'
                  : `${total} ${total === 1 ? 'space' : 'spaces'} available`}
            </p>
          </div>

          <div className="space-y-3 px-4 pb-24">
            {loading && results.length === 0 ? (
              <>
                <SpaceCardSkeleton />
                <SpaceCardSkeleton />
                <SpaceCardSkeleton />
              </>
            ) : results.length === 0 ? (
              <EmptyState
                title="Nothing available here yet"
                description={
                  startsAt
                    ? 'Try widening the time window, removing a filter, or searching a little further out. We are adding spaces in this area.'
                    : 'Try a different area or remove a filter. We are adding spaces all the time.'
                }
                action={
                  activeFilterCount > 0 ? (
                    <button
                      type="button"
                      className="ps-btn ps-btn-secondary"
                      onClick={() =>
                        updateParam((n) => {
                          n.delete('vehicle_type');
                          n.delete('instant_only');
                          n.delete('ev_only');
                          n.delete('space_types');
                          n.delete('amenities');
                        })
                      }
                    >
                      Clear filters
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ps-btn ps-btn-secondary"
                      onClick={() => {
                        const wider = Math.min(radius * 2, 10_000);
                        setRadius(wider);
                        void runSearch({ radius_m: wider });
                      }}
                    >
                      Search a wider area
                    </button>
                  )
                }
              />
            ) : (
              results.map((result) => (
                <SpaceCard
                  key={result.id}
                  result={result}
                  href={buildHref(result.id)}
                  selected={selectedId === result.id}
                  onHover={setSelectedId}
                  onSelect={setSelectedId}
                />
              ))
            )}
          </div>
        </div>

        {/* Map */}
        <div
          className={cn(
            'relative min-h-0 flex-1',
            mobileView === 'list' && 'hidden lg:block',
          )}
        >
          <ParkingMap
            className="h-full w-full"
            results={results}
            centre={centre}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              if (id) {
                // Bring the matching card into view so the two panes stay in step.
                document
                  .querySelector(`[data-space-card="${id}"]`)
                  ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }
            }}
            onMoveEnd={handleMapMove}
          />

          {searchThisArea && (
            <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
              <button
                type="button"
                className="ps-btn ps-btn-primary !py-2 text-xs shadow-[var(--shadow-raised)]"
                onClick={() => {
                  setCentre(searchThisArea);
                  void runSearch({ lat: searchThisArea.lat, lng: searchThisArea.lng, radius_m: radius });
                }}
              >
                Search this area
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile list/map switch */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center lg:hidden">
        <button
          type="button"
          onClick={() => setMobileView((v) => (v === 'list' ? 'map' : 'list'))}
          className="ps-btn ps-btn-primary pointer-events-auto shadow-[var(--shadow-raised)]"
        >
          {mobileView === 'list' ? 'Show map' : 'Show list'}
        </button>
      </div>
    </div>
  );
}

function QuickToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'ps-btn shrink-0 !py-1.5 !text-xs',
        active ? 'ps-btn-primary' : 'ps-btn-secondary',
      )}
    >
      {children}
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
          : 'border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]',
      )}
    >
      {children}
    </button>
  );
}
