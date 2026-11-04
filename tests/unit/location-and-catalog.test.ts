import { describe, expect, it } from 'vitest';
import {
  haversineKm, bearingDegrees, estimateRoute, nearest, withinRadius, projectPoints,
  OfflineGeocoder, OfflineDirections, OfflinePlaces, createOfflineProviders, withFallback,
  QuotaExceededError,
} from '@gowayy/location-engine';
import { catalogue, destinations, searchCatalog, recommendationsForDestination, getDestination, imageCredits } from '@gowayy/catalog';
import IMAGE_SOURCES from '../../assets/images/IMAGE_SOURCES.json';

const darjeeling = { lat: 27.036, lng: 88.2627 };
const bagdogra = { lat: 26.6812, lng: 88.3285 };

describe('location engine', () => {
  it('computes a plausible great-circle distance and bearing', () => {
    const d = haversineKm(darjeeling, darjeeling);
    expect(d).toBe(0);
    const km = haversineKm(bagdogra, darjeeling);
    expect(km).toBeGreaterThan(30);
    expect(km).toBeLessThan(90);
    expect(bearingDegrees(bagdogra, darjeeling)).toBeGreaterThan(0);
  });

  it('route estimate is longer than straight line but explicitly labelled as an estimate', () => {
    const r = estimateRoute(bagdogra, darjeeling);
    expect(r.distanceKm).toBeGreaterThan(r.straightLineKm);
    expect(r.durationMin).toBeGreaterThan(0);
    expect(r.provider).toBe('offline-estimate');
    expect(r.note.toLowerCase()).toMatch(/estimate|offline/);
    expect(r.points.length).toBeGreaterThan(1);
  });

  it('nearest, radius filtering and projection are deterministic', () => {
    const places = catalogue.places;
    const n = nearest(darjeeling, places);
    expect(n).not.toBeNull();
    const near = withinRadius(darjeeling, places, 20);
    expect(near.every((p) => p.distanceKm <= 20)).toBe(true);
    expect(near[0].distanceKm).toBeLessThanOrEqual(near[near.length - 1].distanceKm);
    const pts = projectPoints([bagdogra, darjeeling], 800, 480);
    expect(pts).toHaveLength(2);
    expect(pts.every((p) => p.x >= 0 && p.x <= 800 && p.y >= 0 && p.y <= 480)).toBe(true);
  });

  it('offline providers resolve only seeded places, never invented ones', async () => {
    const providers = createOfflineProviders(catalogue.places);
    const geocoder = providers.geocoding[0] as OfflineGeocoder;
    expect((await geocoder.forward('Darjeeling')).length).toBeGreaterThan(0);
    expect(await geocoder.forward('ACompletelyUnknownPlaceXYZ')).toEqual([]);
    expect(await (providers.places[0] as OfflinePlaces).search('ACompletelyUnknownPlaceXYZ')).toEqual([]);
    const directions = await (providers.directions[0] as OfflineDirections).directions(bagdogra, darjeeling);
    expect(directions.provider).toBe('offline-estimate');
    expect(directions.polyline.length).toBeGreaterThan(1);
    expect(providers.map.tileUrl(darjeeling, 12)).toBeNull();
  });

  it('provider fallback skips failing/quota-exceeded providers', async () => {
    const r = await withFallback(
      [{ name: 'quota' }, { name: 'offline' }],
      async (p) => { if (p.name === 'quota') throw new QuotaExceededError('quota'); return 42; },
    );
    expect(r).toEqual({ value: 42, provider: 'offline' });
    await expect(withFallback([{ name: 'a' }], async () => { throw new Error('down'); })).rejects.toThrow('down');
  });
});

describe('destination catalogue and image provenance', () => {
  it('contains every initial destination and supports lookup by id or slug', () => {
    const required = ['Darjeeling', 'Kalimpong', 'Kurseong', 'Mirik', 'Siliguri', 'Lepchajagat',
      'Lamahatta', 'Tinchuley', 'Takdah', 'Chatakpur', 'Sandakphu', 'Sittong', 'Dawaipani', 'Jorebunglow'];
    for (const name of required) expect(destinations.some((d) => d.name === name)).toBe(true);
    expect(getDestination('darjeeling')?.name).toBe('Darjeeling');
    expect(getDestination('dst_darjeeling')?.name).toBe('Darjeeling');
    expect(destinations.every((d) => d.coords.lat > -90 && d.coords.lat < 90)).toBe(true);
  });

  it('every displayed place image has a verified licence, alt text and source', () => {
    for (const d of destinations) {
      for (const img of d.images) {
        expect(img.alt.length).toBeGreaterThan(3);
        if (img.status === 'verified') {
          expect(img.assetPath).toBeTruthy();
          expect(img.credit).toBeTruthy();
          expect(img.license).toBeTruthy();
          expect(img.sourceUrl).toMatch(/^https:\/\//);
        } else {
          expect(img.verificationNote).toMatch(/no verified/i);
        }
      }
    }
    expect(imageCredits.length).toBeGreaterThan(0);
    const manifest = IMAGE_SOURCES as { assets: Array<{ id: string; license: string; displayed?: boolean; localOriginal: string }> };
    expect(manifest.assets.length).toBeGreaterThanOrEqual(imageCredits.length);
    expect(manifest.assets.filter((a) => a.displayed === false).every((a) => a.license === 'UNVERIFIED')).toBe(true);
  });

  it('universal search spans destinations, hotels, food, groceries, routes and experiences', () => {
    expect(searchCatalog('')).toEqual([]);
    const kinds = new Set(searchCatalog('darjeeling', 100).map((h) => h.kind));
    expect(kinds.has('destination')).toBe(true);
    expect(searchCatalog('momos', 100).some((h) => h.kind === 'food')).toBe(true);
    expect(searchCatalog('airport', 100).some((h) => h.kind === 'taxi_route' || h.kind === 'destination')).toBe(true);
    const hits = searchCatalog('a', 1000);
    for (const kind of ['destination', 'attraction', 'property', 'restaurant', 'food', 'grocery', 'taxi_route', 'package', 'experience']) {
      expect(hits.some((h) => h.kind === kind)).toBe(true);
    }
    expect(searchCatalog('darjeeling', 100).every((h) => h.href.startsWith('/'))).toBe(true);
  });

  it('connected recommendations preserve destination context and never fabricate availability', () => {
    const groups = recommendationsForDestination('dst_darjeeling');
    expect(groups.properties.length).toBeGreaterThan(0);
    expect(groups.restaurants.length).toBeGreaterThan(0);
    expect(groups.attractions.length).toBeGreaterThan(0);
    expect(groups.taxiRoutes.length).toBeGreaterThan(0);
    for (const group of Object.values(groups)) {
      for (const item of group) {
        expect(typeof item.available).toBe('boolean');
        expect(item.href.startsWith('/')).toBe(true);
      }
    }
    expect(recommendationsForDestination('dst_unknown').properties).toEqual([]);
  });

  it('demo listings never expose fabricated ratings or reviews', () => {
    for (const p of catalogue.properties) {
      expect((p as unknown as Record<string, unknown>).rating).toBeUndefined();
      expect((p as unknown as Record<string, unknown>).reviewCount).toBeUndefined();
    }
    for (const r of catalogue.restaurants) {
      expect((r as unknown as Record<string, unknown>).rating).toBeUndefined();
    }
  });
});
