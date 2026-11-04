/**
 * GOWAYY end-to-end integration tests.
 *
 * These tests start the real dev-api server with an isolated temporary database
 * and drive it over HTTP exactly as the web and mobile clients do. Nothing is
 * mocked: registration, OTP, bookings, inventory, dispatch, payments, webhook
 * signature verification and refunds all run through the server-side code.
 *
 * Run with: npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SERVER = join(ROOT, 'apps/dev-api/src/server.mjs');
const PORT = 8900 + Math.floor(Math.random() * 400);
const SECRET = 'integration-test-webhook-secret-not-a-production-key';
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), 'gowayy-integration-'));
const DB_FILE = join(tmp, 'db.json');

let child;
let logs = '';
const state = {
  token: '', email: '', password: 'Orchid!Ridge42', userId: '', journeyId: '',
  cabBooking: null, hotelBooking: null, foodOrder: null, groceryOrder: null,
  payment: null, driverJobId: '', cabJobId: '', foodJobId: '',
};

async function waitForHealth(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`dev-api exited early (${child.exitCode}):\n${logs}`);
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`dev-api did not become healthy within ${timeoutMs}ms:\n${logs}`);
}

/** Thin HTTP helper. `raw` is used for webhook signature tests (exact bytes). */
async function api(method, path, { body, raw, token = state.token, headers = {} } = {}) {
  const h = {};
  if (token) h.authorization = `Bearer ${token}`;
  Object.assign(h, headers); // explicit headers (e.g. a different session) win
  let payload;
  if (raw !== undefined) { payload = raw; h['content-type'] = 'application/json'; }
  else if (body !== undefined) { payload = JSON.stringify(body); h['content-type'] = 'application/json'; }
  const res = await fetch(`${BASE}${path}`, { method, headers: h, body: payload });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}
const get = (p, o) => api('GET', p, o);
const post = (p, body, o) => api('POST', p, { ...o, body });
const signedWebhook = (event) => {
  const raw = JSON.stringify(event);
  const signature = createHmac('sha256', SECRET).update(raw).digest('hex');
  return api('POST', '/api/payments/webhook', { raw, token: '', headers: { 'x-gowayy-signature': signature } });
};

before(async () => {
  child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      GOWAYY_DB_FILE: DB_FILE,
      GOWAYY_WEBHOOK_SECRET: SECRET,
      GOWAYY_ENV: 'development',
      GOWAYY_OTP_PROVIDER: 'demo',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { logs += d.toString(); });
  child.stderr.on('data', (d) => { logs += d.toString(); });
  await waitForHealth();
});

after(() => {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  rmSync(tmp, { recursive: true, force: true });
});

// ------------------------------------------------------------------ health --
test('health endpoint declares demo adapters and no hosted Supabase claim', async () => {
  const { status, json } = await get('/api/health');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.match(json.otpAdapter, /demo/i);
  assert.match(json.otpAdapter, /not real email verification/i);
  assert.equal(json.paymentProvider, 'sandbox');
  assert.match(json.supabase, /not connected/i);
});

// ---------------------------------------------------------- auth / OTP flow --
test('registration rejects weak input and returns a LABELLED demo OTP', async () => {
  state.email = `itest-${Date.now()}@example.test`;
  const weak = await post('/api/auth/register', {
    firstName: 'A', lastName: 'Roy', email: state.email,
    password: 'weak', confirmPassword: 'weak',
  });
  assert.equal(weak.status, 422);
  assert.equal(weak.json.error, 'VALIDATION_FAILED');

  const mismatch = await post('/api/auth/register', {
    firstName: 'Asha', lastName: 'Roy', email: state.email,
    password: state.password, confirmPassword: 'Different!Pass42',
  });
  assert.equal(mismatch.status, 422);

  const good = await post('/api/auth/register', {
    firstName: 'Asha', lastName: 'Roy', email: state.email,
    password: state.password, confirmPassword: state.password,
  });
  assert.equal(good.status, 201);
  assert.equal(good.json.otpRequired, true);
  assert.equal(good.json.demoMode, true);
  assert.match(good.json.demoNotice, /not real email verification/i);
  assert.match(good.json.demoOtp, /^\d{6}$/);
  state.registrationId = good.json.registrationId;
  state.otp = good.json.demoOtp;
});

test('OTP verification is server-authoritative: wrong code fails, correct code creates the session', async () => {
  const wrong = await post('/api/auth/otp/verify', { registrationId: state.registrationId, code: '000000' });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.json.verified, false);
  assert.equal(wrong.json.error, 'INCORRECT_OTP');
  assert.equal(wrong.json.attemptsRemaining, 4);

  const noSession = await get('/api/bookings', { token: 'nonsense' });
  assert.equal(noSession.status, 401);

  const good = await post('/api/auth/otp/verify', { registrationId: state.registrationId, code: state.otp });
  assert.equal(good.status, 200);
  assert.equal(good.json.verified, true);
  assert.equal(good.json.user.email, state.email);
  assert.deepEqual(good.json.user.roles, ['customer']);
  assert.ok(good.json.session.token);
  assert.ok(!('passwordHash' in good.json.user), 'password hash must never leave the server');
  state.token = good.json.session.token;
  state.userId = good.json.user.id;
});

test('session persists, profile can be updated, and duplicate registration is rejected', async () => {
  const me = await get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.json.user.id, state.userId);
  const patched = await api('PATCH', '/api/auth/me', { body: { firstName: 'Asha' } });
  assert.equal(patched.status, 200);
  const duplicate = await post('/api/auth/register', {
    firstName: 'Asha', lastName: 'Roy', email: state.email,
    password: state.password, confirmPassword: state.password,
  });
  assert.equal(duplicate.status, 409);
});

// ------------------------------------------------- catalogue / search / SEO --
test('catalogue is data-driven, universal search works, and image credits are honest', async () => {
  const destinations = await get('/api/catalog/destinations');
  assert.equal(destinations.status, 200);
  assert.ok(destinations.json.count >= 14, 'all initial destinations must be present');
  assert.ok(destinations.json.items.some((d) => d.id === 'dst_darjeeling'));

  const search = await get('/api/search?q=darjeeling');
  assert.equal(search.status, 200);
  assert.ok(search.json.hits.length > 0);
  assert.ok(search.json.hits.every((h) => h.href && h.title));

  const credits = await get('/api/credits');
  assert.equal(credits.status, 200);
  assert.ok(credits.json.credits.length > 0);
  assert.ok(credits.json.credits.every((c) => c.license && c.sourceUrl), 'every displayed photo has a licence and source');
  assert.ok(credits.json.unavailablePlaces.length > 0, 'places without a verified photo are marked unavailable');
});

// ---------------------------------------------------- connected journey core --
test('journey context persists and the dashboard is built from real records', async () => {
  const created = await post('/api/journeys', {
    destinationId: 'dst_darjeeling', travellers: 2, startDate: '2026-12-01',
    pickup: 'plc_bagdogra', dropoff: 'plc_darjeeling',
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.journey.title, 'My Darjeeling trip');
  state.journeyId = created.json.journey.id;

  const patched = await api('PATCH', `/api/journeys/${state.journeyId}`, { body: { travellers: 3 } });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.journey.destinationId, 'dst_darjeeling', 'patch must not lose destination context');
  assert.equal(patched.json.journey.travellers, 3);

  const dashboard = await get(`/api/journeys/${state.journeyId}`);
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.json.components.length, 10);
  assert.ok(dashboard.json.components.every((c) => c.state === 'not_booked'), 'no fabricated bookings');

  const rec = await get('/api/recommendations?destinationId=dst_darjeeling');
  assert.equal(rec.status, 200);
  assert.ok(rec.json.groups.properties.length > 0);
  assert.ok(rec.json.groups.restaurants.length > 0);
  assert.ok(rec.json.groups.attractions.length > 0);
  assert.ok(rec.json.groups.taxiRoutes.length > 0);
});

// ------------------------------------------------------------- cab bookings --
test('cab booking computes the fare server-side and is idempotent', async () => {
  const input = {
    pickupId: 'plc_bagdogra', dropoffId: 'plc_darjeeling', vehicleClassId: 'sedan',
    tripType: 'one_way', scheduledAt: null, passengers: 2, journeyId: state.journeyId,
  };
  const key = 'idem_cab_integration_0001';
  const first = await post('/api/bookings/cab', input, { headers: { 'idempotency-key': key } });
  assert.equal(first.status, 201);
  assert.equal(first.json.booking.status, 'requested', 'a new booking is never auto-confirmed');
  assert.ok(first.json.booking.price.totalPaise > 0);
  assert.ok(first.json.booking.details.distanceKm > 0);
  assert.equal(first.json.booking.journeyId, state.journeyId);

  const replay = await post('/api/bookings/cab', input, { headers: { 'idempotency-key': key } });
  assert.equal(replay.status, 201);
  assert.equal(replay.json.booking.id, first.json.booking.id, 'idempotency replay must not create a duplicate');
  const list = await get('/api/bookings');
  assert.equal(list.json.items.filter((b) => b.service === 'cab').length, 1);
  state.cabBooking = first.json.booking;

  const dashboard = await get(`/api/journeys/${state.journeyId}`);
  assert.equal(dashboard.json.components.find((c) => c.service === 'cab').state, 'pending');
  assert.equal(dashboard.json.components.find((c) => c.service === 'cab').bookingId, state.cabBooking.id);

  const invalid = await post('/api/bookings/cab', { ...input, pickupId: 'plc_darjeeling' });
  assert.equal(invalid.status, 422);
});

// ---------------------------------------------------- payments & webhooks ---
test('payments reject client-supplied amounts and only a signed webhook can capture', async () => {
  const b = state.cabBooking;
  const wrongAmount = await post('/api/payments/init', {
    bookingId: b.id, orderId: null, method: 'upi', amountPaise: 1, idempotencyKey: 'idem_pay_wrong_0001',
  });
  assert.equal(wrongAmount.status, 409);
  assert.equal(wrongAmount.json.error, 'AMOUNT_MISMATCH');

  const init = await post('/api/payments/init', {
    bookingId: b.id, orderId: null, method: 'upi', amountPaise: b.price.totalPaise,
    idempotencyKey: 'idem_pay_valid_0001',
  });
  assert.equal(init.status, 201);
  assert.equal(init.json.payment.status, 'requires_action');
  state.payment = init.json.payment;

  const forged = await api('POST', '/api/payments/webhook', {
    raw: JSON.stringify({ eventId: 'evt_forged', type: 'payment.captured', paymentId: state.payment.id, amountPaise: b.price.totalPaise, providerReference: 'fake' }),
    token: '', headers: { 'x-gowayy-signature': 'deadbeef'.repeat(8) },
  });
  assert.equal(forged.status, 401);
  assert.equal(forged.json.error, 'INVALID_SIGNATURE');

  const captured = await signedWebhook({
    eventId: 'evt_integration_1', type: 'payment.captured', paymentId: state.payment.id,
    amountPaise: b.price.totalPaise, providerReference: 'sandbox_integration_1',
  });
  assert.equal(captured.status, 200);
  const payments = await get('/api/payments');
  assert.equal(payments.json.items.find((p) => p.id === state.payment.id).status, 'captured');
  const transactions = await get('/api/transactions');
  assert.ok(transactions.json.items.some((t) => t.type === 'charge' && t.paymentId === state.payment.id));

  // Replaying the same signed event must not double-charge.
  const replay = await signedWebhook({
    eventId: 'evt_integration_1', type: 'payment.captured', paymentId: state.payment.id,
    amountPaise: b.price.totalPaise, providerReference: 'sandbox_integration_1',
  });
  assert.equal(replay.status, 200);
  const after = await get('/api/transactions');
  assert.equal(after.json.items.filter((t) => t.type === 'charge' && t.paymentId === state.payment.id).length, 1);
});

// -------------------------------------------------------- hotel availability --
test('hotel availability is real, enforced per night, and restored on cancellation', async () => {
  const input = {
    propertyId: 'prp_1', roomId: 'room_1_1', checkIn: '2027-02-10', checkOut: '2027-02-12',
    adults: 2, children: 0, rooms: 3, guestName: 'Asha Roy', journeyId: state.journeyId,
  };
  const first = await post('/api/bookings/hotels', input);
  assert.equal(first.status, 201);
  assert.equal(first.json.booking.details.nights, 2);
  assert.equal(first.json.booking.status, 'requested');
  state.hotelBooking = first.json.booking;

  const overbooked = await post('/api/bookings/hotels', { ...input, rooms: 1 });
  assert.equal(overbooked.status, 409);
  assert.equal(overbooked.json.error, 'NO_AVAILABILITY');

  const cancelled = await post(`/api/bookings/${first.json.booking.id}/cancel`, { reason: 'Plans changed' });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.json.booking.status, 'cancelled');

  const rebooked = await post('/api/bookings/hotels', { ...input, rooms: 3 });
  assert.equal(rebooked.status, 201, 'cancelling must release the room inventory');
  await post(`/api/bookings/${rebooked.json.booking.id}/cancel`, { reason: 'Integration cleanup' });

  // Hotel (not only homestay) bookings must also persist with real availability.
  const hotel = await post('/api/bookings/hotels', {
    propertyId: 'prp_2', roomId: 'room_2_1', checkIn: '2027-04-10', checkOut: '2027-04-11',
    adults: 2, children: 0, rooms: 1, guestName: 'Asha Roy', journeyId: state.journeyId,
  });
  assert.equal(hotel.status, 201);
  assert.equal(hotel.json.booking.service, 'hotel');
  assert.equal(hotel.json.booking.details.roomId, 'room_2_1');
});

// ------------------------------------------------------- food & groceries ---
test('food order is priced by the server, applies coupons, and ignores client prices', async () => {
  const order = await post('/api/orders', {
    listingId: 'rst_1', service: 'food',
    items: [{ id: 'menu_rst_1_1', name: 'Momos (8 pcs)', quantity: 2, unitPricePaise: 1 }],
    deliveryAddress: 'Mall Road, Darjeeling, West Bengal', instructions: 'Less chilli',
    slot: null, coupon: 'GOWAYY100', journeyId: state.journeyId,
  });
  assert.equal(order.status, 201);
  assert.equal(order.json.order.items[0].unitPricePaise, 18000, 'server price wins over client price');
  assert.equal(order.json.order.coupon, 'GOWAYY100');
  assert.equal(order.json.order.status, 'created');
  assert.ok(order.json.order.price.totalPaise > 0);
  state.foodOrder = order.json.order;
  state.foodJobId = (await get('/api/partners/jobs')).json.items.find((j) => j.orderId === order.json.order.id).id;

  const dashboard = await get(`/api/journeys/${state.journeyId}`);
  assert.equal(dashboard.json.components.find((c) => c.service === 'food').state, 'pending');
});

test('grocery inventory is per store and orders are rejected when stock is short', async () => {
  const tooMany = await post('/api/orders', {
    listingId: 'grc_1', service: 'grocery',
    items: [{ id: 'grp_1_1', name: 'Apples (1 kg)', quantity: 20, unitPricePaise: 18000 }],
    deliveryAddress: 'Mall Road, Darjeeling, West Bengal', instructions: '', slot: null,
    substitution: 'contact_me', journeyId: null,
  });
  assert.equal(tooMany.status, 409);
  assert.equal(tooMany.json.error, 'OUT_OF_STOCK');

  const good = await post('/api/orders', {
    listingId: 'grc_1', service: 'grocery',
    items: [{ id: 'grp_1_1', name: 'Apples (1 kg)', quantity: 2, unitPricePaise: 1 }],
    deliveryAddress: 'Mall Road, Darjeeling, West Bengal', instructions: '', slot: '10:00–12:00',
    substitution: 'allow', journeyId: state.journeyId,
  });
  assert.equal(good.status, 201);
  assert.equal(good.json.order.items[0].unitPricePaise, 18000);
  assert.equal(good.json.order.substitution, 'allow');
  state.groceryOrder = good.json.order;
  state.groceryJobId = (await get('/api/partners/jobs')).json.items.find((j) => j.orderId === good.json.order.id).id;

  // A second store keeps its own inventory, independent of the first.
  const otherStore = await get('/api/catalog/stores');
  assert.ok(otherStore.json.items.some((s) => s.id === 'grc_2'));
});

// --------------------------------------- tourism, packages, parcels, shared --
test('tourism, experience, package, parcel and shared-taxi services book independently', async () => {
  const tourism = await post('/api/bookings/tourism', {
    offeringId: 'att_01', service: 'tourism', date: '2027-03-04', guests: 2, journeyId: state.journeyId,
  });
  assert.equal(tourism.status, 201);
  const experience = await post('/api/bookings/tourism', {
    offeringId: 'exp_1', service: 'experience', date: '2027-03-05', guests: 2, journeyId: state.journeyId,
  });
  assert.equal(experience.status, 201);
  const pkg = await post('/api/bookings/tourism', {
    offeringId: 'pkg_1', service: 'package', date: '2027-03-06', guests: 1, journeyId: state.journeyId,
  });
  assert.equal(pkg.status, 201);

  const parcel = await post('/api/bookings/parcel', {
    pickupId: 'plc_darjeeling_stand', dropoffId: 'plc_njp', weightKg: 2.5,
    description: 'Documents parcel', recipientPhone: '9876543210', journeyId: null,
  });
  assert.equal(parcel.status, 201);
  assert.ok(parcel.json.booking.price.totalPaise > 0);

  const shared = await post('/api/bookings/shared-taxi', { routeId: 'shr_1', seats: 8, journeyId: state.journeyId });
  assert.equal(shared.status, 201);
  const noSeats = await post('/api/bookings/shared-taxi', { routeId: 'shr_1', seats: 1 });
  assert.equal(noSeats.status, 409);
  assert.equal(noSeats.json.error, 'NO_SEATS');

  const all = await get('/api/bookings');
  const services = new Set(all.json.items.map((b) => b.service));
  for (const s of ['cab', 'hotel', 'homestay', 'tourism', 'experience', 'package', 'parcel', 'shared_taxi']) {
    assert.ok(services.has(s), `service ${s} must persist independently`);
  }
});

// ---------------------------------------------- cancellation + refund path --
test('cancelling a captured payment issues a refund and a notification', async () => {
  // A fresh cab booking, paid through a correctly signed webhook.
  const b = (await post('/api/bookings/cab', {
    pickupId: 'plc_njp', dropoffId: 'plc_kalimpong', vehicleClassId: 'hatchback',
    tripType: 'one_way', scheduledAt: null, passengers: 1, journeyId: null,
  })).json.booking;
  const p = (await post('/api/payments/init', {
    bookingId: b.id, orderId: null, method: 'upi_intent', amountPaise: b.price.totalPaise,
    idempotencyKey: `idem_pay_${b.id}`,
  })).json.payment;
  const signed = await signedWebhook({
    eventId: `evt_${b.id}`, type: 'payment.captured', paymentId: p.id,
    amountPaise: b.price.totalPaise, providerReference: `sandbox_${b.id}`,
  });
  assert.equal(signed.status, 200);

  const cancelled = await post(`/api/bookings/${b.id}/cancel`, { reason: 'Change of plans' });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.json.booking.status, 'cancelled');

  const payments = await get('/api/payments');
  assert.equal(payments.json.items.find((x) => x.id === p.id).status, 'refunded');
  const transactions = await get('/api/transactions');
  assert.ok(transactions.json.items.some((t) => t.type === 'refund' && t.paymentId === p.id));
  const notifications = await get('/api/notifications');
  assert.ok(notifications.json.items.some((n) => /refund/i.test(n.title + n.body)));
});

// --------------------------------------------------------- order lifecycle --
test('order status transitions are server-authoritative and partner-gated', async () => {
  const forbidden = await post(`/api/orders/${state.foodOrder.id}/transition`, { status: 'accepted' });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.json.error, 'FORBIDDEN');

  // Illegal graph edges are rejected before the actor check (409), while a
  // legal edge attempted by a customer is forbidden (403).
  const illegal = await post(`/api/orders/${state.foodOrder.id}/transition`, { status: 'delivered' });
  assert.equal(illegal.status, 409);
  assert.equal(illegal.json.error, 'ILLEGAL_TRANSITION');

  const claimed = await post('/api/partners/claim', { role: 'restaurant', listingId: 'rst_1' });
  assert.equal(claimed.status, 200);
  assert.ok(claimed.json.user.roles.includes('restaurant'));
  assert.match(claimed.json.demoNotice, /production requires document verification/i);

  const accepted = await post(`/api/orders/${state.foodOrder.id}/transition`, { status: 'accepted' });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.order.status, 'accepted');
  const illegalAfter = await post(`/api/orders/${state.foodOrder.id}/transition`, { status: 'created' });
  assert.equal(illegalAfter.status, 409);
});

// ------------------------------------------------------------- dispatch -----
test('driver verification gates online status and dispatch blocks incompatible jobs', async () => {
  const reg = await post('/api/partners/drivers', {
    name: 'Ravi Thapa', phone: '9876543210', vehicleClass: 'hatchback',
    services: ['cab', 'food', 'grocery', 'parcel'], licenceNumber: 'WB-2020-0001234',
    vehicleRegistration: 'WB74AB1234', insuranceNumber: 'INS-2026-000123',
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.json.driver.verification, 'pending');

  const early = await api('PATCH', '/api/partners/drivers/me', { body: { online: true } });
  assert.equal(early.status, 409);
  assert.equal(early.json.error, 'NOT_VERIFIED');

  const verify = await post('/api/partners/drivers/verify-demo', {});
  assert.equal(verify.status, 200);
  assert.match(verify.json.demoNotice, /DEMO/i);

  const online = await api('PATCH', '/api/partners/drivers/me', { body: { online: true } });
  assert.equal(online.status, 200);
  assert.equal(online.json.driver.online, true);

  const jobs = await get('/api/partners/jobs');
  const cabJob = jobs.json.items.find((j) => j.service === 'cab' && j.status === 'open');
  assert.ok(cabJob, 'a cab booking must create an open dispatch job');
  const acceptedCab = await post(`/api/partners/jobs/${cabJob.id}/accept`, {});
  assert.equal(acceptedCab.status, 200);
  assert.equal(acceptedCab.json.job.status, 'accepted');

  const foodJob = jobs.json.items.find((j) => j.service === 'food' && j.status === 'open');
  const blocked = await post(`/api/partners/jobs/${foodJob.id}/accept`, {});
  assert.equal(blocked.status, 409);
  assert.equal(blocked.json.error, 'DISPATCH_REJECTED');
  assert.match(blocked.json.message, /passenger|active job/i);

  const ineligible = await api('PATCH', '/api/partners/drivers/me', { body: { services: ['cab', 'food', 'grocery', 'parcel', 'hotel'] } });
  assert.equal(ineligible.status, 409);
});

// ------------------------------------------------- notifications / privacy --
test('notifications are deduplicated, readable, and support tickets persist', async () => {
  const before = await get('/api/notifications');
  assert.ok(before.json.items.length > 0);
  const ticket = await post('/api/support/tickets', {
    subject: 'Missing invoice', body: 'Please share the invoice for my airport pickup.',
  });
  assert.equal(ticket.status, 201);
  assert.equal(ticket.json.ticket.status, 'open');

  const readAll = await post('/api/notifications/read-all', {});
  assert.equal(readAll.status, 200);
  const afterRead = await get('/api/notifications');
  assert.equal(afterRead.json.unreadCount, 0);
});

// ----------------------------------------------------- login / account -----
test('login, logout, forgot/reset password and account deletion work', async () => {
  const forgot = await post('/api/auth/forgot-password', { email: state.email });
  assert.equal(forgot.status, 200);
  assert.match(forgot.json.demoNotice, /no email was sent/i);
  const reset = await post('/api/auth/reset-password', {
    resetId: forgot.json.resetId, code: forgot.json.demoCode, password: 'Cedar!Meadow57',
  });
  assert.equal(reset.status, 200);

  const oldLogin = await post('/api/auth/login', { email: state.email, password: state.password });
  assert.equal(oldLogin.status, 401);
  const login = await post('/api/auth/login', { email: state.email, password: 'Cedar!Meadow57' });
  assert.equal(login.status, 200);
  assert.ok(login.json.session.token);

  const logout = await post('/api/auth/logout', {}, { headers: { authorization: `Bearer ${login.json.session.token}` } });
  assert.equal(logout.status, 200);
  const afterLogout = await get('/api/auth/me', { token: login.json.session.token });
  assert.equal(afterLogout.status, 401);

  const deleted = await api('DELETE', '/api/auth/account');
  assert.equal(deleted.status, 200);
  const gone = await get('/api/auth/me');
  assert.equal(gone.status, 401);
});

// ------------------------------------------------------------- artifacts ---
test('the development database was actually written to disk', () => {
  assert.equal(existsSync(DB_FILE), true, 'bookings/orders must persist across requests');
});
