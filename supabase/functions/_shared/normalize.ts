/** Maps PostgreSQL rows to the camelCase shapes shared by web + mobile (packages/types). */

export function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase())] = camelize(v);
    }
    return out;
  }
  return value;
}

type Payload = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/** The customer apps submit one payload vocabulary; map it to the SQL RPC arguments. */
export function bookingPayload(service: string, p: Payload): Payload {
  switch (service) {
    case 'cab':
      return {
        fromPlaceId: str(p.pickupId ?? p.fromPlaceId), toPlaceId: str(p.dropoffId ?? p.toPlaceId),
        vehicleId: str(p.vehicleClassId ?? p.vehicleId), tripType: str(p.tripType) || 'one_way',
        scheduledFor: p.scheduledAt ?? p.scheduledFor ?? null, journeyId: p.journeyId ?? null,
        passengers: num(p.passengers),
      };
    case 'shared_taxi':
      return { routeId: str(p.routeId), seats: num(p.seats) ?? 1, departureTime: str(p.departureTime), journeyId: p.journeyId ?? null };
    case 'hotel':
      return {
        propertyId: str(p.propertyId), roomId: str(p.roomId), checkIn: str(p.checkIn), checkOut: str(p.checkOut),
        adults: num(p.adults) ?? 1, children: num(p.children) ?? 0, rooms: num(p.rooms) ?? 1,
        guestDetails: { name: str(p.guestName), email: str(p.guestEmail) }, journeyId: p.journeyId ?? null,
      };
    case 'tourism':
    case 'experience':
    case 'package':
      return {
        offeringId: str(p.offeringId), service, travellers: num(p.guests) ?? num(p.travellers) ?? 1,
        visitDate: p.date ?? p.visitDate ?? null, journeyId: p.journeyId ?? null,
      };
    case 'parcel':
      return {
        fromPlaceId: str(p.pickupId ?? p.fromPlaceId), toPlaceId: str(p.dropoffId ?? p.toPlaceId),
        weightKg: num(p.weightKg) ?? 1,
        details: { description: str(p.description), recipientPhone: str(p.recipientPhone) },
        journeyId: p.journeyId ?? null,
      };
    default:
      return p;
  }
}

export function orderPayload(service: string, p: Payload): Payload {
  const items = Array.isArray(p.items) ? (p.items as Payload[]).map((i) => ({
    productId: str(i.id ?? i.productId),
    quantity: num(i.quantity) ?? 1,
    options: Array.isArray(i.options) ? i.options : [],
  })) : [];
  return {
    ...(service === 'food' ? { restaurantId: str(p.listingId ?? p.restaurantId) } : { storeId: str(p.listingId ?? p.storeId) }),
    items,
    deliveryAddress: str(p.address ?? p.deliveryAddress),
    instructions: str(p.instructions), coupon: p.coupon ?? null,
    slot: p.slot ?? null, substitution: str(p.substitution) || 'ask',
    journeyId: p.journeyId ?? null,
  };
}

export function vehicleShape(v: unknown): unknown {
  if (!v || typeof v !== 'object') return null;
  const x = v as Record<string, unknown>;
  return {
    id: x.id, name: x.name, category: x.luggage, seats: x.seats,
    baseFarePaise: x.base_fare_paise, perKmPaise: x.per_km_paise,
    perMinutePaise: x.per_min_paise, minimumFarePaise: x.min_fare_paise,
    description: Array.isArray(x.tags) ? x.tags[1] : '',
  };
}

export interface JourneyRow { [key: string]: unknown }
export function journeyShape(j: JourneyRow): Record<string, unknown> {
  const c = camelize(j) as Record<string, unknown>;
  return {
    id: c.id, userId: c.userId, title: c.title, destinationId: c.destinationId ?? null,
    pickup: c.pickup ?? null, dropoff: c.dropoff ?? null,
    startDate: c.startDate ?? null, endDate: c.endDate ?? null,
    travellers: c.travellers ?? 1, preferences: c.preferences ?? [],
    serviceIds: Array.isArray(c.serviceIds) ? c.serviceIds : [],
    createdAt: c.createdAt, updatedAt: c.updatedAt,
  };
}

export function driverShape(d: unknown): Record<string, unknown> | null {
  if (!d || typeof d !== 'object') return null;
  const x = camelize(d) as Record<string, unknown>;
  return {
    id: x.id, userId: x.userId, name: typeof x.email === 'string' ? x.email.split('@')[0] : 'Driver',
    phone: x.phone, vehicleClass: x.activeTask ?? 'hatchback', services: x.services ?? [],
    verification: x.verification, online: x.online, activeJobId: x.activeTaskId ?? null,
    documents: x.documents ?? {}, createdAt: x.createdAt,
  };
}

export function jobShape(j: unknown): Record<string, unknown> {
  const x = camelize(j) as Record<string, unknown>;
  return {
    id: x.id, service: x.service, bookingId: x.type === 'passenger_ride' || x.service === 'parcel' ? x.id : null,
    orderId: x.type === 'food_delivery' || x.type === 'grocery_delivery' ? x.id : null,
    status: 'open', driverId: null, createdAt: x.createdAt ?? new Date().toISOString(),
    type: x.type, title: x.title, reference: x.reference, amountPaise: x.amountPaise,
  };
}
