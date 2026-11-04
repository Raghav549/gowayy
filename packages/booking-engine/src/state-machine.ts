import type { Booking, BookingStatus, ServiceKind } from '@gowayy/types';
import { nowIso } from '@gowayy/shared-utils';

/** Server-authoritative transitions. The UI calls the API; it never mutates status locally. */
export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  draft: ['requested', 'cancelled'],
  requested: ['awaiting_payment', 'confirmed', 'assigned', 'cancelled', 'failed'],
  awaiting_payment: ['confirmed', 'cancelled', 'failed'],
  confirmed: ['assigned', 'in_progress', 'cancelled', 'refunded'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['refunded'],
  cancelled: [],
  refunded: [],
  failed: [],
};

export const TERMINAL_STATUSES: readonly BookingStatus[] = ['completed', 'cancelled', 'refunded', 'failed'];

/** Which actor may perform which target status. */
const ACTOR_RULES: Record<BookingStatus, readonly ('customer' | 'partner' | 'system')[]> = {
  draft: ['system'],
  requested: ['system'],
  awaiting_payment: ['system'],
  confirmed: ['partner', 'system'],
  assigned: ['partner', 'system'],
  in_progress: ['partner', 'system'],
  completed: ['partner', 'system'],
  cancelled: ['customer', 'partner', 'system'],
  refunded: ['system'],
  failed: ['system'],
};

export type Actor = 'customer' | 'partner' | 'system';

export type TransitionResult = { ok: true; booking: Booking } | { ok: false; error: string };

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}

export function transitionBooking(booking: Booking, to: BookingStatus, actor: Actor, note?: string): TransitionResult {
  if (booking.status === to) return { ok: false, error: `Booking is already ${to}` };
  if (!canTransition(booking.status, to)) return { ok: false, error: `Illegal status change ${booking.status} → ${to}` };
  if (!ACTOR_RULES[to].includes(actor)) return { ok: false, error: `${actor} cannot set status ${to}` };
  const at = nowIso();
  return {
    ok: true,
    booking: {
      ...booking, status: to, updatedAt: at,
      statusHistory: [...booking.statusHistory, { status: to, at, by: actor, ...(note ? { note } : {}) }],
    },
  };
}

export function isTerminal(status: BookingStatus): boolean { return TERMINAL_STATUSES.includes(status); }
export function canCancel(booking: Booking): boolean {
  return !isTerminal(booking.status) && canTransition(booking.status, 'cancelled') && booking.status !== 'in_progress';
}

export const STATUS_LABELS: Record<BookingStatus, string> = {
  draft: 'Draft', requested: 'Request sent', awaiting_payment: 'Awaiting payment',
  confirmed: 'Confirmed', assigned: 'Partner assigned', in_progress: 'In progress',
  completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded', failed: 'Failed',
};

export const ORDER_TRANSITIONS: Record<string, readonly string[]> = {
  created: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['packed', 'out_for_delivery', 'cancelled'],
  packed: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['refunded'],
  cancelled: [], refunded: [],
};

export function transitionOrderStatus(from: string, to: string): boolean {
  return (ORDER_TRANSITIONS[from] ?? []).includes(to);
}

export function progressFor(status: BookingStatus): number {
  const order: BookingStatus[] = ['draft', 'requested', 'awaiting_payment', 'confirmed', 'assigned', 'in_progress', 'completed'];
  const i = order.indexOf(status);
  return i < 0 ? 100 : Math.round((i / (order.length - 1)) * 100);
}

export const SERVICE_LABELS: Record<ServiceKind, string> = {
  cab: 'Cab', shared_taxi: 'Shared taxi', food: 'Food', grocery: 'Groceries',
  hotel: 'Hotel', homestay: 'Homestay', tourism: 'Tourism', experience: 'Experience',
  package: 'Package', parcel: 'Parcel', marketplace: 'Marketplace',
};
