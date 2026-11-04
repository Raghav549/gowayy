/**
 * Provider-based location architecture: permission handling, reverse geocoding,
 * saved places and navigation handoff. The provider is intentionally an interface
 * so a Directions/Places/Distance-Matrix API can be added without screen changes.
 */
import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';

export interface Coords { lat: number; lng: number }
export interface LocationFix extends Coords { label: string; accuracyM: number | null }

export interface LocationProvider {
  current(): Promise<LocationFix | null>;
  reverse(c: Coords): Promise<string | null>;
  distanceKm(a: Coords, b: Coords): number;
  directionsUrl(a: Coords | null, b: Coords): string;
}

export const expoLocationProvider: LocationProvider = {
  async current() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') return null;
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const c = { lat: p.coords.latitude, lng: p.coords.longitude };
      return { ...c, accuracyM: p.coords.accuracy, label: await this.reverse(c) ?? `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}` };
    } catch { return null; }
  },
  async reverse(c) {
    try {
      const places = await Location.reverseGeocodeAsync({ latitude: c.lat, longitude: c.lng });
      const p = places[0];
      if (!p) return null;
      return [p.name, p.city, p.region].filter(Boolean).join(', ') || null;
    } catch { return null; }
  },
  distanceKm(a, b) {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 1.3 * 10) / 10; // road factor
  },
  directionsUrl(a, b) {
    const dest = `${b.lat},${b.lng}`;
    return a
      ? `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${dest}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
  },
};

export async function openNavigationHandoff(a: Coords | null, b: Coords): Promise<boolean> {
  const webUrl = expoLocationProvider.directionsUrl(a, b);
  const nativeUrl = `geo:${b.lat},${b.lng}?q=${b.lat},${b.lng}`;
  for (const url of Platform.OS === 'web' ? [webUrl] : [nativeUrl, webUrl]) {
    try {
      if (await Linking.canOpenURL(url)) { await Linking.openURL(url); return true; }
    } catch { /* try next scheme */ }
  }
  return false;
}
