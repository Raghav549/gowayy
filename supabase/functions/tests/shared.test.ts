/** Runtime tests for Edge Function shared logic (no network or secrets required). */
import { camelize, bookingPayload, orderPayload, journeyShape, driverShape, jobShape, vehicleShape } from '../_shared/normalize.ts';
import { parse, registerSchema, loginSchema, otpSchema } from '../_shared/validation.ts';
import { HttpError } from '../_shared/config.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
function equal(actual: unknown, expected: unknown, message: string): void {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message}: expected ${b}, got ${a}`);
}

Deno.test('camelize converts nested PostgreSQL rows recursively', () => {
  const input = { id: '1', first_name: 'Aarav', nested_obj: { created_at: 'x', deep_list: [{ total_paise: 100 }] }, list: [{ user_id: 'u' }] };
  const out = camelize(input) as Record<string, unknown>;
  equal(out.firstName, 'Aarav', 'top-level key');
  equal((out.nestedObj as Record<string, unknown>).createdAt, 'x', 'nested key');
  equal(((out.nestedObj as Record<string, unknown>).deepList as Array<Record<string, unknown>>)[0].totalPaise, 100, 'nested array');
  equal((out.list as Array<Record<string, unknown>>)[0].userId, 'u', 'array item');
});

Deno.test('bookingPayload maps the shared client vocabulary to SQL RPC arguments', () => {
  const cab = bookingPayload('cab', {
    pickupId: 'pl_bagdogra', dropoffId: 'pl_darjeeling', vehicleClassId: 'veh_sedan',
    passengers: 3, scheduledAt: '2026-11-10T09:00', tripType: 'round_trip', journeyId: 'jrn_1',
  });
  equal(cab.fromPlaceId, 'pl_bagdogra', 'from');
  equal(cab.toPlaceId, 'pl_darjeeling', 'to');
  equal(cab.vehicleId, 'veh_sedan', 'vehicle');
  equal(cab.passengers, 3, 'passengers');
  equal(cab.scheduledFor, '2026-11-10T09:00', 'schedule');
  const stay = bookingPayload('hotel', { propertyId: 'prop_1', roomId: 'room_1', checkIn: '2026-11-10', checkOut: '2026-11-12', adults: 2, children: 1, rooms: 1, guestName: 'Aarav' });
  equal((stay.guestDetails as Record<string, unknown>).name, 'Aarav', 'guest name');
  equal(stay.checkIn, '2026-11-10', 'check-in');
  const tourism = bookingPayload('tourism', { offeringId: 'att_1', guests: 4, date: '2026-11-11' });
  equal(tourism.travellers, 4, 'travellers');
  equal(tourism.visitDate, '2026-11-11', 'visit date');
});

Deno.test('orderPayload maps listings and cart items independently for food and grocery', () => {
  const food = orderPayload('food', { listingId: 'rest_1', items: [{ id: 'mi_1', quantity: 2, options: ['extra chilli'] }], address: 'Darjeeling Mall', instructions: 'Ring the bell', substitution: 'ask' });
  equal(food.restaurantId, 'rest_1', 'restaurant');
  equal((food.items as Array<Record<string, unknown>>)[0].productId, 'mi_1', 'product id');
  equal(food.deliveryAddress, 'Darjeeling Mall', 'address');
  const grocery = orderPayload('grocery', { listingId: 'store_1', items: [{ id: 'gp_1', quantity: 3 }], address: 'Hill Cart Road' });
  equal(grocery.storeId, 'store_1', 'store');
  assert(!('restaurantId' in grocery), 'grocery must not use restaurantId');
});

Deno.test('read-model shape helpers preserve journey context and normalise partner rows', () => {
  const j = journeyShape({ id: 'j1', user_id: 'u1', title: 'Darjeeling', destination_id: 'dst_1', travellers: 2, service_ids: ['cab'], created_at: 'a', updated_at: 'b' });
  equal(j.destinationId, 'dst_1', 'destination');
  equal(j.serviceIds, ['cab'], 'services');
  equal(j.travellers, 2, 'travellers');
  assert(!('userId' in j) || j.userId === 'u1', 'user id');
  const d = driverShape({ id: 'd1', user_id: 'u1', email: 'driver@example.com', phone: '9000000000', verification: 'pending', online: false, active_task_id: null, services: ['cab'], created_at: 'a' });
  equal(d?.verification, 'pending', 'verification');
  equal(d?.online, false, 'online');
  const job = jobShape({ id: 'j1', type: 'food_delivery', service: 'food', title: 'Delivery', reference: 'ORD1', amount_paise: 100 });
  equal(job.orderId, 'j1', 'order reference');
  equal(job.bookingId, null, 'booking reference');
  const v = vehicleShape({ id: 'v1', name: 'Sedan', seats: 4, base_fare_paise: 5000, per_km_paise: 1200, per_min_paise: 200, min_fare_paise: 8000, tags: ['', 'Comfortable'] }) as Record<string, unknown>;
  equal(v.baseFarePaise, 5000, 'base fare');
  equal(v.perKmPaise, 1200, 'per km');
});

Deno.test('Zod validation rejects bad registration and accepts a strong one', () => {
  let caught: unknown = null;
  try { parse(registerSchema, { firstName: 'Aarav', lastName: 'Sharma', email: 'not-an-email', password: 'StrongPass123', confirmPassword: 'StrongPass123' }); }
  catch (e) { caught = e; }
  assert(caught instanceof HttpError, 'invalid email must raise HttpError');
  equal((caught as HttpError).status, 422, 'status');
  equal((caught as HttpError).code, 'VALIDATION_FAILED', 'code');
  const ok = parse(registerSchema, { firstName: 'Aarav', lastName: 'Sharma', email: 'Aarav@Example.com ', password: 'StrongPass123', confirmPassword: 'StrongPass123' });
  equal(ok.email, 'aarav@example.com', 'email is normalised');
  equal(parse(loginSchema, { email: 'a@b.co', password: 'x' }).password, 'x', 'login');
  caught = null;
  try { parse(otpSchema, { registrationId: 'reg_12345678', code: '12ab56' }); } catch (e) { caught = e; }
  assert(caught instanceof HttpError, 'non-numeric OTP must be rejected');
});
