import type { Booking, Journey, Order, Place, ServiceKind } from '@gowayy/types';
import { SERVICE_KINDS } from '@gowayy/types';
import { nowIso } from '@gowayy/shared-utils';
import { STATUS_LABELS, SERVICE_LABELS } from './state-machine.ts';

export interface JourneyDraft {
  destinationId?: string | null;
  pickup?: Place | null;
  dropoff?: Place | null;
  startDate?: string | null;
  endDate?: string | null;
  travellers?: number;
  preferences?: string[];
  title?: string;
}

export function createJourney(userId: string, draft: JourneyDraft, destinationName?: string): Journey {
  const at = nowIso();
  return {
    id: `jrn_${Math.random().toString(36).slice(2, 11)}`,
    userId,
    title: draft.title ?? (destinationName ? `My ${destinationName} trip` : 'My journey'),
    destinationId: draft.destinationId ?? null,
    pickup: draft.pickup ?? null,
    dropoff: draft.dropoff ?? null,
    startDate: draft.startDate ?? null,
    endDate: draft.endDate ?? null,
    travellers: draft.travellers ?? 1,
    preferences: draft.preferences ?? [],
    serviceIds: [],
    createdAt: at, updatedAt: at,
  };
}

export function updateJourney(journey: Journey, patch: Partial<JourneyDraft>): Journey {
  const next: Journey = { ...journey, updatedAt: nowIso() };
  if (patch.destinationId !== undefined) next.destinationId = patch.destinationId;
  if (patch.pickup !== undefined) next.pickup = patch.pickup;
  if (patch.dropoff !== undefined) next.dropoff = patch.dropoff;
  if (patch.startDate !== undefined) next.startDate = patch.startDate;
  if (patch.endDate !== undefined) next.endDate = patch.endDate;
  if (patch.travellers !== undefined) next.travellers = patch.travellers;
  if (patch.preferences !== undefined) next.preferences = patch.preferences;
  if (patch.title !== undefined) next.title = patch.title;
  return next;
}

export function attachService(journey: Journey, reference: string): Journey {
  if (journey.serviceIds.includes(reference)) return journey;
  return { ...journey, serviceIds: [...journey.serviceIds, reference], updatedAt: nowIso() };
}

export interface JourneyComponent {
  service: ServiceKind;
  label: string;
  state: 'booked' | 'pending' | 'not_booked' | 'available';
  bookingId: string | null;
  statusLabel: string | null;
}

const ORDER_STATUS_LABELS: Record<Order['status'], string> = {
  created: 'Order placed', accepted: 'Accepted', preparing: 'Preparing', packed: 'Packed',
  out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded',
};

/**
 * The "MY DARJEELING TRIP" dashboard model: one row per service, built only
 * from real persisted bookings and orders. Food/grocery live in `orders`, so
 * both collections must be passed in or those services would always read
 * "not booked" even after a successful checkout.
 */
export function journeyComponents(journey: Journey, bookings: Booking[], orders: Order[] = []): JourneyComponent[] {
  const linkedBookings = bookings.filter((b) => b.journeyId === journey.id && b.status !== 'cancelled');
  const linkedOrders = orders.filter((o) => o.journeyId === journey.id && o.status !== 'cancelled');
  return SERVICE_KINDS.map((service) => {
    const booking = linkedBookings.find((b) => b.service === service);
    if (booking) {
      const pending = booking.status === 'requested' || booking.status === 'awaiting_payment';
      return {
        service, label: SERVICE_LABELS[service],
        state: pending ? 'pending' as const : 'booked' as const, bookingId: booking.id,
        statusLabel: STATUS_LABELS[booking.status],
      };
    }
    const order = linkedOrders.find((o) => o.service === service);
    if (order) {
      const pending = ['created', 'accepted', 'preparing', 'packed', 'out_for_delivery'].includes(order.status);
      return {
        service, label: SERVICE_LABELS[service],
        state: pending ? 'pending' as const : 'booked' as const, bookingId: order.id,
        statusLabel: ORDER_STATUS_LABELS[order.status],
      };
    }
    return { service, label: SERVICE_LABELS[service], state: 'not_booked' as const, bookingId: null, statusLabel: null };
  });
}

export interface RecommendationItem {
  id: string;
  service: ServiceKind;
  title: string;
  destinationId: string;
  available: boolean;
  /** Only true when backed by seeded inventory, never inferred. */
  availabilitySource: 'seeded-inventory' | 'none';
  href: string;
}

/** Connected recommendations filter purely by destination + seeded availability. */
export function recommendationsFor(journey: Journey, catalogue: RecommendationItem[]): RecommendationItem[] {
  if (!journey.destinationId) return [];
  return catalogue.filter((r) => r.destinationId === journey.destinationId);
}

export function journeyNeedsRepetition(journey: Journey): boolean {
  // Used by forms: prefill from context instead of asking for the same data again.
  return Boolean(journey.destinationId || journey.pickup || journey.dropoff || journey.startDate);
}
