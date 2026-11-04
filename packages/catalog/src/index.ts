/**
 * Read-only catalogue facade. All records come from JSON so new destinations,
 * attractions and listings can be added without changing application code.
 */
import type {
  Attraction, Destination, Experience, GroceryStore, HiddenGem, Place, Property,
  Restaurant, SearchHit, SharedTaxiRoute, TourPackage, VehicleClass,
} from '@gowayy/types';
import destinationsJson from './data/destinations.json' with { type: 'json' };
import hiddenGemsJson from './data/hidden-gems.json' with { type: 'json' };
import attractionsJson from './data/attractions.json' with { type: 'json' };
import placesJson from './data/places.json' with { type: 'json' };
import vehiclesJson from './data/vehicles.json' with { type: 'json' };
import sharedRoutesJson from './data/shared-taxi-routes.json' with { type: 'json' };
import propertiesJson from './data/properties.json' with { type: 'json' };
import restaurantsJson from './data/restaurants.json' with { type: 'json' };
import groceryStoresJson from './data/grocery-stores.json' with { type: 'json' };
import packagesJson from './data/tour-packages.json' with { type: 'json' };
import experiencesJson from './data/experiences.json' with { type: 'json' };
import productsJson from './data/products.json' with { type: 'json' };
import type { MarketplaceProduct } from '@gowayy/commerce';
import { slugify } from '@gowayy/shared-utils';

export const destinations = destinationsJson as unknown as Destination[];
export const hiddenGems = hiddenGemsJson as unknown as HiddenGem[];
export const attractions = attractionsJson as unknown as Attraction[];
export const places = placesJson as unknown as Place[];
export const vehicles = vehiclesJson as unknown as VehicleClass[];
export const sharedTaxiRoutes = sharedRoutesJson as unknown as SharedTaxiRoute[];
export const properties = propertiesJson as unknown as Property[];
export const restaurants = restaurantsJson as unknown as Restaurant[];
export const groceryStores = groceryStoresJson as unknown as GroceryStore[];
export const tourPackages = packagesJson as unknown as TourPackage[];
export const experiences = experiencesJson as unknown as Experience[];
export const marketplaceProducts = productsJson as unknown as MarketplaceProduct[];

export const catalogue = {
  destinations, hiddenGems, attractions, places, vehicles, sharedTaxiRoutes,
  properties, restaurants, groceryStores, tourPackages, experiences, marketplaceProducts,
};

export function getDestination(idOrSlug: string): Destination | undefined {
  return destinations.find((d) => d.id === idOrSlug || d.slug === idOrSlug);
}
export function getPlace(id: string): Place | undefined { return places.find((p) => p.id === id); }
export function getVehicle(id: string): VehicleClass | undefined { return vehicles.find((v) => v.id === id); }
export function getProperty(id: string): Property | undefined { return properties.find((p) => p.id === id); }
export function getRestaurant(id: string): Restaurant | undefined { return restaurants.find((r) => r.id === id); }
export function getStore(id: string): GroceryStore | undefined { return groceryStores.find((s) => s.id === id); }
export function getProduct(idOrSlug: string): MarketplaceProduct | undefined {
  return marketplaceProducts.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
}
export function productsByCategory(category: string): MarketplaceProduct[] {
  return marketplaceProducts.filter((p) => p.category.toLowerCase() === category.toLowerCase());
}
export function productCategories(): string[] {
  return [...new Set(marketplaceProducts.map((p) => p.category))];
}
export function getOffering(id: string): { id: string; name: string; pricePaise: number; service: 'tourism' | 'experience' | 'package'; destinationId: string } | undefined {
  const p = tourPackages.find((x) => x.id === id);
  if (p) return { id: p.id, name: p.name, pricePaise: p.pricePaise, service: 'package', destinationId: p.destinationId };
  const e = experiences.find((x) => x.id === id);
  if (e) return { id: e.id, name: e.name, pricePaise: e.pricePaise, service: 'experience', destinationId: e.destinationId };
  const a = attractions.find((x) => x.id === id);
  if (a) return { id: a.id, name: a.name, pricePaise: 0, service: 'tourism', destinationId: a.destinationId };
  return undefined;
}

export function attractionsFor(destinationId: string): Attraction[] {
  return attractions.filter((a) => a.destinationId === destinationId);
}
export function propertiesFor(destinationId: string): Property[] { return properties.filter((p) => p.destinationId === destinationId); }
export function restaurantsFor(destinationId: string): Restaurant[] { return restaurants.filter((r) => r.destinationId === destinationId); }
export function storesFor(destinationId: string): GroceryStore[] { return groceryStores.filter((s) => s.destinationId === destinationId); }
export function packagesFor(destinationId: string): TourPackage[] { return tourPackages.filter((p) => p.destinationId === destinationId); }
export function experiencesFor(destinationId: string): Experience[] { return experiences.filter((e) => e.destinationId === destinationId); }

/** Universal search across every catalogue entity. Pure, deterministic, no network. */
export function searchCatalog(query: string, limit = 30): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  const add = (hit: SearchHit) => hits.push(hit);
  for (const d of destinations) if (`${d.name} ${d.region} ${d.description}`.toLowerCase().includes(q)) {
    add({ id: d.id, kind: 'destination', title: d.name, subtitle: `${d.region} · ${d.coordinateAccuracy === 'approximate' ? 'approx. coordinates' : `${d.elevationM ?? '—'} m`}`, service: null, destinationId: d.id, href: `/destinations/${d.slug}` });
  }
  for (const a of attractions) if (`${a.name} ${a.category}`.toLowerCase().includes(q)) {
    add({ id: a.id, kind: 'attraction', title: a.name, subtitle: `${a.category} · ${destinations.find((d) => d.id === a.destinationId)?.name ?? ''}`, service: 'tourism', destinationId: a.destinationId, href: `/tourism?attraction=${a.id}` });
  }
  for (const p of properties) if (`${p.name} ${p.propertyType} ${p.amenities.join(' ')}`.toLowerCase().includes(q)) {
    add({ id: p.id, kind: 'property', title: p.name, subtitle: `${p.propertyType} · demo listing`, service: p.service, destinationId: p.destinationId, href: `/hotels/${p.id}` });
  }
  for (const r of restaurants) if (`${r.name} ${r.cuisines.join(' ')}`.toLowerCase().includes(q)) {
    add({ id: r.id, kind: 'restaurant', title: r.name, subtitle: `${r.cuisines.join(', ')} · demo listing`, service: 'food', destinationId: r.destinationId, href: `/food/${r.id}` });
  }
  for (const r of restaurants) for (const m of r.menu) if (m.name.toLowerCase().includes(q)) {
    add({ id: m.id, kind: 'food', title: m.name, subtitle: `at ${r.name} · demo menu`, service: 'food', destinationId: r.destinationId, href: `/food/${r.id}` });
  }
  for (const s of groceryStores) for (const p of s.products) if (p.name.toLowerCase().includes(q)) {
    add({ id: p.id, kind: 'grocery', title: p.name, subtitle: `${s.name} · ${p.stock > 0 ? `${p.stock} in stock` : 'out of stock'}`, service: 'grocery', destinationId: s.destinationId, href: `/groceries/${s.id}` });
  }
  for (const r of sharedTaxiRoutes) {
    const from = places.find((p) => p.id === r.fromId)?.name ?? ''; const to = places.find((p) => p.id === r.toId)?.name ?? '';
    if (`${from} ${to} shared taxi`.toLowerCase().includes(q)) add({ id: r.id, kind: 'taxi_route', title: `${from} → ${to}`, subtitle: `${r.stand} · operator-defined fare`, service: 'shared_taxi', destinationId: null, href: `/cabs?shared=${r.id}` });
  }
  for (const p of tourPackages) if (p.name.toLowerCase().includes(q)) add({ id: p.id, kind: 'package', title: p.name, subtitle: `${p.durationHours} h · demo package`, service: 'package', destinationId: p.destinationId, href: `/packages?offering=${p.id}` });
  for (const e of experiences) if (e.name.toLowerCase().includes(q)) add({ id: e.id, kind: 'experience', title: e.name, subtitle: `${e.durationMinutes} min · demo experience`, service: 'experience', destinationId: e.destinationId, href: `/experiences?offering=${e.id}` });
  for (const p of marketplaceProducts) if (`${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(q)) {
    const v = p.variants.find((x) => x.stock > 0) ?? p.variants[0];
    add({ id: p.id, kind: 'product', title: p.name, subtitle: `${p.brand} · ${v ? `${v.stock > 0 ? 'in stock' : 'last units/out of stock'}` : ''} · demo listing`, service: 'marketplace', destinationId: null, href: `/products/${p.slug}` });
  }
  return hits.slice(0, limit);
}

/** Connected recommendations: only records with seeded inventory are marked available. */
export function recommendationsForDestination(destinationId: string) {
  return {
    properties: propertiesFor(destinationId).map((p) => ({ id: p.id, title: p.name, service: p.service, available: p.rooms.some((r) => r.totalRooms > 0), href: `/hotels/${p.id}` })),
    restaurants: restaurantsFor(destinationId).map((r) => ({ id: r.id, title: r.name, service: 'food' as const, available: r.menu.some((m) => m.available), href: `/food/${r.id}` })),
    attractions: attractionsFor(destinationId).map((a) => ({ id: a.id, title: a.name, service: 'tourism' as const, available: true, href: `/tourism?attraction=${a.id}` })),
    packages: packagesFor(destinationId).map((p) => ({ id: p.id, title: p.name, service: 'package' as const, available: true, href: `/packages?offering=${p.id}` })),
    experiences: experiencesFor(destinationId).map((e) => ({ id: e.id, title: e.name, service: 'experience' as const, available: true, href: `/experiences?offering=${e.id}` })),
    groceries: storesFor(destinationId).map((s) => ({ id: s.id, title: s.name, service: 'grocery' as const, available: s.products.some((p) => p.stock > 0), href: `/groceries/${s.id}` })),
    taxiRoutes: sharedTaxiRoutes.filter((r) => r.toId === `plc_${slugify(destinations.find((d) => d.id === destinationId)?.name ?? '')}` || r.fromId === `plc_${slugify(destinations.find((d) => d.id === destinationId)?.name ?? '')}`).map((r) => ({ id: r.id, title: `${places.find((p) => p.id === r.fromId)?.name} → ${places.find((p) => p.id === r.toId)?.name}`, service: 'shared_taxi' as const, available: r.seatsTotal > 0, href: `/cabs?shared=${r.id}` })),
  };
}

export const imageCredits = destinations.flatMap((d) => d.images.filter((i) => i.status === 'verified').map((i) => ({ place: d.name, ...i })));
