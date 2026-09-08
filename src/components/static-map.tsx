'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cartoLightStyle } from '@/lib/geo';

/**
 * A single-location map.
 *
 * When the viewer is not yet entitled to the exact address, this draws a circle
 * covering the approximate area rather than a pin. A pin implies precision the
 * viewer has not earned, and drawing one at a jittered coordinate would be worse
 * than useless: it would point confidently at the wrong house.
 */
export function StaticMap({
  lat,
  lng,
  exact,
  label,
}: {
  lat: number;
  lng: number;
  exact: boolean;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: cartoLightStyle() as maplibregl.StyleSpecification,
      center: [lng, lat],
      zoom: exact ? 16.5 : 14.5,
      attributionControl: { compact: true },
      keyboard: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      if (exact) {
        const element = document.createElement('div');
        element.style.cssText =
          'width:18px;height:18px;border-radius:9999px;background:var(--accent);' +
          'border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);';
        new maplibregl.Marker({ element }).setLngLat([lng, lat]).addTo(map);
      } else {
        // A 220 m circle drawn as a polygon, which reads unambiguously as
        // "somewhere in here" rather than "exactly here".
        const points = 64;
        const radiusM = 220;
        const coords: [number, number][] = [];
        for (let i = 0; i <= points; i += 1) {
          const angle = (i / points) * 2 * Math.PI;
          const dLat = (radiusM * Math.cos(angle)) / 111_320;
          const dLng = (radiusM * Math.sin(angle)) / (111_320 * Math.cos((lat * Math.PI) / 180));
          coords.push([lng + dLng, lat + dLat]);
        }

        map.addSource('area', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [coords] },
          },
        });

        map.addLayer({
          id: 'area-fill',
          type: 'fill',
          source: 'area',
          paint: { 'fill-color': '#14816f', 'fill-opacity': 0.18 },
        });

        map.addLayer({
          id: 'area-line',
          type: 'line',
          source: 'area',
          paint: { 'line-color': '#14816f', 'line-width': 2, 'line-dasharray': [2, 2] },
        });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, exact]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-hidden="true" role="presentation" />
      {/* The text equivalent, for anyone who cannot see the map. */}
      <p className="sr-only">
        {exact
          ? `Map showing the exact location of ${label}.`
          : `Map showing the approximate area of ${label}. The exact location is released after booking.`}
      </p>
    </div>
  );
}
