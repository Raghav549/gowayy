/**
 * GOWAYY development API — a small, dependency-free reference backend.
 *
 * It implements the same contract the Supabase Postgres + Edge Functions layer
 * implements (see supabase/), so the web and mobile clients are functional in
 * this repository without a hosted Supabase project. It is SERVER-AUTHORITATIVE:
 * prices, stock, booking status, payments and dispatch decisions are computed
 * here, never trusted from the client. Persistence is a local JSON file.
 *
 * NOT FOR PRODUCTION: file-backed storage, demo OTP adapter, sandbox payments.
 */
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { catalogue, searchCatalog, recommendationsForDestination } from '@gowayy/catalog';
import {
  cabBookingSchema, stayBookingSchema, orderSchema, tourismBookingSchema, parcelBookingSchema,
  paymentInitSchema, driverRegistrationSchema, stepOneSchema, stepTwoSchema, otpSchema,
  loginSchema, forgotSchema, addressSchema, supportTicketSchema,
} from '@gowayy/validation';
import {
  quoteCabFare, quoteSharedTaxiFare, priceOrder, priceStay, priceTourism, priceParcel,
  refundableAmount, GST_PERCENT,
} from '@gowayy/pricing-engine';
import { estimateRoute, haversineKm } from '@gowayy/location-engine';
import {
  transitionBooking, transitionOrderStatus, createJourney, updateJourney, journeyComponents,
  DEFAULT_DISPATCH_RULES, checkEligibility,
} from '@gowayy/booking-engine';
import { buildNotification, toNotification, deduplicate } from '@gowayy/notification-engine';
import { makeId, randomToken, nowIso, nightsBetween, formatINR, slugify } from '@gowayy/shared-utils';
import { createCommerceModule } from './commerce.mjs';
import { createPartnerHub } from './partner-hub.mjs';
import { quoteCheckout, assertVariantAvailable } from '@gowayy/commerce';
import { getProduct } from '@gowayy/catalog';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const DATA_DIR = join(ROOT, 'apps/dev-api/data');
const DB_FILE = process.env.GOWAYY_DB_FILE ?? join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT ?? 8787);
const DEMO_MODE = process.env.GOWAYY_ENV !== 'production';
const OTP_PROVIDER = process.env.GOWAYY_OTP_PROVIDER ?? 'demo';
/** Server-side webhook secret. Never shipped to a client. */
const WEBHOOK_SECRET = process.env.GOWAYY_WEBHOOK_SECRET ?? randomBytes(32).toString('hex');

// ---------------------------------------------------------------- storage ---
function emptyDb() {
  return {
    version: 1,
    users: [], registrations: [], resets: [], sessions: [],
    journeys: [], bookings: [], orders: [], payments: [], transactions: [],
    notifications: [], drivers: [], jobs: [], tickets: [], addresses: [], savedPlaces: [],
    reviews: [], inventory: {}, roomAvailability: {}, sharedSeats: {},
    carts: {}, wishlist: {}, productStock: {}, productViews: {}, searchHistory: {},
    partners: [], partnerProfiles: {}, partnerDocuments: {}, menus: {}, rooms: {}, tours: {},
    settlements: [], wallet: {},
    coupons: [
      { code: 'GOWAYY100', kind: 'flat', valuePaise: 10000, minSubtotalPaise: 30000, active: true },
      { code: 'WELCOME10', kind: 'percent', valuePercent: 10, maxPaise: 20000, minSubtotalPaise: 20000, active: true },
    ],
    idempotency: {}, audit: [], counters: { booking: 1000, order: 2000 },
  };
}
function loadDb() {
  mkdirSync(dirname(DB_FILE), { recursive: true });
  if (!existsSync(DB_FILE)) return emptyDb();
  try { return { ...emptyDb(), ...JSON.parse(readFileSync(DB_FILE, 'utf8')) }; }
  catch (e) { console.error('[dev-api] corrupt db, starting fresh:', e.message); return emptyDb(); }
}
let db = loadDb();
function save() {
  const tmp = `${DB_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, DB_FILE);
}
function seedInventory() {
  for (const s of catalogue.groceryStores) for (const p of s.products) {
    const key = `${s.id}:${p.id}`;
    if (db.inventory[key] === undefined) db.inventory[key] = p.stock;
  }
  for (const r of catalogue.sharedTaxiRoutes) {
    const key = `${r.id}:${nowIso().slice(0, 10)}`;
    if (db.sharedSeats[key] === undefined) db.sharedSeats[key] = r.seatsTotal;
  }
}
seedInventory(); save();

const audit = (actor, action, detail = {}) => { db.audit.push({ id: makeId('aud'), at: nowIso(), actor, action, detail }); };
const notify = (userId, event) => {
  const draft = buildNotification(event);
  const n = toNotification(userId, draft);
  const fresh = deduplicate(db.notifications, [n]);
  for (const f of fresh) db.notifications.push(f);
  return fresh[0] ?? null;
};

// ------------------------------------------------------------------ helpers -
class HttpError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
const bad = (code, message, status = 400, details) => { throw new HttpError(status, code, message, details); };

function send(res, status, body, headers = {}) {
  const raw = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(raw), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, idempotency-key, x-gowayy-signature', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', ...headers });
  res.end(raw);
}
async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 512_000) bad('PAYLOAD_TOO_LARGE', 'Request body too large', 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  req.rawBody = raw;
  try { return JSON.parse(raw); }
  catch { bad('INVALID_JSON', 'Malformed JSON body'); }
}
function zod(schema, body) {
  const r = schema.safeParse(body);
  if (!r.success) bad('VALIDATION_FAILED', 'Please check the form', 422, r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
function publicUser(u) {
  return { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, roles: u.roles, createdAt: u.createdAt, deletedAt: u.deletedAt ?? null };
}
function sessionFor(userId) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  db.sessions.push({ token, userId, expiresAt });
  return { token, userId, expiresAt };
}
function auth(req, required = true) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = db.sessions.find((s) => s.token === token && s.expiresAt > nowIso());
  const user = session ? db.users.find((u) => u.id === session.userId && !u.deletedAt) : null;
  if (!user && required) bad('UNAUTHORIZED', 'Sign in to continue', 401);
  return { user, session };
}
function rateLimit(req, bucket = 'write', max = 120) {
  const ip = req.socket.remoteAddress ?? 'unknown';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  db._rate ??= {};
  const entry = db._rate[key] ?? { count: 0, reset: now + 60_000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000; }
  entry.count += 1; db._rate[key] = entry;
  if (entry.count > max) bad('RATE_LIMITED', 'Too many requests — please wait a moment', 429);
}
function reference(prefix) {
  db.counters[prefix] = (db.counters[prefix] ?? 1000) + 1;
  return `GW-${prefix === 'booking' ? 'B' : 'O'}${db.counters[prefix]}`;
}
function idempotency(req, fn) {
  const key = req.headers['idempotency-key'];
  if (typeof key === 'string' && key.length >= 8) {
    const prior = db.idempotency[key];
    if (prior) return prior.body;
    const body = fn();
    db.idempotency[key] = { at: nowIso(), body };
    return body;
  }
  return fn();
}
const actorFor = (user, service) => {
  const partnerServices = { driver: ['cab', 'shared_taxi', 'parcel'], restaurant: ['food'], grocery: ['grocery'], property: ['hotel', 'homestay', 'tourism', 'experience', 'package'], tour_operator: ['tourism', 'package', 'experience'] };
  const isPartner = user.roles.some((r) => (partnerServices[r] ?? []).includes(service));
  return isPartner ? 'partner' : 'customer';
};

// ------------------------------------------------------------- domain logic -
function placeById(id) { return catalogue.places.find((p) => p.id === id) ?? null; }
function routeQuote(pickupId, dropoffId, vehicleId, tripType, passengers) {
  const from = placeById(pickupId); const to = placeById(dropoffId);
  if (!from || !to) bad('PLACE_NOT_FOUND', 'Unknown pickup or destination');
  if (from.id === to.id) bad('SAME_PLACE', 'Pickup and destination must differ');
  const vehicle = catalogue.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) bad('VEHICLE_NOT_FOUND', 'Unknown vehicle class');
  const route = estimateRoute(from, to);
  const price = quoteCabFare({ distanceKm: route.distanceKm, durationMin: route.durationMin, vehicle, tripType, passengers });
  return { from, to, vehicle, route, price };
}
function makeBooking(user, input) {
  const b = {
    id: makeId('bkg'), reference: reference('booking'), userId: user.id,
    service: input.service, status: 'requested', journeyId: input.journeyId ?? null,
    listingId: input.listingId ?? null, title: input.title, details: input.details,
    price: input.price, paymentId: null, createdAt: nowIso(), updatedAt: nowIso(),
    statusHistory: [{ status: 'requested', at: nowIso(), by: 'system', note: 'Request created by server after validation' }],
  };
  db.bookings.push(b);
  if (b.journeyId) {
    const j = db.journeys.find((x) => x.id === b.journeyId && x.userId === user.id);
    if (j && !j.serviceIds.includes(b.id)) { j.serviceIds.push(b.id); j.updatedAt = nowIso(); }
  }
  notify(user.id, { type: 'booking.created', reference: b.reference, service: b.service });
  if (['cab', 'shared_taxi', 'parcel'].includes(b.service)) {
    db.jobs.push({ id: makeId('job'), service: b.service, bookingId: b.id, orderId: null, status: 'open', driverId: null, createdAt: nowIso() });
  }
  audit(user.id, 'booking.created', { bookingId: b.id, service: b.service, totalPaise: b.price.totalPaise });
  return b;
}
function attachJourneyContext(user, body) {
  if (!body.journeyId) return;
  const j = db.journeys.find((x) => x.id === body.journeyId && x.userId === user.id);
  if (!j) bad('JOURNEY_NOT_FOUND', 'Journey context not found', 404);
}
function itemPrice(listing, itemId) {
  if (listing.menu) {
    const m = listing.menu.find((x) => x.id === itemId);
    if (!m || !m.available) return null;
    return { name: m.name, unitPricePaise: m.pricePaise, options: m.customizations };
  }
  const p = listing.products?.find((x) => x.id === itemId);
  if (!p) return null;
  return { name: p.name, unitPricePaise: p.pricePaise, options: [] };
}
function createOrder(user, body) {
  const listing = body.service === 'food'
    ? catalogue.restaurants.find((r) => r.id === body.listingId)
    : catalogue.groceryStores.find((s) => s.id === body.listingId);
  if (!listing) bad('LISTING_NOT_FOUND', 'Store or restaurant not found', 404);
  // Server recomputes every price and checks every stock level.
  const priced = body.items.map((it) => {
    const found = itemPrice(listing, it.id);
    if (!found) bad('ITEM_UNAVAILABLE', `${it.name || it.id} is not available at ${listing.name}`, 409);
    const extra = (it.options ?? []).reduce((sum, optId) => sum + (found.options.find((o) => o.id === optId)?.extraPaise ?? 0), 0);
    return { id: it.id, name: found.name, quantity: it.quantity, unitPricePaise: found.unitPricePaise + extra, options: it.options ?? [] };
  });
  for (const it of priced) {
    if (body.service === 'grocery') {
      const key = `${listing.id}:${it.id}`;
      const stock = db.inventory[key] ?? 0;
      if (stock < it.quantity) {
        bad('OUT_OF_STOCK', `${it.name}: only ${stock} in stock at ${listing.name}`, 409);
      }
    }
  }
  const deliveryFee = body.service === 'food' ? 4000 : 3000;
  const itemSubtotal = priced.reduce((sum, i) => sum + i.quantity * i.unitPricePaise, 0) + deliveryFee;
  let discountPaise = 0; let appliedCoupon = null;
  if (body.coupon) {
    const coupon = (db.coupons ?? []).find((c) => c.code === String(body.coupon).trim().toUpperCase() && c.active);
    if (!coupon) bad('INVALID_COUPON', 'This coupon code is not valid');
    if (itemSubtotal < coupon.minSubtotalPaise) bad('COUPON_MINIMUM', `Add ${formatINR(coupon.minSubtotalPaise - itemSubtotal)} more to use this coupon`);
    discountPaise = coupon.kind === 'flat' ? coupon.valuePaise : Math.min(coupon.maxPaise ?? Infinity, Math.round(itemSubtotal * (coupon.valuePercent ?? 0) / 100));
    appliedCoupon = coupon.code;
  }
  const price = priceOrder({ items: priced, deliveryFeePaise: deliveryFee, discountPaise, taxPercent: 5, service: body.service });
  const order = {
    id: makeId('ord'), reference: reference('order'), userId: user.id, service: body.service,
    status: 'created', journeyId: body.journeyId ?? null, listingId: listing.id,
    items: priced, price, deliveryAddress: body.deliveryAddress, instructions: body.instructions ?? '',
    slot: body.slot ?? null, substitution: body.substitution ?? null, coupon: appliedCoupon,
    paymentId: null, createdAt: nowIso(), updatedAt: nowIso(),
  };
  if (body.service === 'grocery') {
    for (const it of priced) db.inventory[`${listing.id}:${it.id}`] -= it.quantity;
  }
  db.orders.push(order);
  if (order.journeyId) {
    const j = db.journeys.find((x) => x.id === order.journeyId && x.userId === user.id);
    if (j && !j.serviceIds.includes(order.id)) { j.serviceIds.push(order.id); j.updatedAt = nowIso(); }
  }
  db.jobs.push({ id: makeId('job'), service: body.service, bookingId: null, orderId: order.id, status: 'open', driverId: null, createdAt: nowIso() });
  notify(user.id, { type: 'booking.created', reference: order.reference, service: body.service });
  audit(user.id, 'order.created', { orderId: order.id, totalPaise: order.price.totalPaise });
  return order;
}

function paymentTarget(id, bookingId, orderId) {
  const booking = bookingId ? db.bookings.find((b) => b.id === bookingId) : null;
  const order = orderId ? db.orders.find((o) => o.id === orderId) : null;
  if (bookingId && !booking) bad('NOT_FOUND', 'Booking not found', 404);
  if (orderId && !order) bad('NOT_FOUND', 'Order not found', 404);
  if (!booking && !order) bad('INVALID_PAYMENT', 'A payment must reference a booking or order');
  const target = booking ?? order;
  if (target.userId !== id) bad('FORBIDDEN', 'This record belongs to another account', 403);
  return { booking, order, target };
}

/** Signature verification is the ONLY path that can mark a payment captured. */
function verifyWebhook(rawBody, signature) {
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  const supplied = String(signature ?? '');
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    bad('INVALID_SIGNATURE', 'Webhook signature verification failed', 401);
  }
  const event = JSON.parse(rawBody);
  const payment = db.payments.find((p) => p.id === event.paymentId);
  if (!payment) bad('PAYMENT_NOT_FOUND', 'Unknown payment', 404);
  if (db.transactions.some((t) => t.note === `webhook:${event.eventId}`)) return { duplicate: true, payment };
  if (event.type !== 'payment.captured' || event.amountPaise !== payment.amountPaise) {
    bad('WEBHOOK_REJECTED', 'Webhook amount or event type does not match the server record', 409);
  }
  payment.status = 'captured'; payment.providerReference = event.providerReference; payment.updatedAt = nowIso();
  db.transactions.push({ id: makeId('txn'), paymentId: payment.id, type: 'charge', amountPaise: payment.amountPaise, note: `webhook:${event.eventId}`, createdAt: nowIso() });
  db.transactions.push({ id: makeId('txn'), paymentId: payment.id, type: 'commission', amountPaise: 0, note: 'commission accrual (settled separately)', createdAt: nowIso() });
  const ref = (payment.bookingId ? db.bookings.find((b) => b.id === payment.bookingId)?.reference : db.orders.find((o) => o.id === payment.orderId)?.reference) ?? payment.id;
  notify(payment.userId, { type: 'payment.captured', reference: ref, amount: formatINR(payment.amountPaise) });
  audit('webhook', 'payment.captured', { paymentId: payment.id, amountPaise: payment.amountPaise });
  return { duplicate: false, payment };
}

// ------------------------------------------------- marketplace checkout ----
/** Server-priced marketplace checkout from the customer's cart. */
function placeOrderFromCart(user, body) {
  const cart = db.carts[user.id] ?? { lines: [] };
  const lines = cart.lines.length ? cart.lines : (Array.isArray(body.lines) ? body.lines : []);
  if (!lines.length) bad('CART_EMPTY', 'Your cart is empty', 409);
  const address = db.addresses.find((a) => a.id === body.addressId && a.userId === user.id);
  if (!address) bad('ADDRESS_REQUIRED', 'Choose a delivery address', 422);
  const method = String(body.paymentMethod ?? '');
  const priced = lines.map((l) => {
    const p = getProduct(l.productId);
    const v = p?.variants.find((x) => x.id === l.variantId);
    if (!p || !v) bad('ITEM_UNAVAILABLE', 'A cart item is no longer available', 409);
    const stock = db.productStock[`${p.id}:${v.id}`] ?? v.stock;
    assertVariantAvailable({ ...v, stock }, Number(l.quantity));
    const plan = l.protectionPlanId ? p.protectionPlans.find((pl) => pl.id === l.protectionPlanId) : null;
    if (l.protectionPlanId && !plan) bad('PLAN_NOT_FOUND', 'Protection plan no longer offered', 409);
    return { id: p.id, variantId: v.id, name: p.name, variantLabel: v.label, quantity: Number(l.quantity), unitPricePaise: v.pricePaise, mrpPaise: v.mrpPaise, protectionPlanId: plan?.id ?? null, protectionPaise: plan ? plan.pricePaise * Number(l.quantity) : 0 };
  });
  const coupon = body.coupon ? (db.coupons ?? []).find((c) => c.code === String(body.coupon).trim().toUpperCase() && c.active) : null;
  if (body.coupon && !coupon) bad('INVALID_COUPON', 'This coupon code is not valid');
  const deliveryFeePaise = body.deliverySlot === 'express' ? 9900 : 0;
  const allPlans = catalogue.marketplaceProducts.flatMap((p) => p.protectionPlans);
  const quote = quoteCheckout({ lines: priced.map((l) => ({ unitPricePaise: l.unitPricePaise, quantity: l.quantity, protectionPlanId: l.protectionPlanId })), protectionPlans: allPlans, deliveryFeePaise, coupon });
  const order = {
    id: makeId('ord'), reference: reference('order'), userId: user.id, service: 'marketplace',
    status: 'created', journeyId: body.journeyId ?? null, listingId: null,
    items: priced.map((l) => ({ id: l.id, name: `${l.name} (${l.variantLabel})`, quantity: l.quantity, unitPricePaise: l.unitPricePaise, options: l.protectionPlanId ? [l.protectionPlanId] : [] })),
    protection: priced.filter((l) => l.protectionPlanId).map((l) => ({ planId: l.protectionPlanId, paise: l.protectionPaise })),
    price: { ...quote, lines: [{ label: 'Items', paise: quote.itemsPaise }, { label: 'Protection', paise: quote.protectionPaise }, { label: 'Delivery', paise: deliveryFeePaise }, { label: 'Discount', paise: -quote.discountPaise }, { label: `GST (5%)`, paise: quote.taxPaise }], totalPaise: quote.totalPaise },
    deliveryAddress: address, instructions: String(body.instructions ?? ''), slot: body.deliverySlot ?? 'standard',
    coupon: quote.appliedCoupon, paymentId: null, paymentMethod: method, createdAt: nowIso(), updatedAt: nowIso(),
  };
  for (const l of priced) db.productStock[`${l.id}:${l.variantId}`] = (db.productStock[`${l.id}:${l.variantId}`] ?? 0) - l.quantity;
  db.orders.push(order);
  db.carts[user.id] = { lines: [], updatedAt: nowIso() };
  db.jobs.push({ id: makeId('job'), service: 'marketplace', bookingId: null, orderId: order.id, status: 'open', driverId: null, createdAt: nowIso() });
  notify(user.id, { type: 'booking.created', reference: order.reference, service: 'marketplace' });
  audit(user.id, 'order.created', { orderId: order.id, service: 'marketplace', totalPaise: quote.totalPaise });
  return order;
}

// ------------------------------------------------------------------ routing -
const ok = (res, body, status = 200) => { save(); send(res, status, body); };

const commerce = createCommerceModule({
  db: () => db, bad, auth, rateLimit, notify, audit, placeOrderFromCart,
});
const partnerHub = createPartnerHub({ db: () => db, bad, auth, rateLimit, notify, audit, formatINR });

async function route(req, res, url) {
  const method = req.method ?? 'GET';
  const path = url.pathname;
  const q = url.searchParams;
  const body = ['POST', 'PATCH', 'PUT'].includes(method) ? await readBody(req) : {};
  const seg = path.split('/').filter(Boolean); // ['api', ...]
  const tail = seg.slice(1);

  if (method === 'GET' && path === '/api/health') {
    return send(res, 200, {
      ok: true, service: 'gowayy-dev-api', version: '0.1.0', mode: DEMO_MODE ? 'development' : 'production',
      otpAdapter: OTP_PROVIDER === 'demo' ? 'demo (labelled, not real email verification)' : OTP_PROVIDER,
      paymentProvider: 'sandbox', storage: 'local JSON file', supabase: 'not connected in this environment',
      serverTime: nowIso(),
    });
  }

  // ------- catalogue (public, read-only) -------
  if (method === 'GET' && tail[0] === 'catalog') {
    const map = {
      destinations: catalogue.destinations, 'hidden-gems': catalogue.hiddenGems, attractions: catalogue.attractions,
      places: catalogue.places, vehicles: catalogue.vehicles, 'shared-routes': catalogue.sharedTaxiRoutes,
      properties: catalogue.properties, restaurants: catalogue.restaurants, stores: catalogue.groceryStores,
      packages: catalogue.tourPackages, experiences: catalogue.experiences,
    };
    const name = tail[1];
    if (!name) return send(res, 200, { keys: Object.keys(map) });
    if (!map[name]) bad('NOT_FOUND', 'Unknown catalogue collection', 404);
    return send(res, 200, { items: map[name], count: map[name].length });
  }
  if (method === 'GET' && path === '/api/search') return send(res, 200, { query: q.get('q') ?? '', hits: searchCatalog(q.get('q') ?? '') });
  if (method === 'GET' && path === '/api/recommendations') return send(res, 200, { destinationId: q.get('destinationId'), groups: recommendationsForDestination(q.get('destinationId') ?? '') });
  if (method === 'GET' && path === '/api/credits') return send(res, 200, {
    policy: 'Only verified, permissibly licensed photographs are displayed. See assets/images/IMAGE_SOURCES.json.',
    credits: catalogue.destinations.flatMap((d) => d.images.filter((i) => i.status === 'verified').map((i) => ({ place: d.name, alt: i.alt, credit: i.credit, license: i.license, sourceUrl: i.sourceUrl }))),
    unavailablePlaces: catalogue.destinations.filter((d) => d.images.every((i) => i.status === 'unavailable')).map((d) => d.name),
  });
  if (method === 'GET' && path === '/api/routes/estimate') {
    const from = placeById(q.get('from') ?? ''); const to = placeById(q.get('to') ?? '');
    if (!from || !to) bad('PLACE_NOT_FOUND', 'Unknown place id');
    return send(res, 200, { route: estimateRoute(from, to), vehicle: catalogue.vehicles.find((v) => v.id === q.get('vehicle')) ?? null });
  }
  if (method === 'GET' && path === '/api/reviews') return send(res, 200, { items: db.reviews.filter((r) => !q.get('listingId') || r.listingId === q.get('listingId')) });
  if (method === 'GET' && path === '/api/coupons') return send(res, 200, { items: (db.coupons ?? []).filter((c) => c.active).map((c) => ({ code: c.code, kind: c.kind, minSubtotalPaise: c.minSubtotalPaise })) });

  // ------- authentication -------
  if (method === 'POST' && path === '/api/auth/register') {
    rateLimit(req, 'register', 20);
    const d = zod(stepTwoSchema, body);
    const name = zod(stepOneSchema, { firstName: d.firstName ?? body.firstName, lastName: d.lastName ?? body.lastName });
    if (OTP_PROVIDER !== 'demo') bad('OTP_PROVIDER_NOT_CONFIGURED', 'No real email OTP provider is configured for this environment', 503);
    if (db.users.some((u) => u.email === emailOf(d.email) && !u.deletedAt)) bad('EMAIL_EXISTS', 'An account with this email already exists', 409);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const registration = {
      id: makeId('reg'), firstName: name.firstName, lastName: name.lastName, email: emailOf(d.email),
      passwordHash: hashPassword(d.password), codeHash: createHmac('sha256', WEBHOOK_SECRET).update(code).digest('hex'),
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), resendAt: new Date(Date.now() + 30_000).toISOString(),
      attempts: 0, createdAt: nowIso(),
    };
    db.registrations.push(registration);
    audit(registration.id, 'auth.registered', { email: registration.email });
    return ok(res, {
      registrationId: registration.id, otpRequired: true, expiresAt: registration.expiresAt,
      resendAfterSeconds: 30, demoMode: true, demoOtp: code,
      demoNotice: 'DEMO OTP ADAPTER — the code is shown here because no real email provider is connected. This is not real email verification.',
    }, 201);
  }
  if (method === 'POST' && path === '/api/auth/otp/send') {
    const reg = db.registrations.find((r) => r.id === body.registrationId);
    if (!reg) bad('REGISTRATION_NOT_FOUND', 'Start registration again', 404);
    if (nowIso() < reg.resendAt) bad('RESEND_TOO_SOON', 'Wait for the resend countdown before requesting a new code', 429);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    reg.codeHash = createHmac('sha256', WEBHOOK_SECRET).update(code).digest('hex');
    reg.expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    reg.resendAt = new Date(Date.now() + 30_000).toISOString(); reg.attempts = 0;
    audit(reg.id, 'auth.otp.resent', {});
    return ok(res, { sent: true, expiresAt: reg.expiresAt, resendAfterSeconds: 30, demoMode: true, demoOtp: code,
      demoNotice: 'DEMO OTP ADAPTER — no email was sent.' });
  }
  if (method === 'POST' && path === '/api/auth/otp/verify') {
    rateLimit(req, 'otp', 40);
    zod(otpSchema, String(body.code ?? ''));
    const reg = db.registrations.find((r) => r.id === body.registrationId);
    if (!reg) bad('REGISTRATION_NOT_FOUND', 'Start registration again', 404);
    if (reg.expiresAt < nowIso()) bad('OTP_EXPIRED', 'This code has expired. Request a new code.');
    if (reg.attempts >= 5) bad('OTP_LOCKED', 'Too many incorrect attempts. Request a new code.', 429);
    const supplied = createHmac('sha256', WEBHOOK_SECRET).update(String(body.code)).digest('hex');
    if (supplied !== reg.codeHash) { reg.attempts += 1; audit(reg.id, 'auth.otp.failed', { attempts: reg.attempts }); return ok(res, { verified: false, error: 'INCORRECT_OTP', message: 'Incorrect code. Check and try again.', attemptsRemaining: 5 - reg.attempts }); }
    const user = { id: makeId('usr'), firstName: reg.firstName, lastName: reg.lastName, email: reg.email, passwordHash: reg.passwordHash, roles: ['customer'], createdAt: nowIso(), deletedAt: null };
    db.users.push(user); reg.verifiedAt = nowIso();
    const session = sessionFor(user.id);
    audit(user.id, 'auth.verified', { adapter: 'demo-otp' });
    return ok(res, { verified: true, user: publicUser(user), session });
  }
  if (method === 'POST' && path === '/api/auth/login') {
    rateLimit(req, 'login', 30);
    const d = zod(loginSchema, body);
    const user = db.users.find((u) => u.email === emailOf(d.email) && !u.deletedAt);
    if (!user || !verifyPassword(d.password, user.passwordHash)) bad('INVALID_CREDENTIALS', 'Email or password is incorrect', 401);
    const session = sessionFor(user.id);
    audit(user.id, 'auth.login', {});
    return ok(res, { user: publicUser(user), session });
  }
  if (method === 'POST' && path === '/api/auth/forgot-password') {
    const d = zod(forgotSchema, body);
    const user = db.users.find((u) => u.email === emailOf(d.email) && !u.deletedAt);
    // Do not disclose whether the email exists. In demo mode a reset id/code is returned.
    const reset = { id: makeId('rst'), userId: user?.id ?? null, code: String(randomInt(0, 1_000_000)).padStart(6, '0'), expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() };
    db.resets.push(reset);
    return ok(res, { accepted: true, resetId: reset.id, demoMode: true, demoCode: reset.code,
      demoNotice: user ? 'DEMO PASSWORD RESET — no email was sent.' : 'DEMO PASSWORD RESET — if the account exists, a code would be sent.' });
  }
  if (method === 'POST' && path === '/api/auth/reset-password') {
    const reset = db.resets.find((r) => r.id === body.resetId && !r.usedAt);
    if (!reset || reset.expiresAt < nowIso() || reset.code !== String(body.code ?? '')) bad('INVALID_RESET', 'Reset code is incorrect or expired');
    if (body.password?.length < 10) bad('WEAK_PASSWORD', 'Password must be at least 10 characters');
    const user = db.users.find((u) => u.id === reset.userId);
    if (!user) bad('INVALID_RESET', 'Reset code is incorrect or expired');
    user.passwordHash = hashPassword(body.password); reset.usedAt = nowIso();
    audit(user.id, 'auth.password-reset', {});
    return ok(res, { reset: true });
  }
  if (method === 'GET' && path === '/api/auth/me') { const { user } = auth(req); return send(res, 200, { user: publicUser(user) }); }
  if (method === 'PATCH' && path === '/api/auth/me') {
    const { user } = auth(req);
    if (body.firstName) user.firstName = String(body.firstName).slice(0, 40);
    if (body.lastName) user.lastName = String(body.lastName).slice(0, 40);
    audit(user.id, 'auth.profile-updated', {});
    return ok(res, { user: publicUser(user) });
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    const { session } = auth(req, false);
    if (session) db.sessions = db.sessions.filter((s) => s.token !== session.token);
    return ok(res, { loggedOut: true });
  }
  if (method === 'DELETE' && path === '/api/auth/account') {
    const { user } = auth(req);
    user.deletedAt = nowIso();
    db.sessions = db.sessions.filter((s) => s.userId !== user.id);
    audit(user.id, 'auth.account-deleted', {});
    return ok(res, { deleted: true });
  }

  // ------- journeys -------
  if (tail[0] === 'journeys' && ((method === 'GET' && tail.length === 1) || method === 'POST')) {
    const { user } = auth(req);
    if (method === 'GET') return send(res, 200, { items: db.journeys.filter((j) => j.userId === user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
    const destination = body.destinationId ? catalogue.destinations.find((d) => d.id === body.destinationId) : null;
    if (body.destinationId && !destination) bad('DESTINATION_NOT_FOUND', 'Unknown destination');
    const j = createJourney(user.id, { ...body, pickup: body.pickup ? placeById(body.pickup.id ?? body.pickup) : body.pickup ?? null, dropoff: body.dropoff ? placeById(body.dropoff.id ?? body.dropoff) : body.dropoff ?? null }, destination?.name);
    db.journeys.push(j); audit(user.id, 'journey.created', { journeyId: j.id });
    return ok(res, { journey: j }, 201);
  }
  if (tail[0] === 'journeys' && tail[1] && (method === 'GET' || method === 'PATCH')) {
    const { user } = auth(req);
    const j = db.journeys.find((x) => x.id === tail[1] && x.userId === user.id);
    if (!j) bad('NOT_FOUND', 'Journey not found', 404);
    if (method === 'PATCH') {
      const updated = updateJourney(j, body); Object.assign(j, updated);
      audit(user.id, 'journey.updated', { journeyId: j.id });
      return ok(res, { journey: j });
    }
    const bookings = db.bookings.filter((b) => b.userId === user.id);
    const orders = db.orders.filter((o) => o.userId === user.id);
    return send(res, 200, { journey: j, components: journeyComponents(j, bookings, orders) });
  }

  // ------- booking creation (prices computed server-side) -------
  if (method === 'POST' && path === '/api/bookings/cab') {
    const { user } = auth(req); rateLimit(req);
    const d = zod(cabBookingSchema, body); attachJourneyContext(user, d);
    return ok(res, { booking: idempotency(req, () => {
      const { from, to, vehicle, route, price } = routeQuote(d.pickupId, d.dropoffId, d.vehicleClassId, d.tripType, d.passengers);
      return makeBooking(user, { service: 'cab', title: `${from.name} → ${to.name}`, listingId: vehicle.id, journeyId: d.journeyId,
        details: { pickup: from, dropoff: to, vehicleClass: vehicle.name, tripType: d.tripType, passengers: d.passengers, scheduledAt: d.scheduledAt, distanceKm: Number(route.distanceKm.toFixed(2)), durationMin: route.durationMin, routeProvider: route.provider, routeNote: route.note }, price });
    }) }, 201);
  }
  if (method === 'POST' && path === '/api/bookings/shared-taxi') {
    const { user } = auth(req);
    const r = catalogue.sharedTaxiRoutes.find((x) => x.id === body.routeId);
    if (!r) bad('ROUTE_NOT_FOUND', 'Unknown shared-taxi route', 404);
    const seats = Math.max(1, Math.min(8, Number(body.seats ?? 1)));
    const key = `${r.id}:${nowIso().slice(0, 10)}`;
    if ((db.sharedSeats[key] ?? 0) < seats) bad('NO_SEATS', 'Not enough seats on this departure', 409);
    return ok(res, { booking: idempotency(req, () => {
      db.sharedSeats[key] -= seats;
      const price = quoteSharedTaxiFare(r.pricePaise, seats);
      return makeBooking(user, { service: 'shared_taxi', title: `${placeById(r.fromId)?.name} → ${placeById(r.toId)?.name}`, listingId: r.id, journeyId: body.journeyId ?? null,
        details: { routeId: r.id, seatDateKey: key, stand: r.stand, seats, departureTime: body.departureTime ?? r.departureTimes[0], operator: r.operator, permitNote: r.permitNote }, price });
    }) }, 201);
  }
  if (method === 'POST' && path === '/api/bookings/hotels') {
    const { user } = auth(req);
    const d = zod(stayBookingSchema, body); attachJourneyContext(user, d);
    const property = catalogue.properties.find((p) => p.id === d.propertyId);
    if (!property) bad('PROPERTY_NOT_FOUND', 'Property not found', 404);
    const room = property.rooms.find((r) => r.id === d.roomId);
    if (!room) bad('ROOM_NOT_FOUND', 'Room type not found', 404);
    if (d.adults > room.capacityAdults * d.rooms) bad('CAPACITY_EXCEEDED', 'Guest count exceeds room capacity', 409);
    const nights = nightsBetween(d.checkIn, d.checkOut);
    if (nights < 1) bad('INVALID_DATES', 'Check-out must be after check-in');
    // Real availability check across every requested night.
    for (let i = 0; i < nights; i += 1) {
      const date = new Date(`${d.checkIn}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + i);
      const key = `${room.id}:${date.toISOString().slice(0, 10)}`;
      const booked = db.roomAvailability[key] ?? 0;
      if (booked + d.rooms > room.totalRooms) bad('NO_AVAILABILITY', `No availability for ${date.toISOString().slice(0, 10)}`, 409);
    }
    return ok(res, { booking: idempotency(req, () => {
      for (let i = 0; i < nights; i += 1) {
        const date = new Date(`${d.checkIn}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + i);
        const key = `${room.id}:${date.toISOString().slice(0, 10)}`;
        db.roomAvailability[key] = (db.roomAvailability[key] ?? 0) + d.rooms;
      }
      const price = priceStay({ nightlyRatePaise: room.nightlyRatePaise, nights, rooms: d.rooms, taxesPercent: property.taxesPercent });
      return makeBooking(user, { service: property.service, title: property.name, listingId: property.id, journeyId: d.journeyId,
        details: { propertyId: property.id, roomId: room.id, propertyName: property.name, roomName: room.name, checkIn: d.checkIn, checkOut: d.checkOut, nights, rooms: d.rooms, adults: d.adults, children: d.children, guestName: d.guestName, houseRules: property.houseRules, cancellationPolicy: property.cancellationPolicy }, price });
    }) }, 201);
  }
  if (method === 'POST' && path === '/api/bookings/tourism') {
    const { user } = auth(req);
    const d = zod(tourismBookingSchema, body); attachJourneyContext(user, d);
    const pkg = catalogue.tourPackages.find((p) => p.id === d.offeringId);
    const exp = catalogue.experiences.find((e) => e.id === d.offeringId);
    const att = catalogue.attractions.find((a) => a.id === d.offeringId);
    const offering = pkg ?? exp ?? att;
    if (!offering) bad('OFFERING_NOT_FOUND', 'Unknown tourism offering', 404);
    const base = pkg?.pricePaise ?? exp?.pricePaise ?? 0;
    const price = priceTourism({ basePaise: base, guests: d.guests, service: d.service });
    return ok(res, { booking: idempotency(req, () => makeBooking(user, {
      service: d.service, title: offering.name, listingId: offering.id, journeyId: d.journeyId,
      details: { offeringName: offering.name, date: d.date, guests: d.guests, kind: pkg ? 'package' : exp ? 'experience' : 'attraction' }, price,
    })) }, 201);
  }
  if (method === 'POST' && path === '/api/bookings/parcel') {
    const { user } = auth(req);
    const d = zod(parcelBookingSchema, body); attachJourneyContext(user, d);
    const from = placeById(d.pickupId); const to = placeById(d.dropoffId);
    if (!from || !to) bad('PLACE_NOT_FOUND', 'Unknown pickup or delivery point');
    const route = estimateRoute(from, to);
    const price = priceParcel({ distanceKm: route.distanceKm, weightKg: d.weightKg });
    return ok(res, { booking: idempotency(req, () => makeBooking(user, {
      service: 'parcel', title: `Parcel: ${from.name} → ${to.name}`, listingId: null, journeyId: d.journeyId,
      details: { pickup: from, dropoff: to, weightKg: d.weightKg, description: d.description, recipientPhone: d.recipientPhone, distanceKm: Number(route.distanceKm.toFixed(2)) }, price,
    })) }, 201);
  }
  if (method === 'POST' && path === '/api/orders') {
    const { user } = auth(req); rateLimit(req);
    const d = zod(orderSchema, body); attachJourneyContext(user, d);
    return ok(res, { order: idempotency(req, () => createOrder(user, d)) }, 201);
  }

  // ------- bookings & orders (read + server-authoritative transitions) -------
  if (method === 'GET' && path === '/api/bookings') { const { user } = auth(req); return send(res, 200, { items: db.bookings.filter((b) => b.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }); }
  if (method === 'GET' && path === '/api/orders') { const { user } = auth(req); return send(res, 200, { items: db.orders.filter((o) => o.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }); }
  if (method === 'GET' && tail[0] === 'bookings' && tail[1] && tail.length === 2) {
    const { user } = auth(req); const b = db.bookings.find((x) => x.id === tail[1] && x.userId === user.id);
    if (!b) bad('NOT_FOUND', 'Booking not found', 404);
    return send(res, 200, { booking: b, payment: db.payments.find((p) => p.id === b.paymentId) ?? null });
  }
  if (method === 'GET' && tail[0] === 'orders' && tail[1] && tail.length === 2) {
    const { user } = auth(req); const o = db.orders.find((x) => x.id === tail[1] && x.userId === user.id);
    if (!o) bad('NOT_FOUND', 'Order not found', 404);
    return send(res, 200, { order: o, payment: db.payments.find((p) => p.id === o.paymentId) ?? null });
  }
  if (method === 'POST' && tail[0] === 'bookings' && tail[2] === 'transition') {
    const { user } = auth(req);
    const partnerServices = { driver: ['cab', 'shared_taxi', 'parcel'], restaurant: ['food'], grocery: ['grocery'], property: ['hotel', 'homestay', 'tourism', 'experience', 'package'], tour_operator: ['tourism', 'package', 'experience'] };
    const partnerOf = new Set(user.roles.flatMap((r) => partnerServices[r] ?? []));
    const b = db.bookings.find((x) => x.id === tail[1] && (x.userId === user.id || partnerOf.has(x.service)));
    if (!b) bad('NOT_FOUND', 'Booking not found', 404);
    const actor = actorFor(user, b.service);
    const result = transitionBooking(b, body.status, actor, body.note);
    if (!result.ok) bad('ILLEGAL_TRANSITION', result.error, 409);
    Object.assign(b, result.booking);
    if (b.status === 'confirmed') { if (actor === 'partner' && b.service === 'hotel') notify(b.userId, { type: 'hotel.confirmation', reference: b.reference, property: b.title }); notify(b.userId, { type: 'booking.confirmed', reference: b.reference, service: b.service }); }
    if (b.status === 'cancelled') notify(b.userId, { type: 'booking.cancelled', reference: b.reference, service: b.service });
    audit(user.id, 'booking.transition', { bookingId: b.id, status: b.status, actor });
    return ok(res, { booking: b });
  }
  if (method === 'POST' && tail[0] === 'bookings' && tail[2] === 'cancel') {
    const { user } = auth(req);
    const b = db.bookings.find((x) => x.id === tail[1] && x.userId === user.id);
    if (!b) bad('NOT_FOUND', 'Booking not found', 404);
    const result = transitionBooking(b, 'cancelled', 'customer', body.reason ?? 'Cancelled by customer');
    if (!result.ok) bad('CANNOT_CANCEL', result.error, 409);
    Object.assign(b, result.booking);
    if (b.service === 'shared_taxi') {
      // Restore seats on the SAME departure date the booking consumed, not today's date.
      const key = String(b.details.seatDateKey ?? `${b.details.routeId}:${nowIso().slice(0, 10)}`);
      db.sharedSeats[key] = (db.sharedSeats[key] ?? 0) + Number(b.details.seats ?? 0);
    }
    if (b.service === 'hotel' || b.service === 'homestay' || b.service === 'lodge' || b.service === 'guesthouse') {
      // roomId is persisted with the booking so cancellation releases exactly the
      // inventory keys that were reserved, for every night of the stay.
      const roomId = String(b.details.roomId ?? '');
      const checkIn = String(b.details.checkIn ?? ''); const nights = Number(b.details.nights ?? 0); const rooms = Number(b.details.rooms ?? 1);
      for (let i = 0; i < nights; i += 1) {
        const date = new Date(`${checkIn}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + i);
        const key = `${roomId}:${date.toISOString().slice(0, 10)}`;
        db.roomAvailability[key] = Math.max(0, (db.roomAvailability[key] ?? 0) - rooms);
      }
    }
    notify(b.userId, { type: 'booking.cancelled', reference: b.reference, service: b.service });
    audit(user.id, 'booking.cancelled', { bookingId: b.id });
    if (b.paymentId) {
      const p = db.payments.find((x) => x.id === b.paymentId);
      if (p && p.status === 'captured') {
        const amount = refundableAmount(p.amountPaise, { kind: 'partial', percent: 80, flatFeePaise: 0 });
        p.status = 'refunded'; p.updatedAt = nowIso();
        db.transactions.push({ id: makeId('txn'), paymentId: p.id, type: 'refund', amountPaise: amount, note: 'Automatic cancellation refund (80%)', createdAt: nowIso() });
        notify(user.id, { type: 'refund.issued', reference: b.reference, amount: formatINR(amount) });
      }
    }
    return ok(res, { booking: b });
  }
  if (method === 'POST' && tail[0] === 'bookings' && tail[2] === 'review') {
    const { user } = auth(req);
    const b = db.bookings.find((x) => x.id === tail[1] && x.userId === user.id);
    if (!b) bad('NOT_FOUND', 'Booking not found', 404);
    if (b.status !== 'completed') bad('REVIEW_NOT_ALLOWED', 'Only completed bookings can be reviewed', 409);
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) bad('INVALID_RATING', 'Rating must be 1–5');
    if (db.reviews.some((r) => r.bookingId === b.id)) bad('DUPLICATE_REVIEW', 'You already reviewed this booking', 409);
    const review = { id: makeId('rev'), bookingId: b.id, listingId: b.listingId, userId: user.id, rating, comment: String(body.comment ?? '').slice(0, 500), createdAt: nowIso(), source: 'verified-booking' };
    db.reviews.push(review); audit(user.id, 'review.created', { bookingId: b.id });
    return ok(res, { review }, 201);
  }
  if (method === 'POST' && tail[0] === 'orders' && tail[2] === 'transition') {
    const { user } = auth(req);
    const o = db.orders.find((x) => x.id === tail[1] && x.userId === user.id);
    if (!o) bad('NOT_FOUND', 'Order not found', 404);
    if (!transitionOrderStatus(o.status, body.status)) bad('ILLEGAL_TRANSITION', `Illegal order status change ${o.status} → ${body.status}`, 409);
    if (actorFor(user, o.service) !== 'partner' && body.status !== 'cancelled') bad('FORBIDDEN', 'Only the partner can advance an order', 403);
    if (body.status === 'cancelled' && o.service === 'grocery') {
      for (const it of o.items) db.inventory[`${o.listingId}:${it.id}`] = (db.inventory[`${o.listingId}:${it.id}`] ?? 0) + it.quantity;
    }
    o.status = body.status; o.updatedAt = nowIso();
    notify(o.userId, { type: 'delivery.tracking', reference: o.reference, status: o.status.replace(/_/g, ' ') });
    if (o.status === 'accepted') notify(o.userId, { type: 'restaurant.accepted', reference: o.reference, restaurant: catalogue.restaurants.find((r) => r.id === o.listingId)?.name ?? catalogue.groceryStores.find((s) => s.id === o.listingId)?.name ?? 'Store' });
    audit(user.id, 'order.transition', { orderId: o.id, status: o.status });
    return ok(res, { order: o });
  }

  // ------- payments (sandbox, server-verified) -------
  if (method === 'POST' && path === '/api/payments/init') {
    const { user } = auth(req); rateLimit(req, 'payment', 60);
    const d = zod(paymentInitSchema, body);
    const { target } = paymentTarget(user.id, d.bookingId, d.orderId);
    if (d.amountPaise !== target.price.totalPaise) bad('AMOUNT_MISMATCH', 'Amount does not match the server-side total', 409);
    return ok(res, { payment: idempotency(req, () => {
      const existing = db.payments.find((p) => p.bookingId === d.bookingId && p.orderId === d.orderId);
      if (existing) return existing;
      const p = { id: makeId('pay'), bookingId: d.bookingId, orderId: d.orderId, userId: user.id, method: d.method,
        status: 'requires_action', amountPaise: d.amountPaise, provider: 'sandbox', providerReference: null,
        idempotencyKey: d.idempotencyKey, createdAt: nowIso(), updatedAt: nowIso() };
      db.payments.push(p);
      if (d.bookingId) { const b = db.bookings.find((x) => x.id === d.bookingId); if (b) b.paymentId = p.id; }
      if (d.orderId) { const o = db.orders.find((x) => x.id === d.orderId); if (o) o.paymentId = p.id; }
      audit(user.id, 'payment.initiated', { paymentId: p.id, method: d.method });
      return p;
    }) }, 201);
  }
  if (method === 'POST' && path === '/api/payments/webhook') {
    const raw = req.rawBody ?? JSON.stringify(body);
    verifyWebhook(raw, req.headers['x-gowayy-signature']);
    return ok(res, { received: true });
  }
  if (method === 'POST' && tail[0] === 'payments' && tail[2] === 'sandbox-capture') {
    const { user } = auth(req);
    const p = db.payments.find((x) => x.id === tail[1] && x.userId === user.id);
    if (!p) bad('NOT_FOUND', 'Payment not found', 404);
    if (p.status === 'captured') return ok(res, { payment: p, alreadyCaptured: true });
    // The SERVER simulates the provider: it signs a payload and sends it through
    // the same signature-verifying webhook path. No client-supplied success is trusted.
    const raw = JSON.stringify({ eventId: makeId('evt'), type: 'payment.captured', paymentId: p.id, amountPaise: p.amountPaise, providerReference: `sandbox_${randomToken(8)}` });
    verifyWebhook(raw, createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex'));
    return ok(res, { payment: p, sandbox: true, note: 'Provider event was signed and verified server-side through the webhook handler.' });
  }
  if (method === 'POST' && tail[0] === 'payments' && tail[2] === 'refund') {
    const { user } = auth(req);
    const p = db.payments.find((x) => x.id === tail[1] && x.userId === user.id);
    if (!p) bad('NOT_FOUND', 'Payment not found', 404);
    if (p.status !== 'captured') bad('NOT_REFUNDABLE', 'Only captured payments can be refunded', 409);
    const amount = refundableAmount(p.amountPaise, { kind: body.full ? 'full' : 'partial', percent: 80 });
    if (amount <= 0) bad('NOT_REFUNDABLE', 'Refund amount is zero');
    p.status = 'refunded'; p.updatedAt = nowIso();
    db.transactions.push({ id: makeId('txn'), paymentId: p.id, type: 'refund', amountPaise: amount, note: body.reason ?? 'Customer refund request', createdAt: nowIso() });
    const ref = p.bookingId ? db.bookings.find((b) => b.id === p.bookingId)?.reference : db.orders.find((o) => o.id === p.orderId)?.reference;
    notify(user.id, { type: 'refund.issued', reference: ref ?? p.id, amount: formatINR(amount) });
    audit(user.id, 'payment.refunded', { paymentId: p.id, amountPaise: amount });
    return ok(res, { payment: p, refundPaise: amount });
  }
  if (method === 'GET' && path === '/api/payments') { const { user } = auth(req); return send(res, 200, { items: db.payments.filter((p) => p.userId === user.id) }); }
  if (method === 'GET' && path === '/api/transactions') { const { user } = auth(req); const ids = new Set(db.payments.filter((p) => p.userId === user.id).map((p) => p.id)); return send(res, 200, { items: db.transactions.filter((t) => ids.has(t.paymentId)) }); }

  // ------- notifications, support, addresses, saved places -------
  if (method === 'GET' && path === '/api/notifications') { const { user } = auth(req); const items = db.notifications.filter((n) => n.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); return send(res, 200, { items, unreadCount: items.filter((n) => !n.readAt).length }); }
  if (method === 'POST' && tail[0] === 'notifications' && tail[1] === 'read-all') { const { user } = auth(req); db.notifications.filter((n) => n.userId === user.id).forEach((n) => { n.readAt ??= nowIso(); }); return ok(res, { read: true }); }
  if (method === 'POST' && tail[0] === 'notifications' && tail[2] === 'read') { const { user } = auth(req); const n = db.notifications.find((x) => x.id === tail[1] && x.userId === user.id); if (!n) bad('NOT_FOUND', 'Notification not found', 404); n.readAt ??= nowIso(); return ok(res, { notification: n }); }
  if (tail[0] === 'support' && tail[1] === 'tickets') {
    const { user } = auth(req);
    if (method === 'GET') return send(res, 200, { items: db.tickets.filter((t) => t.userId === user.id) });
    if (method === 'POST') { const d = zod(supportTicketSchema, body); const t = { id: makeId('tkt'), userId: user.id, subject: d.subject, body: d.body, status: 'open', createdAt: nowIso() }; db.tickets.push(t); return ok(res, { ticket: t }, 201); }
  }
  if (path === '/api/addresses') {
    const { user } = auth(req);
    if (method === 'GET') return send(res, 200, { items: db.addresses.filter((a) => a.userId === user.id) });
    if (method === 'POST') { const d = zod(addressSchema, body); const a = { id: makeId('adr'), userId: user.id, ...d }; db.addresses.push(a); return ok(res, { address: a }, 201); }
  }
  if (tail[0] === 'addresses' && tail[1] && method === 'DELETE') { const { user } = auth(req); db.addresses = db.addresses.filter((a) => !(a.id === tail[1] && a.userId === user.id)); return ok(res, { deleted: true }); }
  if (path === '/api/saved-places') {
    const { user } = auth(req);
    if (method === 'GET') return send(res, 200, { items: db.savedPlaces.filter((s) => s.userId === user.id) });
    if (method === 'POST') { const place = placeById(body.placeId); if (!place) bad('PLACE_NOT_FOUND', 'Unknown place'); const s = { id: makeId('svp'), userId: user.id, label: String(body.label ?? place.name).slice(0, 40), place }; db.savedPlaces.push(s); return ok(res, { savedPlace: s }, 201); }
  }
  if (tail[0] === 'saved-places' && tail[1] && method === 'DELETE') { const { user } = auth(req); db.savedPlaces = db.savedPlaces.filter((s) => !(s.id === tail[1] && s.userId === user.id)); return ok(res, { deleted: true }); }

  // ------- partner mode (role-specific section, NOT an admin panel) -------
  if (method === 'POST' && path === '/api/partners/claim') {
    const { user } = auth(req);
    const role = body.role;
    const valid = { restaurant: catalogue.restaurants, grocery: catalogue.groceryStores, property: catalogue.properties };
    if (role !== 'tour_operator' && !valid[role]) bad('INVALID_ROLE', 'Choose restaurant, grocery, property or tour_operator partner role');
    if (role !== 'tour_operator' && !valid[role].some((x) => x.id === body.listingId)) bad('LISTING_NOT_FOUND', 'Unknown partner listing', 404);
    if (!user.roles.includes(role)) user.roles.push(role);
    db.partners ??= [];
    db.partners.push({ userId: user.id, role, listingId: body.listingId ?? null, claimedAt: nowIso(), demo: true });
    audit(user.id, 'partner.claimed', { role, listingId: body.listingId ?? null });
    return ok(res, { user: publicUser(user), demoNotice: 'Development partner claim — production requires document verification.' });
  }
  if (method === 'POST' && path === '/api/partners/drivers') {
    const { user } = auth(req);
    const d = zod(driverRegistrationSchema, body);
    if (db.drivers.some((x) => x.userId === user.id)) bad('DRIVER_EXISTS', 'A driver profile already exists for this account', 409);
    if (!user.roles.includes('driver')) user.roles.push('driver');
    const driver = { id: makeId('drv'), userId: user.id, name: d.name, phone: d.phone, vehicleClass: d.vehicleClass,
      services: d.services, verification: 'pending', online: false, activeJobId: null,
      documents: { licence: d.licenceNumber, registration: d.vehicleRegistration, insurance: d.insuranceNumber }, createdAt: nowIso() };
    db.drivers.push(driver); audit(user.id, 'driver.registered', { driverId: driver.id });
    return ok(res, { driver, user: publicUser(user) }, 201);
  }
  if (method === 'GET' && path === '/api/partners/drivers/me') { const { user } = auth(req); return send(res, 200, { driver: db.drivers.find((d) => d.userId === user.id) ?? null, dispatchRules: DEFAULT_DISPATCH_RULES }); }
  if (method === 'PATCH' && path === '/api/partners/drivers/me') {
    const { user } = auth(req); const driver = db.drivers.find((d) => d.userId === user.id);
    if (!driver) bad('DRIVER_NOT_FOUND', 'Register as a driver first', 404);
    if (typeof body.online === 'boolean') { if (body.online && driver.verification !== 'verified') bad('NOT_VERIFIED', 'Verify your documents before going online', 409); driver.online = body.online; }
    if (Array.isArray(body.services)) {
      const eligible = DEFAULT_DISPATCH_RULES.eligibleServicesByVehicle[driver.vehicleClass] ?? [];
      if (body.services.some((s) => !eligible.includes(s))) bad('INELIGIBLE_SERVICE', 'This vehicle cannot provide one of the selected services', 409);
      driver.services = body.services;
    }
    audit(user.id, 'driver.updated', { online: driver.online, services: driver.services });
    return ok(res, { driver });
  }
  if (method === 'POST' && path === '/api/partners/drivers/verify-demo') {
    const { user } = auth(req); const driver = db.drivers.find((d) => d.userId === user.id);
    if (!driver) bad('DRIVER_NOT_FOUND', 'Register as a driver first', 404);
    driver.verification = 'verified';
    audit(user.id, 'driver.demo-verified', { note: 'DEMO ONLY — not a real document check' });
    return ok(res, { driver, demoNotice: 'Demo verification only. Production requires real document review and permits.' });
  }
  if (method === 'GET' && path === '/api/partners/requests') {
    const { user } = auth(req);
    const partnerServices = { driver: ['cab', 'shared_taxi', 'parcel'], restaurant: ['food'], grocery: ['grocery'], property: ['hotel', 'homestay', 'tourism', 'experience', 'package'], tour_operator: ['tourism', 'package', 'experience'] };
    const services = new Set(user.roles.flatMap((r) => partnerServices[r] ?? []));
    return send(res, 200, {
      bookings: db.bookings.filter((b) => services.has(b.service) && ['requested', 'awaiting_payment', 'confirmed'].includes(b.status)),
      orders: db.orders.filter((o) => services.has(o.service) && ['created', 'accepted', 'preparing'].includes(o.status)),
      claimedListings: (db.partners ?? []).filter((p) => p.userId === user.id),
    });
  }
  if (method === 'GET' && path === '/api/partners/jobs') { const { user } = auth(req); return send(res, 200, { items: db.jobs.filter((j) => j.status === 'open'), driver: db.drivers.find((d) => d.userId === user.id) ?? null }); }
  if (method === 'POST' && tail[0] === 'partners' && tail[1] === 'jobs' && tail[3] === 'accept') {
    const { user } = auth(req);
    const driver = db.drivers.find((d) => d.userId === user.id);
    if (!driver) bad('DRIVER_NOT_FOUND', 'Register as a driver first', 404);
    const job = db.jobs.find((j) => j.id === tail[2]);
    if (!job || job.status !== 'open') bad('JOB_UNAVAILABLE', 'This job is no longer available', 409);
    const active = db.jobs.filter((j) => j.driverId === driver.id && j.status === 'accepted');
    const eligibility = checkEligibility(driver, job, active, DEFAULT_DISPATCH_RULES);
    if (!eligibility.eligible) bad('DISPATCH_REJECTED', eligibility.reasons.join('; '), 409);
    job.status = 'accepted'; job.driverId = driver.id; driver.activeJobId = job.id;
    if (job.bookingId) {
      const b = db.bookings.find((x) => x.id === job.bookingId);
      if (b) { const t = transitionBooking(b, 'assigned', 'system', `Assigned to ${driver.name}`); if (t.ok) Object.assign(b, t.booking); notify(b.userId, { type: 'driver.assigned', reference: b.reference, driverName: driver.name, vehicle: driver.vehicleClass }); }
    }
    if (job.orderId) {
      const o = db.orders.find((x) => x.id === job.orderId);
      if (o && transitionOrderStatus(o.status, 'accepted')) { o.status = 'accepted'; o.updatedAt = nowIso(); notify(o.userId, { type: 'delivery.tracking', reference: o.reference, status: 'accepted' }); }
    }
    audit(user.id, 'job.accepted', { jobId: job.id });
    return ok(res, { job, driver });
  }

  // ------- marketplace commerce + partner hub modules -------
  await commerce.handle(req, res, method, tail, body, q, send, ok);
  if (res.headersSent) return;
  await partnerHub.handle(req, res, method, tail, body, q, send, ok);
  if (res.headersSent) return;

  if (method === 'POST' && path === '/api/dev/reset' && DEMO_MODE) {
    db = emptyDb(); seedInventory(); audit('dev', 'db.reset', {});
    return ok(res, { reset: true, notice: 'Development database cleared.' });
  }

  bad('NOT_FOUND', `No endpoint for ${method} ${path}`, 404);
}

function emailOf(v) { return String(v ?? '').trim().toLowerCase(); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, idempotency-key, x-gowayy-signature', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' }); return res.end(); }
  try {
    await route(req, res, url);
  } catch (e) {
    if (e instanceof HttpError || (e && typeof e === 'object' && typeof e.status === 'number')) {
      send(res, e.status, { error: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) });
    } else { console.error('[dev-api] unhandled error', e); send(res, 500, { error: 'INTERNAL_ERROR', message: 'An unexpected server error occurred' }); }
  }
});
server.listen(PORT, '0.0.0.0', () => console.log(`[dev-api] listening on 0.0.0.0:${PORT} (${DEMO_MODE ? 'DEVELOPMENT' : 'production'} mode, demo OTP: ${OTP_PROVIDER})`));
