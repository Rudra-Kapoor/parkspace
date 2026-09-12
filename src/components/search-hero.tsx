'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { GeocodeResult } from '@/lib/geo';

/**
 * The search box.
 *
 * Three decisions worth noting.
 *
 * First, it works without JavaScript: it is a real form with a real GET action,
 * so a submit navigates to /search with the query even if the bundle never
 * loads. The autocomplete is an enhancement layered on top.
 *
 * Second, geocoding is debounced at 350 ms and goes through our own /api/geocode
 * proxy rather than calling Nominatim from the browser. Nominatim's usage policy
 * asks for one request per second and an identifying User-Agent, neither of which
 * a browser can honour reliably.
 *
 * Third, the default times are chosen rather than blank. "Now until two hours
 * from now" is what most people want, and an empty datetime field is a small
 * wall that stops a meaningful share of people from ever searching.
 */
export function SearchHero({
  compact = false,
  initialQuery = '',
  initialStart,
  initialEnd,
}: {
  compact?: boolean;
  initialQuery?: string;
  initialStart?: string;
  initialEnd?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [locating, setLocating] = useState(false);

  const [startAt, setStartAt] = useState(initialStart ?? '');
  const [endAt, setEndAt] = useState(initialEnd ?? '');

  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sensible defaults, computed on the client so the server render stays cacheable.
  useEffect(() => {
    if (initialStart || initialEnd) return;
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
    const later = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    setStartAt(toLocalInput(now));
    setEndAt(toLocalInput(later));
  }, [initialStart, initialEnd]);

  // Keep the end after the start without fighting the user: if they move the
  // start past the end, shift the end by the same duration rather than clamping
  // it to the start, which would silently destroy their chosen duration.
  useEffect(() => {
    if (!startAt || !endAt) return;
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (end <= start) {
      setEndAt(toLocalInput(new Date(start.getTime() + 2 * 60 * 60 * 1000)));
    }
  }, [startAt, endAt]);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('geocode failed');
        const data = (await response.json()) as { results: GeocodeResult[] };
        setResults(data.results ?? []);
        setOpen(true);
        setHighlighted(-1);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function go(lat: number, lng: number, label: string) {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng), q: label });
    if (startAt) params.set('starts_at', new Date(startAt).toISOString());
    if (endAt) params.set('ends_at', new Date(endAt).toISOString());
    router.push(`/search?${params.toString()}`);
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        go(position.coords.latitude, position.coords.longitude, 'My location');
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter' && highlighted >= 0) {
      event.preventDefault();
      const chosen = results[highlighted];
      if (chosen) go(chosen.lat, chosen.lng, chosen.displayName);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <form
      action="/search"
      method="get"
      className={compact ? '' : 'ps-card p-3 shadow-[var(--shadow-raised)]'}
      onSubmit={(event) => {
        // If the user typed a place and we already resolved it, prefer the
        // resolved coordinate over a text-only search.
        const first = results[0];
        if (first && query.trim().length >= 3) {
          event.preventDefault();
          go(first.lat, first.lng, first.displayName);
        }
      }}
    >
      <div className={compact ? 'flex flex-col gap-2 sm:flex-row' : 'flex flex-col gap-2 md:flex-row'}>
        <div className="relative flex-[2]" ref={containerRef}>
          <label htmlFor="search-where" className="sr-only">
            Where are you going
          </label>
          <div className="relative">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            >
              <path d="M12 21s-7-5.5-7-11a7 7 0 1114 0c0 5.5-7 11-7 11z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            <input
              id="search-where"
              name="q"
              type="text"
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-controls="search-suggestions"
              aria-autocomplete="list"
              placeholder="Where are you going?"
              className="ps-input pl-10"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
              onKeyDown={onKeyDown}
            />
            {loading && (
              <span
                aria-hidden="true"
                className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]"
              />
            )}
          </div>

          {open && results.length > 0 && (
            <ul
              id="search-suggestions"
              role="listbox"
              className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-72 overflow-auto rounded-xl border bg-[var(--surface-raised)] py-1 text-left shadow-[var(--shadow-raised)]"
            >
              {results.map((result, index) => (
                <li key={`${result.lat},${result.lng},${index}`} role="option" aria-selected={index === highlighted}>
                  <button
                    type="button"
                    onClick={() => go(result.lat, result.lng, result.displayName)}
                    onMouseEnter={() => setHighlighted(index)}
                    className={`block w-full px-4 py-2.5 text-left text-sm transition-colors ${
                      index === highlighted ? 'bg-[var(--surface-sunken)]' : ''
                    }`}
                  >
                    <span className="block truncate font-medium">
                      {result.displayName.split(',')[0]}
                    </span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">
                      {result.displayName.split(',').slice(1).join(',').trim()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-1 gap-2">
          <div className="flex-1">
            <label htmlFor="search-from" className="sr-only">
              Arriving
            </label>
            <input
              id="search-from"
              name="starts_at_local"
              type="datetime-local"
              className="ps-input"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
            />
          </div>
          <div className="flex-1">
            <label htmlFor="search-until" className="sr-only">
              Leaving
            </label>
            <input
              id="search-until"
              name="ends_at_local"
              type="datetime-local"
              className="ps-input"
              value={endAt}
              onChange={(event) => setEndAt(event.target.value)}
            />
          </div>
        </div>

        <button type="submit" className="ps-btn ps-btn-primary md:px-7">
          Search
        </button>
      </div>

      {!compact && (
        <div className="mt-2.5 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent-text)] hover:underline disabled:opacity-60"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M22 12h-3M5 12H2" />
            </svg>
            {locating ? 'Finding you...' : 'Use my current location'}
          </button>
        </div>
      )}
    </form>
  );
}

/** datetime-local wants a local-time string with no timezone suffix. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
