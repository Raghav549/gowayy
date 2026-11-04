/** Provider-based map/geocoding/directions abstraction with a deterministic offline fallback. */
import type { Coordinates, Place } from '@gowayy/types';

const EARTH_KM = 6371.0088;
const rad = (d: number): number => (d * Math.PI) / 180;

export function haversineKm(a: Coordinates, b: Coordinates): number {
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingDegrees(a: Coordinates, b: Coordinates): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export interface RouteEstimate {
  from: Coordinates; to: Coordinates;
  straightLineKm: number;
  distanceKm: number;
  durationMin: number;
  provider: 'offline-estimate' | string;
  note: string;
  points: Coordinates[];
}

/** Mountain-road estimate. Explicitly an estimate, not turn-by-turn directions. */
export function estimateRoute(from: Coordinates, to: Coordinates, opts: { roadFactor?: number; avgSpeedKmh?: number; profile?: 'hill' | 'plain' } = {}): RouteEstimate {
  const straight = haversineKm(from, to);
  const factor = opts.roadFactor ?? (opts.profile === 'plain' ? 1.22 : 1.45);
  const speed = opts.avgSpeedKmh ?? (opts.profile === 'plain' ? 38 : 26);
  const distance = straight * factor;
  const mid = { lat: (from.lat + to.lat) / 2 + (to.lng - from.lng) * 0.06, lng: (from.lng + to.lng) / 2 + (to.lat - from.lat) * 0.04 };
  return {
    from, to, straightLineKm: straight, distanceKm: distance, durationMin: Math.round((distance / speed) * 60),
    provider: 'offline-estimate',
    note: 'Estimated from geodesic distance with a documented hill-road factor. Configure a directions provider for turn-by-turn routes.',
    points: [from, mid, to],
  };
}

export function nearest<T extends Coordinates>(origin: Coordinates, items: T[]): T | null {
  return items.slice().sort((a, b) => haversineKm(origin, a) - haversineKm(origin, b))[0] ?? null;
}
export function withinRadius<T extends Coordinates>(origin: Coordinates, items: T[], km: number): Array<T & { distanceKm: number }> {
  return items.map((i) => ({ ...i, distanceKm: haversineKm(origin, i) }))
    .filter((i) => i.distanceKm <= km)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export interface ProjectedPoint { x: number; y: number; place: Coordinates }
/** Equirectangular projection for the dependency-free schematic map. */
export function projectPoints(places: Coordinates[], width = 800, height = 480, padding = 56): ProjectedPoint[] {
  if (places.length === 0) return [];
  const lats = places.map((p) => p.lat); const lngs = places.map((p) => p.lng);
  const minLat = Math.min(...lats); const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs);
  const spanLat = Math.max(maxLat - minLat, 0.01); const spanLng = Math.max(maxLng - minLng, 0.01);
  const scale = Math.min((width - padding * 2) / spanLng, (height - padding * 2) / spanLat);
  const offsetX = (width - spanLng * scale) / 2; const offsetY = (height - spanLat * scale) / 2;
  return places.map((p) => ({ x: offsetX + (p.lng - minLng) * scale, y: height - (offsetY + (p.lat - minLat) * scale), place: p }));
}

// ---- Provider contracts -------------------------------------------------
export interface GeocodeResult extends Coordinates { label: string; confidence: number }
export interface DirectionsResult { distanceKm: number; durationMin: number; polyline: Coordinates[]; provider: string }
export interface PlaceResult extends Coordinates { id: string; name: string; category: string }
export interface DistanceResult { fromId: string; toId: string; distanceKm: number; durationMin: number }

export interface MapProvider { readonly name: string; tileUrl(coords: Coordinates, zoom: number): string | null }
export interface GeocodingProvider { readonly name: string; forward(query: string): Promise<GeocodeResult[]>; reverse(coords: Coordinates): Promise<GeocodeResult | null> }
export interface DirectionsProvider { readonly name: string; directions(from: Coordinates, to: Coordinates): Promise<DirectionsResult> }
export interface PlacesProvider { readonly name: string; search(query: string, near?: Coordinates): Promise<PlaceResult[]> }
export interface DistanceMatrixProvider { readonly name: string; matrix(from: Place[], to: Place[]): Promise<DistanceResult[]> }

export class QuotaExceededError extends Error { constructor(provider: string) { super(`Map provider quota exceeded: ${provider}`); this.name = 'QuotaExceededError'; } }

/** Seeded geocoder: resolves only known places, never invents a location. */
export class OfflineGeocoder implements GeocodingProvider {
  readonly name = 'offline-seeded';
  private readonly places: Place[];
  constructor(places: Place[]) { this.places = places; }
  async forward(query: string): Promise<GeocodeResult[]> {
    const q = query.trim().toLowerCase();
    return this.places.filter((p) => p.name.toLowerCase().includes(q) || (p.locality ?? '').toLowerCase().includes(q))
      .map((p) => ({ lat: p.lat, lng: p.lng, label: p.name, confidence: p.name.toLowerCase() === q ? 1 : 0.7 }));
  }
  async reverse(coords: Coordinates): Promise<GeocodeResult | null> {
    const best = nearest(coords, this.places);
    if (!best || haversineKm(coords, best) > 5) return null;
    return { lat: best.lat, lng: best.lng, label: best.name, confidence: 0.6 };
  }
}

export class OfflineDirections implements DirectionsProvider {
  readonly name = 'offline-estimate';
  async directions(from: Coordinates, to: Coordinates): Promise<DirectionsResult> {
    const r = estimateRoute(from, to);
    return { distanceKm: r.distanceKm, durationMin: r.durationMin, polyline: r.points, provider: this.name };
  }
}

export class OfflinePlaces implements PlacesProvider {
  readonly name = 'offline-seeded';
  private readonly places: Place[];
  constructor(places: Place[]) { this.places = places; }
  async search(query: string, near?: Coordinates): Promise<PlaceResult[]> {
    const q = query.toLowerCase();
    const hits = this.places.filter((p) => p.name.toLowerCase().includes(q));
    return (near ? withinRadius(near, hits, 60) : hits.map((h) => ({ ...h, distanceKm: 0 })))
      .map((p) => ({ id: p.id, name: p.name, category: p.kind ?? 'place', lat: p.lat, lng: p.lng }));
  }
}

export class OfflineMap implements MapProvider {
  readonly name = 'offline-schematic';
  tileUrl(): string | null { return null; } // schematic SVG map is rendered locally
}

export interface LocationProviders {
  map: MapProvider; geocoding: GeocodingProvider[]; directions: DirectionsProvider[]; places: PlacesProvider[]; distanceMatrix?: DistanceMatrixProvider;
}

/** Tries providers in order, skipping failures/quota errors. */
export async function withFallback<T>(providers: Array<{ name: string }>, run: (p: { name: string }) => Promise<T>): Promise<{ value: T; provider: string }> {
  let lastError: unknown;
  for (const p of providers) {
    try { return { value: await run(p), provider: p.name }; } catch (e) { lastError = e; }
  }
  throw lastError instanceof Error ? lastError : new Error('All location providers failed');
}

export function createOfflineProviders(places: Place[]): LocationProviders {
  return { map: new OfflineMap(), geocoding: [new OfflineGeocoder(places)], directions: [new OfflineDirections()], places: [new OfflinePlaces(places)] };
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';
export interface LocationPermission { state: PermissionState; canRequest: boolean }
export const SAVED_PLACE_LABELS = ['Home', 'Work', 'Hotel', 'Airport'] as const;
