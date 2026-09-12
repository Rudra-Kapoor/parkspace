/**
 * Geography helpers.
 *
 * The map stack is MapLibre GL over OpenStreetMap raster tiles, with Nominatim
 * for geocoding and OSRM for routing. All three are free and open, which is why
 * they were chosen over Google Maps: no billing account, no API key to leak, no
 * per-load quota that turns a traffic spike into an invoice.
 *
 * The obligation that comes with free is usage policy compliance, and that is
 * enforced here and in the /api/geocode route rather than left to good intentions.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const M_PER_DEGREE_LAT = 111_320;

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance in metres. Mirrors earth_distance_m() in the database so
 * a distance shown in the UI matches the one used for ranking.
 */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function metresPerDegreeLng(atLat: number): number {
  return Math.max(M_PER_DEGREE_LAT * Math.cos(toRadians(atLat)), 1);
}

export function boundingBox(centre: LatLng, radiusM: number): BoundingBox {
  const dLat = radiusM / M_PER_DEGREE_LAT;
  const dLng = radiusM / metresPerDegreeLng(centre.lat);
  return {
    minLat: centre.lat - dLat,
    maxLat: centre.lat + dLat,
    minLng: centre.lng - dLng,
    maxLng: centre.lng + dLng,
  };
}

/**
 * Human-readable distance. Walking distance matters more than precision here: a
 * driver deciding between two spaces cares about "4 minute walk", not "312 m".
 */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

/** At a brisk urban 1.35 m/s, which is the figure transport planners use. */
export function walkingMinutes(metres: number): number {
  return Math.max(1, Math.round(metres / 1.35 / 60));
}

export function formatWalk(metres: number): string {
  const mins = walkingMinutes(metres);
  return `${mins} min walk`;
}

export function isValidLatLng(value: unknown): value is LatLng {
  if (typeof value !== 'object' || value === null) return false;
  const { lat, lng } = value as Record<string, unknown>;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Where the map opens before the user has told us anything. */
export const DEFAULT_CENTRE: LatLng = { lat: 22.5726, lng: 88.3639 };

/**
 * MapLibre style using OpenStreetMap raster tiles.
 *
 * Raster rather than vector deliberately. Vector tiles need a tile server or a
 * paid provider; the OSM raster endpoint needs neither and renders fine for a
 * product where the map is a means of choosing a parking space, not a cartography
 * showcase.
 *
 * The attribution string is not decoration. The OSM tile usage policy requires
 * visible attribution, and removing it would be both a licence breach and, for a
 * product built on a volunteer-maintained dataset, plainly wrong.
 */
export function osmRasterStyle(): object {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'osm-tiles',
        type: 'raster',
        source: 'osm',
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  };
}

/**
 * A muted style for contexts where the map is background rather than subject,
 * such as the small map on a booking confirmation. Carto's light basemap is free
 * for reasonable use and carries its own attribution requirement.
 */
export function cartoLightStyle(): object {
  return {
    version: 8,
    sources: {
      carto: {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
          'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© OpenStreetMap contributors © CARTO',
      },
    },
    layers: [{ id: 'carto-tiles', type: 'raster', source: 'carto', minzoom: 0, maxzoom: 20 }],
  };
}

/**
 * A deep link that opens turn-by-turn directions in whatever the user already
 * has. We do not embed a routing UI: every phone already has a better one, and
 * a driver about to park wants their own navigation app, not ours.
 */
export function directionsUrl(destination: LatLng, label?: string): string {
  const query = label ? encodeURIComponent(label) : `${destination.lat},${destination.lng}`;
  return `https://www.openstreetmap.org/directions?to=${destination.lat},${destination.lng}#map=17/${destination.lat}/${destination.lng}&query=${query}`;
}

/** Geo URI, which hands off to the platform's default map app on mobile. */
export function geoUri(destination: LatLng, label?: string): string {
  const base = `geo:${destination.lat},${destination.lng}`;
  return label ? `${base}?q=${destination.lat},${destination.lng}(${encodeURIComponent(label)})` : base;
}

export interface GeocodeResult {
  displayName: string;
  lat: number;
  lng: number;
  type: string;
  locality?: string;
  city?: string;
  state?: string;
  postcode?: string;
}

/**
 * Cluster nearby points so the map does not draw 400 overlapping pins.
 *
 * A simple grid clusterer rather than a library. At the zoom levels and result
 * counts this product deals with, grid clustering is indistinguishable from
 * k-means and costs nothing.
 */
export interface Cluster<T> {
  lat: number;
  lng: number;
  items: T[];
}

export function clusterPoints<T extends LatLng>(points: T[], cellSizeDegrees: number): Cluster<T>[] {
  const cells = new Map<string, T[]>();

  for (const point of points) {
    const key = `${Math.floor(point.lat / cellSizeDegrees)}:${Math.floor(point.lng / cellSizeDegrees)}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(point);
    else cells.set(key, [point]);
  }

  return Array.from(cells.values()).map((items) => ({
    lat: items.reduce((sum, p) => sum + p.lat, 0) / items.length,
    lng: items.reduce((sum, p) => sum + p.lng, 0) / items.length,
    items,
  }));
}

/** Cell size that keeps clusters visually sensible at a given zoom. */
export function cellSizeForZoom(zoom: number): number {
  return 360 / 2 ** zoom / 2;
}
