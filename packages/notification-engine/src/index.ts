import type { Notification } from '@gowayy/types';
import { hashForDisplay, makeId, nowIso } from '@gowayy/shared-utils';

export type NotificationEvent =
  | { type: 'booking.created'; reference: string; service: string }
  | { type: 'booking.confirmed'; reference: string; service: string }
  | { type: 'booking.cancelled'; reference: string; service: string }
  | { type: 'driver.assigned'; reference: string; driverName: string; vehicle: string }
  | { type: 'hotel.confirmation'; reference: string; property: string }
  | { type: 'restaurant.accepted'; reference: string; restaurant: string }
  | { type: 'delivery.tracking'; reference: string; status: string }
  | { type: 'payment.captured'; reference: string; amount: string }
  | { type: 'payment.failed'; reference: string; reason: string }
  | { type: 'refund.issued'; reference: string; amount: string }
  | { type: 'partner.request'; reference: string; service: string };

export interface NotificationDraft { type: string; title: string; body: string; dedupeKey: string }

export function buildNotification(event: NotificationEvent): NotificationDraft {
  const key = `${event.type}:${'reference' in event ? event.reference : ''}`;
  switch (event.type) {
    case 'booking.created': return { type: event.type, title: 'Request received', body: `Your ${event.service} request ${event.reference} was received and is awaiting partner confirmation.`, dedupeKey: key };
    case 'booking.confirmed': return { type: event.type, title: 'Booking confirmed', body: `Your ${event.service} booking ${event.reference} was confirmed.`, dedupeKey: key };
    case 'booking.cancelled': return { type: event.type, title: 'Booking cancelled', body: `Your ${event.service} booking ${event.reference} was cancelled.`, dedupeKey: key };
    case 'driver.assigned': return { type: event.type, title: 'Driver on the way', body: `${event.driverName} (${event.vehicle}) is assigned to ${event.reference}.`, dedupeKey: key };
    case 'hotel.confirmation': return { type: event.type, title: 'Stay confirmed', body: `${event.property} confirmed reservation ${event.reference}.`, dedupeKey: key };
    case 'restaurant.accepted': return { type: event.type, title: 'Order accepted', body: `${event.restaurant} accepted order ${event.reference} and started preparation.`, dedupeKey: key };
    case 'delivery.tracking': return { type: event.type, title: 'Delivery update', body: `Order ${event.reference}: ${event.status}.`, dedupeKey: `${key}:${event.status}` };
    case 'payment.captured': return { type: event.type, title: 'Payment received', body: `Payment of ${event.amount} for ${event.reference} was captured in sandbox.`, dedupeKey: key };
    case 'payment.failed': return { type: event.type, title: 'Payment failed', body: `Payment for ${event.reference} failed: ${event.reason}.`, dedupeKey: key };
    case 'refund.issued': return { type: event.type, title: 'Refund issued', body: `Refund of ${event.amount} for ${event.reference} was recorded.`, dedupeKey: key };
    case 'partner.request': return { type: event.type, title: 'New partner request', body: `A new ${event.service} request ${event.reference} is available.`, dedupeKey: key };
  }
}

export function toNotification(userId: string, draft: NotificationDraft, channel: Notification['channel'] = 'in_app'): Notification {
  return {
    id: makeId('ntf'), userId, type: draft.type, title: draft.title, body: draft.body,
    channel, readAt: null, createdAt: nowIso(), dedupeKey: hashForDisplay(`${userId}:${draft.dedupeKey}`),
  };
}

/** Dedupe by key prevents duplicate push/in-app messages from replayed webhooks. */
export function deduplicate(existing: Notification[], incoming: Notification[]): Notification[] {
  const seen = new Set(existing.map((n) => n.dedupeKey));
  return incoming.filter((n) => { if (seen.has(n.dedupeKey)) return false; seen.add(n.dedupeKey); return true; });
}

export function shouldSendPush(notification: Notification): boolean {
  return ['driver.assigned', 'booking.confirmed', 'booking.cancelled', 'payment.failed', 'delivery.tracking'].includes(notification.type);
}
