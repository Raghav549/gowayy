/** Real host-owned experiences/packages and server-authoritative slot capacity. */
import { priceTourism } from '@gowayy/pricing-engine';
import { nowIso } from '@gowayy/shared-utils';

const ACTIVE_CAPACITY_STATUSES = new Set(['requested', 'confirmed', 'completed']);

export function allTours(db) {
  return Object.entries(db.tours ?? {}).flatMap(([ownerId, tours]) =>
    (Array.isArray(tours) ? tours : []).map((tour) => ({ ...tour, userId: tour.userId ?? ownerId })));
}

export function verifiedExperienceHost(db, userId) {
  const user = db.users.find((u) => u.id === userId && !u.deletedAt);
  if (!user) return false;
  const claim = (db.partners ?? []).find((item) => item.userId === userId && item.role === 'tour_operator');
  if (!claim) return false;
  if (user.partnerApproval) return user.partnerApproval === 'verified';
  // Backward compatibility for explicitly labelled development claims only.
  return claim.state === 'verified' || (!claim.state && claim.demo === true);
}

export function publicOffering(db, offeringId) {
  const offering = allTours(db).find((tour) => tour.id === offeringId);
  if (!offering || offering.active === false || !verifiedExperienceHost(db, offering.userId)) return null;
  return offering;
}

export function offeringView(db, tour) {
  const host = db.users.find((u) => u.id === tour.userId);
  const profile = db.partnerProfiles?.[tour.userId];
  const personalName = `${host?.firstName ?? ''} ${host?.lastName ?? ''}`.trim();
  const hostName = String(profile?.businessName ?? '').trim() || personalName || null;
  const kind = tour.kind === 'package' ? 'package' : 'experience';
  return {
    id: tour.id, kind, name: tour.name, description: tour.description ?? '',
    destinationId: tour.destinationId,
    destinationName: null, // Filled by the catalogue hub without inventing missing content.
    pricePaise: Number(tour.pricePaise), durationHours: Number(tour.durationHours),
    durationMinutes: Math.round(Number(tour.durationHours) * 60), capacity: Number(tour.capacity),
    meetingPoint: tour.meetingPoint ?? '', requirements: tour.requirements ?? '',
    host: { id: tour.userId, name: hostName }, active: tour.active !== false, createdAt: tour.createdAt,
  };
}

export function slotBooked(db, slotId) {
  return db.bookings
    .filter((booking) => (booking.slotId ?? booking.details?.slotId) === slotId && ACTIVE_CAPACITY_STATUSES.has(booking.status))
    .reduce((sum, booking) => sum + Number(booking.guests ?? booking.details?.guests ?? 0), 0);
}

export function slotView(db, slot, partner = false) {
  const booked = slotBooked(db, slot.id);
  return {
    id: slot.id, offeringId: slot.offeringId, startsAt: slot.startsAt, endsAt: slot.endsAt,
    capacity: Number(slot.capacity), booked, available: Math.max(0, Number(slot.capacity) - booked),
    ...(partner ? { active: slot.active !== false } : {}),
  };
}

export function experienceQuote(db, slotId, guests, bad) {
  if (!Number.isInteger(guests) || guests < 1 || guests > 20) bad('INVALID_GUEST_COUNT', 'Choose between 1 and 20 guests', 422);
  const slot = (db.experienceSlots ?? []).find((item) => item.id === slotId && item.active !== false && item.startsAt > nowIso());
  if (!slot) bad('SLOT_NOT_FOUND', 'This time slot is no longer available', 404);
  const offering = publicOffering(db, slot.offeringId);
  if (!offering) bad('OFFERING_NOT_FOUND', 'This offering is not available', 404);
  const booked = slotBooked(db, slot.id);
  if (booked + guests > Number(slot.capacity)) {
    bad('SLOT_UNAVAILABLE', `Only ${Math.max(0, Number(slot.capacity) - booked)} place(s) remain`, 409);
  }
  const price = priceTourism({ basePaise: Number(offering.pricePaise), guests, service: offering.kind === 'package' ? 'package' : 'experience' });
  price.lines[0].label = `${guests} guest(s) · ${offering.name}`;
  return {
    offering: offeringView(db, offering), slot: slotView(db, slot), guests,
    service: offering.kind === 'package' ? 'package' : 'experience', price,
  };
}

export function kolkataDate(value) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value));
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
