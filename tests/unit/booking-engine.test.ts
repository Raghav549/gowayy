import { describe, expect, it } from 'vitest';
import {
  canTransition, transitionBooking, isTerminal, canCancel, transitionOrderStatus, progressFor,
  BOOKING_TRANSITIONS, createJourney, updateJourney, attachService, journeyComponents,
  recommendationsFor, journeyNeedsRepetition, DEFAULT_DISPATCH_RULES, checkEligibility,
  rankDrivers, assignJob,
} from '@gowayy/booking-engine';
import type { Booking, BookingStatus, DispatchJob, DriverProfile, Journey, Order, ServiceKind } from '@gowayy/types';
import type { RecommendationItem } from '@gowayy/booking-engine';

const price = { lines: [], subtotalPaise: 10000, taxPaise: 500, commissionPaise: 1200, totalPaise: 10500, currency: 'INR' as const };
function booking(status: BookingStatus, overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'bkg_1', reference: 'GW-B1001', userId: 'usr_1', service: 'cab', status,
    journeyId: 'jrn_1', listingId: null, title: 'Airport → Darjeeling', details: {}, price,
    paymentId: null, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    statusHistory: [{ status, at: '2026-11-01T00:00:00.000Z', by: 'system' }], ...overrides,
  };
}
function order(service: 'food' | 'grocery', overrides: Partial<Order> = {}): Order {
  return {
    id: 'ord_1', reference: 'GW-O2001', userId: 'usr_1', service, status: 'created',
    journeyId: 'jrn_1', listingId: 'rst_1', items: [], price,
    deliveryAddress: 'Mall Road, Darjeeling', instructions: '', paymentId: null,
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...overrides,
  };
}
const driver = (overrides: Partial<DriverProfile> = {}): DriverProfile => ({
  id: 'drv_1', userId: 'usr_2', name: 'Ravi Thapa', phone: '9876543210', vehicleClass: 'hatchback',
  services: ['cab', 'food', 'grocery', 'parcel'], verification: 'verified', online: true,
  activeJobId: null, documents: {}, createdAt: '2026-11-01T00:00:00.000Z', ...overrides,
});
const job = (service: ServiceKind, overrides: Partial<DispatchJob> = {}): DispatchJob => ({
  id: 'job_1', service, bookingId: 'bkg_1', orderId: null, status: 'open', driverId: null,
  createdAt: '2026-11-01T00:00:00.000Z', ...overrides,
});

describe('server-authoritative booking state machine', () => {
  it('allows legal transitions and records an audit trail', () => {
    const r = transitionBooking(booking('requested'), 'confirmed', 'partner', 'Accepted by operator');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.booking.status).toBe('confirmed');
      expect(r.booking.statusHistory).toHaveLength(2);
      expect(r.booking.statusHistory[1].by).toBe('partner');
      expect(r.booking.statusHistory[1].note).toBe('Accepted by operator');
    }
  });

  it('rejects illegal transitions, same-state transitions and unauthorised actors', () => {
    expect(transitionBooking(booking('requested'), 'confirmed', 'customer').ok).toBe(false);
    expect(transitionBooking(booking('cancelled'), 'confirmed', 'system').ok).toBe(false);
    expect(transitionBooking(booking('completed'), 'completed', 'system').ok).toBe(false);
    expect(canTransition('draft', 'completed')).toBe(false);
    expect(canTransition('assigned', 'in_progress')).toBe(true);
  });

  it('never transitions out of a terminal status', () => {
    for (const s of ['cancelled', 'refunded', 'failed', 'completed'] as BookingStatus[]) {
      expect(isTerminal(s)).toBe(true);
      if (s !== 'completed') expect(BOOKING_TRANSITIONS[s]).toHaveLength(0);
    }
    expect(canCancel(booking('in_progress'))).toBe(false);
    expect(canCancel(booking('requested'))).toBe(true);
    expect(canCancel(booking('cancelled'))).toBe(false);
  });

  it('enforces order status graph and progress', () => {
    expect(transitionOrderStatus('created', 'accepted')).toBe(true);
    expect(transitionOrderStatus('created', 'delivered')).toBe(false);
    expect(transitionOrderStatus('delivered', 'accepted')).toBe(false);
    expect(progressFor('draft')).toBe(0);
    expect(progressFor('completed')).toBe(100);
  });
});

describe('connected journey engine', () => {
  it('creates and patches context without losing earlier fields', () => {
    const j = createJourney('usr_1', { destinationId: 'dst_darjeeling', travellers: 2 }, 'Darjeeling');
    expect(j.title).toBe('My Darjeeling trip');
    expect(j.travellers).toBe(2);
    const patched = updateJourney(j, { startDate: '2026-12-01', travellers: 3 });
    expect(patched.destinationId).toBe('dst_darjeeling');
    expect(patched.startDate).toBe('2026-12-01');
    expect(patched.travellers).toBe(3);
    const attached = attachService(patched, 'bkg_1');
    expect(attached.serviceIds).toEqual(['bkg_1']);
    expect(attachService(attached, 'bkg_1').serviceIds).toHaveLength(1);
    expect(journeyNeedsRepetition(attached)).toBe(true);
  });

  it('builds the trip dashboard from real bookings AND real orders', () => {
    const j: Journey = createJourney('usr_1', { destinationId: 'dst_darjeeling' }, 'Darjeeling');
    // Records are linked to the journey by journeyId, so fixtures must use the
    // id the engine actually generated rather than a hard-coded one.
    const components = journeyComponents(j, [
      booking('confirmed', { id: 'bkg_ride', service: 'cab', journeyId: j.id }),
      booking('cancelled', { id: 'bkg_cancelled', service: 'hotel', journeyId: j.id }),
    ], [order('food', { id: 'ord_food', journeyId: j.id })]);
    const byService = Object.fromEntries(components.map((c) => [c.service, c]));
    expect(byService.cab.state).toBe('booked');
    expect(byService.cab.bookingId).toBe('bkg_ride');
    expect(byService.food.state).toBe('pending');
    expect(byService.food.bookingId).toBe('ord_food');
    expect(byService.hotel.state).toBe('not_booked');
    expect(byService.grocery.state).toBe('not_booked');
    expect(components).toHaveLength(10);
  });

  it('filters recommendations by active destination only', () => {
    const j = createJourney('usr_1', { destinationId: 'dst_darjeeling' });
    const items: RecommendationItem[] = [
      { id: '1', service: 'hotel', title: 'A', destinationId: 'dst_darjeeling', available: true, availabilitySource: 'seeded-inventory', href: '/hotels/1' },
      { id: '2', service: 'food', title: 'B', destinationId: 'dst_kalimpong', available: true, availabilitySource: 'seeded-inventory', href: '/food/2' },
    ];
    expect(recommendationsFor(j, items).map((r) => r.id)).toEqual(['1']);
    expect(recommendationsFor(createJourney('usr_1', {}), items)).toEqual([]);
  });
});

describe('dispatch rules — no incompatible simultaneous jobs', () => {
  const activePassenger = [job('cab', { id: 'job_active', status: 'accepted' })];

  it('blocks a food delivery while a passenger is in the vehicle', () => {
    const r = checkEligibility(driver(), job('food', { id: 'job_food' }), activePassenger, DEFAULT_DISPATCH_RULES);
    expect(r.eligible).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/passenger|active job/i);
  });

  it('blocks a passenger ride while a delivery is active', () => {
    const r = checkEligibility(driver(), job('cab', { id: 'job_cab' }), [job('food', { status: 'accepted' })], DEFAULT_DISPATCH_RULES);
    expect(r.eligible).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/delivery/i);
  });

  it('rejects offline, unverified, ineligible vehicles and unenabled services', () => {
    expect(checkEligibility(driver({ online: false }), job('cab'), [], DEFAULT_DISPATCH_RULES).eligible).toBe(false);
    expect(checkEligibility(driver({ verification: 'pending' }), job('cab'), [], DEFAULT_DISPATCH_RULES).eligible).toBe(false);
    expect(checkEligibility(driver({ vehicleClass: 'premium' }), job('food'), [], DEFAULT_DISPATCH_RULES).eligible).toBe(false);
    expect(checkEligibility(driver({ services: ['cab'] }), job('food'), [], DEFAULT_DISPATCH_RULES).eligible).toBe(false);
    expect(checkEligibility(driver(), job('cab'), [], DEFAULT_DISPATCH_RULES).eligible).toBe(true);
  });

  it('ranks eligible drivers by distance and excludes far drivers', () => {
    const pickup = { lat: 27.036, lng: 88.2627 };
    const near = driver({ id: 'drv_near' });
    const far = driver({ id: 'drv_far' });
    const positions = {
      drv_near: { lat: 27.04, lng: 88.27 },   // ~0.9 km
      drv_far: { lat: 27.09, lng: 88.34 },   // ~9.7 km away, inside the 12 km radius
    };
    const beyondRadius = { ...positions, drv_far: { lat: 26.7, lng: 88.4 } }; // ~38 km

    // The default rule excludes drivers beyond maxPickupDistanceKm (12 km).
    const filtered = rankDrivers([far, near], job('cab'), {}, pickup, beyondRadius, DEFAULT_DISPATCH_RULES);
    expect(filtered.map((r) => r.driver.id)).toEqual(['drv_near']);
    expect(rankDrivers([far, near], job('cab'), {}, pickup, beyondRadius,
      { ...DEFAULT_DISPATCH_RULES, maxPickupDistanceKm: 100 }).map((r) => r.driver.id)).toEqual(['drv_near', 'drv_far']);

    const ranked = rankDrivers([far, near], job('cab'), {}, pickup, positions, DEFAULT_DISPATCH_RULES);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].driver.id).toBe('drv_near');
    expect(ranked[0].distanceKm).toBeLessThan(ranked[1].distanceKm);
    expect(assignJob([far, near], job('cab'), {}, pickup, positions, DEFAULT_DISPATCH_RULES)).toEqual({ driverId: 'drv_near' });
    expect(assignJob([], job('cab'), {}, pickup, {}, DEFAULT_DISPATCH_RULES)).toHaveProperty('error');
    expect(assignJob([far, near], job('cab'), {}, pickup, beyondRadius, DEFAULT_DISPATCH_RULES)).toEqual({ driverId: 'drv_near' });
  });
});
