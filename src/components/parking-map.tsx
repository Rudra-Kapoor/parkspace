'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { osmRasterStyle, type LatLng } from '@/lib/geo';
import { formatPaiseCompact } from '@/lib/money';
import type { SearchResult } from '@/lib/types';

/**
 * The results map.
 *
 * Built on MapLibre GL with OpenStreetMap raster tiles. No API key, no billing
 * account, no quota.
 *
 * Accessibility note, because a map is the hardest thing on this site to use
 * without a mouse: the map itself is marked aria-hidden and excluded from the
 * tab order, and every marker has an equivalent, focusable entry in the results
 * list beside it. Duplicating pins into the tab order would make a keyboard user
 * traverse sixty markers to reach the footer while giving them nothing the list
 * does not already offer. The list is the accessible interface; the map is a
 * visual index onto it.
 */
export function ParkingMap({
  results,
  centre,
  selectedId,
  onSelect,
  onMoveEnd,
  className,
}: {
  results: SearchResult[];
  centre: LatLng;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMoveEnd?: (centre: LatLng, radiusM: number) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const centreMarkerRef = useRef<Marker | null>(null);
  const onMoveEndRef = useRef(onMoveEnd);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);

  // Keep the latest callbacks in refs so the map effect does not re-run, and
  // therefore does not tear down and rebuild the map, every time the parent
  // re-renders with a new closure.
  useEffect(() => {
    onMoveEndRef.current = onMoveEnd;
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: osmRasterStyle() as maplibregl.StyleSpecification,
      center: [centre.lng, centre.lat],
      zoom: 14.5,
      attributionControl: { compact: true },
      // The map is a visual aid with a full list equivalent, so it is removed
      // from the tab order rather than trapping keyboard users inside it.
      keyboard: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        showAccuracyCircle: true,
      }),
      'top-right',
    );

    map.on('load', () => setReady(true));

    map.on('moveend', () => {
      const handler = onMoveEndRef.current;
      if (!handler) return;
      const c = map.getCenter();
      // Radius that comfortably covers the visible viewport.
      const bounds = map.getBounds();
      const radiusM = Math.min(
        10_000,
        Math.max(
          300,
          Math.round(
            bounds.getNorthEast().distanceTo(bounds.getSouthWest()) / 2,
          ),
        ),
      );
      handler({ lat: c.lat, lng: c.lng }, radiusM);
    });

    // Clicking empty map clears the selection, which is what people expect.
    map.on('click', (event) => {
      const target = event.originalEvent.target as HTMLElement | null;
      if (target?.closest('.ps-pin')) return;
      onSelectRef.current(null);
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
    // Intentionally empty: the map is created once and updated imperatively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move the map when the search centre changes, without rebuilding it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const current = map.getCenter();
    const moved =
      Math.abs(current.lat - centre.lat) > 0.0008 || Math.abs(current.lng - centre.lng) > 0.0008;
    if (moved) map.easeTo({ center: [centre.lng, centre.lat], duration: 600 });
  }, [centre.lat, centre.lng, ready]);

  // The search centre pin, so the driver can see where they asked about.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    centreMarkerRef.current?.remove();

    const element = document.createElement('div');
    element.setAttribute('aria-hidden', 'true');
    element.style.cssText =
      'width:14px;height:14px;border-radius:9999px;background:var(--accent);' +
      'border:3px solid var(--surface);box-shadow:0 0 0 2px var(--accent);';

    centreMarkerRef.current = new maplibregl.Marker({ element })
      .setLngLat([centre.lng, centre.lat])
      .addTo(map);
  }, [centre.lat, centre.lng, ready]);

  const markerKey = useMemo(
    () => results.map((r) => `${r.id}:${r.quoted_base_paise ?? r.price_hourly_paise ?? 0}`).join(','),
    [results],
  );

  // Rebuild markers when the result set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const seen = new Set<string>();

    for (const result of results) {
      seen.add(result.id);

      const priceLabel =
        result.quoted_base_paise != null
          ? formatPaiseCompact(result.quoted_base_paise)
          : result.price_hourly_paise != null
            ? `${formatPaiseCompact(result.price_hourly_paise)}/hr`
            : result.price_daily_paise != null
              ? `${formatPaiseCompact(result.price_daily_paise)}/day`
              : '—';

      const existing = markersRef.current.get(result.id);
      if (existing) {
        const element = existing.getElement();
        element.textContent = priceLabel;
        element.dataset.selected = String(selectedId === result.id);
        continue;
      }

      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'ps-pin';
      element.textContent = priceLabel;
      element.dataset.selected = String(selectedId === result.id);
      // Removed from the tab order on purpose; the results list is the
      // keyboard-accessible equivalent.
      element.tabIndex = -1;
      element.setAttribute('aria-hidden', 'true');

      element.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelectRef.current(result.id);
      });

      const marker = new maplibregl.Marker({ element, anchor: 'bottom' })
        .setLngLat([result.approx_lng, result.approx_lat])
        .addTo(map);

      markersRef.current.set(result.id, marker);
    }

    // Remove markers for results that dropped out of the set.
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [markerKey, results, ready, selectedId]);

  // Reflect the selection, and bring the chosen pin into view if it is off screen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    for (const [id, marker] of markersRef.current) {
      marker.getElement().dataset.selected = String(id === selectedId);
    }

    if (!selectedId) return;
    const selected = results.find((r) => r.id === selectedId);
    if (!selected) return;

    if (!map.getBounds().contains([selected.approx_lng, selected.approx_lat])) {
      map.easeTo({ center: [selected.approx_lng, selected.approx_lat], duration: 500 });
    }
  }, [selectedId, results, ready]);

  const fitToResults = useCallback(() => {
    const map = mapRef.current;
    if (!map || results.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([centre.lng, centre.lat]);
    for (const result of results) bounds.extend([result.approx_lng, result.approx_lat]);
    map.fitBounds(bounds, { padding: 70, maxZoom: 16, duration: 600 });
  }, [results, centre.lat, centre.lng]);

  return (
    <div className={className} style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        className="h-full w-full"
        aria-hidden="true"
        role="presentation"
      />

      {results.length > 0 && (
        <button
          type="button"
          onClick={fitToResults}
          className="ps-btn ps-btn-secondary absolute bottom-8 left-3 z-10 !py-1.5 !text-xs shadow-[var(--shadow-card)]"
        >
          Fit all results
        </button>
      )}

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)]">
          <span className="text-sm text-[var(--text-muted)]">Loading map...</span>
        </div>
      )}
    </div>
  );
}
