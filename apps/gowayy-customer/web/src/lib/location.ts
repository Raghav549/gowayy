import { catalogue } from '@gowayy/catalog';
import { OfflineGeocoder } from '@gowayy/location-engine';

const STORAGE_KEY = 'gowayy.customer.location';
const geocoder = new OfflineGeocoder(catalogue.places as unknown as ConstructorParameters<typeof OfflineGeocoder>[0]);

export interface WebLocation {
  label: string;
  lat?: number;
  lng?: number;
  source: 'gps' | 'manual' | 'default';
  updatedAt: string;
}

export function loadSavedLocation(): WebLocation {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as WebLocation;
  } catch {}
  return { label: 'Darjeeling Himalaya', source: 'default', updatedAt: new Date().toISOString() };
}

export function saveLocation(v: WebLocation) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch {}
}

export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'unknown';

export async function checkPermission(): Promise<PermissionStatus> {
  if (!('permissions' in navigator) || !('geolocation' in navigator)) {
    return 'geolocation' in navigator ? 'unknown' : 'unsupported';
  }
  try {
    const result = await (navigator as unknown as { permissions: { query(o: { name: string }): Promise<{ state: string }> } }).permissions.query({ name: 'geolocation' as PermissionName });
    if (result.state === 'granted' || result.state === 'denied' || result.state === 'prompt') return result.state;
  } catch {}
  return 'unknown';
}

export function requestCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      if (err.code === 1) reject(new Error('Location permission was denied. You can still choose a destination manually, or enable location in your browser site settings and retry.'));
      else if (err.code === 2) reject(new Error('Your location is unavailable. Check that GPS/location services are enabled and try again.'));
      else if (err.code === 3) reject(new Error('Location request timed out. Please try again in an open area.'));
      else reject(new Error(err.message || 'Could not get your location.'));
    }, { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000 });
  });
}

export async function reverseLabel(lat: number, lng: number): Promise<string | null> {
  try {
    const r = await geocoder.reverse({ lat, lng });
    if (r) return r.label;
  } catch {}
  return null;
}

// Optional external reverse geocoder — only called when configured via env.
// The API key is read from Vite env at build time and never hardcoded.
export async function tryExternalReverse(lat: number, lng: number): Promise<string | null> {
  const url = import.meta.env.VITE_GEOCODING_REVERSE_URL as string | undefined;
  const key = import.meta.env.VITE_GEOCODING_API_KEY as string | undefined;
  if (!url || url.includes('YOUR_')) return null;
  try {
    const endpoint = url.replace('{lat}', String(lat)).replace('{lng}', String(lng)).replace('{key}', key ?? '');
    const res = await fetch(endpoint, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as { label?: string; display_name?: string; name?: string };
    return data.label ?? data.display_name ?? data.name ?? null;
  } catch { return null; }
}
