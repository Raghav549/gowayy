/**
 * GOWAYY Edge Function gateway.
 *
 * All mutations are server-authoritative: the caller's Supabase JWT is verified with
 * the Auth API, then the request is forwarded to a SECURITY DEFINER PostgreSQL RPC
 * using that same JWT so auth.uid() is the verified account. Reads go through
 * PostgREST with the caller's token so Row Level Security applies. No service-role
 * key is ever sent to, or accepted from, a client.
 */
import { config, jsonResponse, errorResponse, HttpError, readJson } from '../_shared/config.ts';
import { preparePayment, processRefundResult } from '../_shared/payments.ts';
import {
  requireCaller, select, insert, patch, rpc, serviceRpc, publicRpc, authAdmin,
  passwordLogin, requestPhoneOtp, verifyPhoneOtp, authLogout, type Caller,
} from '../_shared/supabase.ts';
import {
  camelize, bookingPayload, orderPayload, vehicleShape, journeyShape, driverShape, jobShape,
} from '../_shared/normalize.ts';
import {
  parse, registerSchema, loginSchema, forgotSchema, resetSchema, otpSchema, phoneRequestSchema, phoneVerifySchema, resendSchema, idemSchema,
} from '../_shared/validation.ts';

type A = Record<string, unknown>;
type Handler = (caller: Caller | null, a: A) => Promise<unknown>;
const s = (a: A, k: string): string => (typeof a[k] === 'string' ? a[k] as string : '');
const n = (a: A, k: string): number | undefined => (typeof a[k] === 'number' ? a[k] as number : undefined);
const obj = (a: A, k: string): A => (a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? a[k] as A : {});
const camel = <T>(v: unknown): T => camelize(v) as T;
const me = (token: string) => rpc<A>('rpc_me', {}, token);
const tokenOf = (c: Caller | null): string => {
  if (!c) throw new HttpError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return c.token;
};

/** Real email provider handoff. Never claims an email was sent without a provider. */
async function sendVerificationEmail(kind: string, email: string, payload: A): Promise<void> {
  const providerUrl = config().otpProviderUrl;
  if (!providerUrl) {
    throw new HttpError(503, 'EMAIL_PROVIDER_NOT_CONFIGURED',
      'Email verification is not configured. Set GOWAYY_EMAIL_PROVIDER_URL or enable the clearly labelled demo OTP adapter.');
  }
  const r = await fetch(providerUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, email, ...payload }),
  });
  if (!r.ok) throw new HttpError(502, 'EMAIL_PROVIDER_FAILED', 'The email provider rejected the request.');
}

const PUBLIC = new Set([
  'health', 'catalog', 'search', 'recommendations', 'credits', 'estimateRoute',
  'storefront', 'storeDetail', 'banners', 'posters', 'destinations', 'destination',
  'serviceAreas', 'serviceAreaCheck', 'commerceCategories', 'commerceProducts',
  'experienceOfferings', 'experienceSlots', 'experienceQuote',
  'productDetail', 'recommendedStores', 'paymentMethods',
  'register', 'resendOtp', 'verifyOtp', 'requestPhoneOtp', 'verifyPhoneOtp', 'login', 'forgotPassword', 'resetPassword',
]);

function orderView(row: unknown): A {
  const order = camel<A>(row);
  if (order.service === 'marketplace' && typeof order.deliveryAddress === 'string') {
    try { order.deliveryAddress = JSON.parse(order.deliveryAddress); } catch { /* retain the stored text */ }
  }
  return order;
}

async function cancellationView(value: unknown): Promise<A> {
  const result = camel<A>(value);
  if (result.refundResult) result.refundResult = await processRefundResult(result.refundResult);
  return result;
}

async function adminRequest(c: Caller | null, path: string, method = 'GET', input: A = {}, query: A = {}): Promise<unknown> {
  const token = tokenOf(c);
  const url = new URL(path, 'https://gateway.local');
  const resource = url.pathname.split('/').filter(Boolean)[0] ?? '';
  const mergedQuery = { ...Object.fromEntries(url.searchParams.entries()), ...query };
  const result = method === 'GET'
    ? await rpc('rpc_admin_read', { p_resource: resource, p_query: mergedQuery }, token)
    : await rpc('rpc_admin_write', { p_path: url.pathname, p_method: method, p_payload: input }, token);
  const shaped = camel<A>(result);
  return shaped?.refund ? await processRefundResult(shaped) : shaped;
}

async function uploadImage(c: Caller | null, input: A): Promise<{ url: string }> {
  const caller = tokenOf(c);
  void caller;
  const mimeType = s(input, 'mimeType');
  const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const extension = extensions[mimeType];
  if (!extension) throw new HttpError(415, 'UNSUPPORTED_IMAGE_TYPE', 'Choose a JPEG, PNG or WebP image.');
  const encoded = s(input, 'dataBase64');
  if (!encoded || !/^[a-zA-Z0-9+/=\r\n]+$/.test(encoded)) throw new HttpError(422, 'INVALID_IMAGE_DATA', 'The uploaded image is not valid base64 data.');
  let binary: string;
  try { binary = atob(encoded); } catch { throw new HttpError(422, 'INVALID_IMAGE_DATA', 'The uploaded image is not valid base64 data.'); }
  if (binary.length > 2_500_000) throw new HttpError(413, 'IMAGE_TOO_LARGE', 'Images must be smaller than 2.5 MB.');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const valid = mimeType === 'image/png'
    ? bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    : mimeType === 'image/jpeg'
      ? bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.length > 12 && binary.slice(0, 4) === 'RIFF' && binary.slice(8, 12) === 'WEBP';
  if (!valid) throw new HttpError(422, 'IMAGE_CONTENT_MISMATCH', 'The file contents do not match the declared image type.');
  const { url, serviceKey, anonKey } = config();
  const path = `${c!.id}/${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${url}/storage/v1/object/gowayy-images/${path}`, {
    method: 'POST',
    headers: { apikey: anonKey, authorization: `Bearer ${serviceKey}`, 'content-type': mimeType, 'x-upsert': 'false' },
    body: bytes,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string; error?: string };
    throw new HttpError(502, 'STORAGE_UPLOAD_FAILED', payload.message ?? payload.error ?? 'Supabase Storage rejected the image.');
  }
  return { url: `${url}/storage/v1/object/public/gowayy-images/${path}` };
}

const handlers: Record<string, Handler> = {
  // ---- public read models --------------------------------------------------
  health: async () => ({ ok: true, service: 'gowayy', backend: 'supabase', url: config().url }),
  catalog: async () => publicRpc<A>('rpc_catalog', {}),
  search: async (_c, a) => camel(await publicRpc<unknown[]>('rpc_search', { p_q: s(a, 'q') })),
  recommendations: async (_c, a) => publicRpc<A>('rpc_recommendations', { p_destination_id: s(a, 'destinationId') }),
  credits: async () => publicRpc<A>('rpc_credits', {}),
  estimateRoute: async (_c, a) => {
    const r = await publicRpc<A>('rpc_estimate_route', {
      p_from: s(a, 'from'), p_to: s(a, 'to'), p_vehicle: a.vehicle ? s(a, 'vehicle') : null,
    });
    return { route: r.route, vehicle: vehicleShape(r.vehicle) };
  },
  storefront: async () => publicRpc<A>('rpc_storefront', {}),
  storeDetail: async (_c, a) => {
    const store = await publicRpc<A | null>('rpc_store_detail', { p_slug: s(a, 'id') });
    if (!store) throw new HttpError(404, 'STORE_NOT_FOUND', 'Store not found.');
    return store;
  },
  banners: async () => ({ items: await publicRpc<unknown[]>('rpc_banners', {}) }),
  posters: async (_c, a) => publicRpc<A>('rpc_posters', { p_kind: s(a, 'kind') || null }),
  destinations: async () => ({ items: await publicRpc<unknown[]>('rpc_destinations', {}) }),
  destination: async (_c, a) => {
    const destination = await publicRpc<A | null>('rpc_destination', { p_slug: s(a, 'slug') });
    if (!destination) throw new HttpError(404, 'DESTINATION_NOT_FOUND', 'Destination not found.');
    return { destination };
  },
  serviceAreas: async () => ({ items: await publicRpc<unknown[]>('rpc_service_areas', {}) }),
  serviceAreaCheck: async (_c, a) => {
    const pincode = s(a, 'pincode');
    if (!/^\d{6}$/.test(pincode)) throw new HttpError(422, 'INVALID_PINCODE', 'Enter a six-digit PIN code.');
    const areas = await publicRpc<A[]>('rpc_service_areas', {});
    const matches = (key: 'foodPincodes' | 'groceryPincodes') => areas.filter((area) => Array.isArray(area[key]) && (area[key] as unknown[]).includes(pincode));
    const food = matches('foodPincodes'); const grocery = matches('groceryPincodes');
    return {
      pincode,
      food: { supported: food.length > 0, cities: food.map((area) => area.city) },
      grocery: { supported: grocery.length > 0, cities: grocery.map((area) => area.city) },
      areas: areas.map((area) => ({ id: area.id, city: area.city, state: area.state })),
    };
  },
  experienceOfferings: async (_c, a) => {
    const kind = s(a, 'kind');
    if (kind && kind !== 'experience' && kind !== 'package') throw new HttpError(422, 'INVALID_OFFERING_KIND', 'Choose experience or package.');
    const result = await publicRpc<A>('rpc_experience_offerings', { p_destination_id: s(a, 'destinationId') || null });
    const items = Array.isArray(result.items) ? result.items as A[] : [];
    return { items: kind ? items.filter((item) => item.kind === kind) : items };
  },
  experienceSlots: async (_c, a) => {
    const date = s(a, 'date');
    if (!s(a, 'offeringId') || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(422, 'VALIDATION_FAILED', 'Choose an offering and a valid date.');
    return publicRpc<A>('rpc_experience_slots', { p_offering_id: s(a, 'offeringId'), p_date: date });
  },
  experienceQuote: async (_c, a) => {
    const guests = n(a, 'guests');
    if (!s(a, 'slotId') || !Number.isInteger(guests) || guests! < 1 || guests! > 20) throw new HttpError(422, 'VALIDATION_FAILED', 'Choose a slot and between 1 and 20 guests.');
    return publicRpc<A>('rpc_experience_quote', { p_slot_id: s(a, 'slotId'), p_guests: guests });
  },

  // ---- authentication ------------------------------------------------------
  register: async (_c, a) => {
    const d = parse(registerSchema, a);
    const created = await authAdmin<{ id: string }>('/admin/users', 'POST', {
      email: d.email, password: d.password, email_confirm: false,
      user_metadata: { firstName: d.firstName, lastName: d.lastName },
    });
    try {
      const result = await publicRpc<A>('rpc_register', {
        p_payload: { email: d.email, firstName: d.firstName, lastName: d.lastName, authUserId: created.id },
      });
      if (result.demoMode !== true) {
        await sendVerificationEmail('registration', d.email, {
          registrationId: result.registrationId, code: result.demoCode ?? null,
        });
      }
      return result;
    } catch (error) {
      // Never leave an orphaned, unconfirmed auth user behind on a failed registration.
      await authAdmin(`/admin/users/${created.id}`, 'DELETE').catch(() => {});
      throw error;
    }
  },
  resendOtp: async (_c, a) => {
    const d = parse(resendSchema, a);
    const result = await publicRpc<A>('rpc_resend_otp', { p_registration_id: d.registrationId });
    if (result.demoMode !== true) {
      await sendVerificationEmail('resend', s(result, 'email'), {
        registrationId: d.registrationId, code: result.demoCode ?? null,
      });
    }
    return result;
  },
  verifyOtp: async (_c, a) => {
    const d = parse(otpSchema, a);
    const v = await publicRpc<A>('rpc_verify_otp', { p_registration_id: d.registrationId, p_code: d.code });
    if (v.verified !== true) return v;
    const userId = s(v, 'authUserId');
    const email = s(v, 'email');
    if (!userId) throw new HttpError(409, 'REGISTRATION_INCOMPLETE', 'Start registration again.');
    if (!d.password) throw new HttpError(422, 'PASSWORD_REQUIRED',
      'The password is needed once, at verification, to create your session. It is never stored by this service.');
    await authAdmin(`/admin/users/${userId}`, 'PUT', { email_confirm: true });
    await serviceRpc('rpc_finalize_registration', { p_registration_id: d.registrationId });
    const session = await passwordLogin(email, d.password);
    const user = await me(session.access_token);
    return {
      verified: true, user,
      session: { token: session.access_token, userId, expiresAt: new Date(Date.now() + session.expires_in * 1000).toISOString() },
    };
  },
  requestPhoneOtp: async (_c, a) => {
    const d = parse(phoneRequestSchema, a);
    const guard = await publicRpc<A>('rpc_phone_otp_request_guard', { p_phone: d.phone });
    await requestPhoneOtp(d.phone);
    return { accepted: true, resendAfterSeconds: guard.resendAfterSeconds ?? 60 };
  },
  verifyPhoneOtp: async (_c, a) => {
    const d = parse(phoneVerifySchema, a);
    await publicRpc<A>('rpc_phone_otp_verify_guard', { p_phone: d.phone });
    const session = await verifyPhoneOtp(d.phone, d.code);
    await serviceRpc('rpc_finalize_phone_auth', {
      p_payload: { authUserId: session.user.id, phone: d.phone, firstName: d.firstName ?? null, lastName: d.lastName ?? null },
    });
    const user = await me(session.access_token);
    return {
      user,
      session: { token: session.access_token, userId: session.user.id, expiresAt: new Date(Date.now() + session.expires_in * 1000).toISOString() },
    };
  },
  login: async (_c, a) => {
    const d = parse(loginSchema, a);
    const session = await passwordLogin(d.email, d.password);
    const user = await me(session.access_token);
    return {
      user,
      session: { token: session.access_token, userId: session.user.id, expiresAt: new Date(Date.now() + session.expires_in * 1000).toISOString() },
    };
  },
  forgotPassword: async (_c, a) => {
    const d = parse(forgotSchema, a);
    const result = await publicRpc<A>('rpc_forgot_password', { p_email: d.email });
    if (result.demoCode == null) {
      await sendVerificationEmail('password-reset', d.email, {
        resetId: result.resetId, code: null,
      });
    }
    return result;
  },
  resetPassword: async (_c, a) => {
    const d = parse(resetSchema, a);
    const v = await publicRpc<A>('rpc_verify_reset', { p_reset_id: d.resetId, p_code: d.code });
    if (!s(v, 'authUserId')) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'No account matches this reset request.');
    await authAdmin(`/admin/users/${s(v, 'authUserId')}`, 'PUT', { password: d.password });
    return { reset: true };
  },
  me: async (c) => me(tokenOf(c)),
  updateProfile: async (c, a) => {
    const token = tokenOf(c);
    await patch('profiles', `id=eq.${c!.id}`, {
      ...(typeof a.firstName === 'string' ? { first_name: a.firstName } : {}),
      ...(typeof a.lastName === 'string' ? { last_name: a.lastName } : {}),
    }, token);
    return me(token);
  },
  logout: async (c) => { await authLogout(tokenOf(c)); },
  deleteAccount: async (c) => {
    const token = tokenOf(c);
    await rpc('rpc_delete_account', {}, token);
    await authAdmin(`/admin/users/${c!.id}`, 'DELETE');
  },

  // ---- connected journeys --------------------------------------------------
  createJourney: async (c, a) => journeyShape(await rpc<A>('rpc_create_journey', { p_draft: a.draft ?? {} }, tokenOf(c))),
  journeys: async (c) => {
    const rows = await select<A>('journeys', 'select=*&order=updated_at.desc', tokenOf(c));
    return rows.map(journeyShape);
  },
  journey: async (c, a) => {
    const r = await rpc<A>('rpc_journey_components', { p_id: s(a, 'id') }, tokenOf(c));
    return { journey: journeyShape(r.journey as A), components: camel(r.components) };
  },
  updateJourney: async (c, a) => journeyShape(await rpc<A>('rpc_update_journey', { p_id: s(a, 'id'), p_patch: a.patch ?? {} }, tokenOf(c))),

  // ---- bookings and orders -------------------------------------------------
  bookCab: (c, a) => createBooking(c, 'cab', a),
  bookSharedTaxi: (c, a) => createBooking(c, 'shared_taxi', a),
  bookStay: (c, a) => createBooking(c, 'hotel', a),
  bookTourism: (c, a) => createBooking(c, s(obj(a, 'input'), 'service') || 'tourism', a),
  bookParcel: (c, a) => createBooking(c, 'parcel', a),
  placeOrder: async (c, a) => {
    parse(idemSchema, { idempotencyKey: s(a, 'idempotencyKey') });
    const service = s(obj(a, 'input'), 'service') === 'grocery' ? 'grocery' : 'food';
    const r = await rpc<A>('rpc_place_order', {
      p_service: service, p_payload: orderPayload(service, obj(a, 'input')), p_idem: s(a, 'idempotencyKey'),
    }, tokenOf(c));
    return camel(r);
  },
  bookings: async (c) => camel(await select('customer_bookings', 'select=*&order=created_at.desc', tokenOf(c))),
  booking: async (c, a) => {
    const token = tokenOf(c); const id = s(a, 'id');
    const rows = await select<A>('customer_bookings', `select=*&id=eq.${id}`, token);
    if (!rows.length) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    const booking = camel(rows[0]);
    const payments = await select<A>('payments', `select=*&booking_id=eq.${id}&order=created_at.desc`, token);
    return { booking, payment: payments.length ? camel(payments[0]) : null };
  },
  orders: async (c) => (await select('customer_orders', 'select=*&order=created_at.desc', tokenOf(c))).map(orderView),
  order: async (c, a) => {
    const token = tokenOf(c); const id = s(a, 'id');
    const rows = await select<A>('customer_orders', `select=*&id=eq.${id}`, token);
    if (!rows.length) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const payments = await select<A>('payments', `select=*&order_id=eq.${id}&order=created_at.desc`, token);
    return { order: orderView(rows[0]), payment: payments.length ? camel(payments[0]) : null };
  },
  orderDetail: async (c, a) => handlers.order(c, a),
  transitionBooking: async (c, a) => camel(await rpc('rpc_transition_booking', {
    p_id: s(a, 'id'), p_status: s(a, 'status'), p_note: a.note ?? null,
  }, tokenOf(c))),
  cancelBooking: async (c, a) => cancellationView(await rpc('rpc_cancel_booking', { p_id: s(a, 'id'), p_reason: s(a, 'reason') }, tokenOf(c))),
  reviewBooking: async (c, a) => camel(await rpc('rpc_review_booking', {
    p_id: s(a, 'id'), p_rating: n(a, 'rating') ?? 0, p_comment: s(a, 'comment'),
  }, tokenOf(c))),
  transitionOrder: async (c, a) => camel(await rpc('rpc_transition_order', { p_id: s(a, 'id'), p_status: s(a, 'status') }, tokenOf(c))),
  cancelOrder: async (c, a) => cancellationView(await rpc('rpc_cancel_order', { p_id: s(a, 'id'), p_reason: s(a, 'reason') }, tokenOf(c))),

  // ---- payments ------------------------------------------------------------
  initPayment: async (c, a) => {
    parse(idemSchema, { idempotencyKey: s(obj(a, 'input'), 'idempotencyKey') });
    const input = obj(a, 'input');
    const requestedMethod = String(input.method ?? 'upi');
    const method = requestedMethod === 'card' || requestedMethod === 'netbanking' ? 'gateway' : requestedMethod;
    const payment = camel<A>(await rpc('rpc_init_payment', { p_payload: {
      bookingId: input.bookingId ?? null, orderId: input.orderId ?? null,
      method, amountPaise: input.amountPaise ?? null,
      idempotencyKey: input.idempotencyKey,
    } }, tokenOf(c)));
    return await preparePayment(payment);
  },
  captureSandboxPayment: async (c, a) => camel(await rpc('rpc_capture_sandbox_payment', { p_id: s(a, 'id') }, tokenOf(c))),
  refundPayment: async (c, a) => processRefundResult(camel<A>(await rpc('rpc_refund_payment', {
    p_id: s(a, 'id'), p_full: a.full !== false, p_reason: s(a, 'reason'),
  }, tokenOf(c)))),
  payments: async (c) => camel(await select('payments', 'select=*&order=created_at.desc', tokenOf(c))),
  transactions: async (c) => camel(await select('transactions', 'select=*&order=created_at.desc', tokenOf(c))),

  // ---- notifications, support and account data -----------------------------
  notifications: async (c) => {
    const items = camel<A[]>(await select('notifications', 'select=*&order=created_at.desc', tokenOf(c)));
    return { items, unreadCount: items.filter((x) => !x.readAt).length };
  },
  markNotificationRead: async (c, a) => rpc('rpc_notifications_read', { p_id: s(a, 'id') }, tokenOf(c)),
  markAllNotificationsRead: async (c) => rpc('rpc_notifications_read_all', {}, tokenOf(c)),
  pushConfig: async () => ({
    expoEnabled: config().expoPushEnabled,
    webPushEnabled: config().webPushEnabled,
    ...(config().webPushEnabled ? { vapidPublicKey: config().vapidPublicKey } : {}),
  }),
  registerPushToken: async (c, a) => rpc('rpc_register_push_token', { p_payload: obj(a, 'input') }, tokenOf(c)),
  unregisterPushToken: async (c, a) => rpc('rpc_unregister_push_token', { p_installation_id: s(a, 'installationId') }, tokenOf(c)),
  notificationPreferences: async (c) => rpc('rpc_notification_preferences', { p_payload: null }, tokenOf(c)),
  updateNotificationPreferences: async (c, a) => rpc('rpc_notification_preferences', { p_payload: obj(a, 'input') }, tokenOf(c)),
  tickets: async (c) => camel(await select('support_tickets', 'select=*&order=created_at.desc', tokenOf(c))),
  createTicket: async (c, a) => camel(await insert('support_tickets', {
    user_id: c!.id, subject: s(a, 'subject'), body: s(a, 'body'),
  }, tokenOf(c))),
  addresses: async (c) => camel(await rpc('rpc_addresses', {}, tokenOf(c))),
  createAddress: async (c, a) => camel(await rpc('rpc_address_create', { p_payload: obj(a, 'input') }, tokenOf(c))),
  deleteAddress: async (c, a) => patch('user_addresses', `id=eq.${s(a, 'id')}`, { deleted_at: new Date().toISOString() }, tokenOf(c)),
  savedPlaces: async (c) => camel(await select('saved_places', 'select=*&deleted_at=is.null&order=created_at.desc', tokenOf(c))),
  savePlace: async (c, a) => {
    const token = tokenOf(c);
    const d = obj(a, 'input');
    const places = await select<A>('places', `select=*&id=eq.${s(d, 'placeId')}`, token);
    if (!places.length) throw new HttpError(404, 'PLACE_NOT_FOUND', 'Unknown place.');
    const p = places[0];
    return camel(await insert('saved_places', {
      user_id: c!.id, place_id: p.id, label: s(d, 'label') || p.name,
      name: p.name, lat: p.lat, lng: p.lng,
    }, token));
  },
  deleteSavedPlace: async (c, a) => patch('saved_places', `id=eq.${s(a, 'id')}`, { deleted_at: new Date().toISOString() }, tokenOf(c)),
  reviews: async (c, a) => camel(await select('reviews', `select=*${a.listingId ? `&listing_id=eq.${s(a, 'listingId')}` : ''}`, tokenOf(c))),
  coupons: async (c) => camel(await select('coupons', 'select=code,kind,min_subtotal_paise&active=eq.true', tokenOf(c))),

  // ---- partner mode (role-specific; no admin interface) ---------------------
  claimPartner: async (c, a) => {
    await rpc('rpc_claim_partner', { p_role: s(a, 'role'), p_listing_id: s(a, 'listingId') }, tokenOf(c));
    return me(tokenOf(c));
  },
  registerDriver: async (c, a) => {
    const d = await rpc<A>('rpc_register_driver', { p_payload: obj(a, 'input') }, tokenOf(c));
    return { driver: driverShape(d), user: await me(tokenOf(c)) };
  },
  driverMe: async (c) => {
    const token = tokenOf(c);
    const drivers = await select<A>('drivers', `select=*&user_id=eq.${c!.id}`, token);
    const services = await select<A>('driver_services', `select=*&driver_id=eq.${drivers[0]?.id ?? '00000000-0000-0000-0000-000000000000'}`, token);
    const rules = await select<A>('dispatch_rules', 'select=key,value', token);
    const dispatchRules = Object.fromEntries(rules.map((r) => [r.key as string, r.value]));
    const driver = drivers.length ? driverShape({ ...drivers[0], services: services.filter((x) => x.enabled).map((x) => x.service) }) : null;
    return { driver, dispatchRules };
  },
  updateDriver: async (c, a) => driverShape(await rpc('rpc_update_driver', { p_payload: obj(a, 'input') }, tokenOf(c))),
  verifyDriverDemo: async (c) => {
    const r = await rpc<A>('rpc_verify_driver_demo', {}, tokenOf(c));
    return { driver: driverShape(r.driver), demoNotice: r.demoNotice };
  },
  partnerRequests: async (c) => {
    const token = tokenOf(c);
    const [inbox, claimed] = await Promise.all([
      rpc<A>('rpc_partner_inbox', { p_user: c!.id }, token),
      select('partner_claims', 'select=*&user_id=eq.' + c!.id, token),
    ]);
    return { bookings: camel(inbox.bookings ?? []), orders: camel(inbox.orders ?? []), claimedListings: camel(claimed) };
  },
  jobs: async (c) => {
    const r = await rpc<A>('rpc_dispatch_jobs', {}, tokenOf(c));
    const items = Array.isArray(r.items) ? (r.items as unknown[]).map(jobShape) : [];
    return { items, driver: driverShape(r.driver), dispatchRules: camel(r.rules ?? {}) };
  },
  acceptJob: async (c, a) => {
    const r = await rpc<A>('rpc_accept_job', { p_job_id: s(a, 'id') }, tokenOf(c));
    return { job: camel(r.job), driver: driverShape(r.driver) };
  },

  // ---- marketplace commerce (shared by all three apps) ----------------------
  commerceCategories: async () => camel(await publicRpc<unknown[]>('rpc_commerce_categories', {})),
  commerceProducts: async (_c, a) => {
    const f = obj(a, 'filter');
    return { items: camel(await publicRpc<unknown[]>('rpc_commerce_products', { p_category: f.category ?? null, p_q: f.q ?? null, p_store: f.storeId ?? null })) };
  },
  productDetail: async (_c, a) => ({ product: camel(await publicRpc<A>('rpc_product_detail', { p_slug: s(a, 'slug') })) }),
  recommendedStores: async () => camel(await publicRpc<unknown[]>('rpc_recommended_stores', {})),
  recentlyViewedProducts: async (c) => camel(await select('recently_viewed', 'select=product_id&order=viewed_at.desc&limit=12', tokenOf(c))),
  recordProductView: async (c, a) => { await rpc('rpc_record_product_view', { p_product: s(a, 'slug') }, tokenOf(c)); },
  cart: async (c) => ({ lines: camel(await rpc<A>('rpc_cart_get', { p_user: c!.id }, tokenOf(c))) }),
  addToCart: async (c, a) => { await rpc('rpc_cart_upsert', { p_user: c!.id, p_product: s(obj(a, 'input'), 'productId'), p_variant: s(obj(a, 'input'), 'variantId'), p_quantity: Number(obj(a, 'input').quantity ?? 1), p_plan: (obj(a, 'input') as A).protectionPlanId ?? null }, tokenOf(c)); return { lines: camel(await rpc<A>('rpc_cart_get', { p_user: c!.id }, tokenOf(c))) }; },
  updateCartLine: async (c, a) => { await rpc('rpc_cart_update_line', { p_user: c!.id, p_line: s(a, 'id'), p_payload: obj(a, 'input') }, tokenOf(c)); return { lines: camel(await rpc<A>('rpc_cart_get', { p_user: c!.id }, tokenOf(c))) }; },
  removeCartLine: async (c, a) => { await rpc('rpc_cart_delete_line', { p_user: c!.id, p_line: s(a, 'id') }, tokenOf(c)); return { lines: camel(await rpc<A>('rpc_cart_get', { p_user: c!.id }, tokenOf(c))) }; },
  clearCart: async (c) => { await rpc('rpc_cart_clear', { p_user: c!.id }, tokenOf(c)); },
  cartQuote: async (c, a) => rpc('rpc_cart_quote', { p_user: c!.id, p_payload: obj(a, 'input') }, tokenOf(c)),
  wishlist: async (c) => ({ items: camel(await select('wishlists', 'select=product_id&order=created_at.desc', tokenOf(c))) }),
  addToWishlist: async (c, a) => { await rpc('rpc_wishlist_add', { p_user: c!.id, p_product: s(a, 'productId') }, tokenOf(c)); },
  removeFromWishlist: async (c, a) => { await rpc('rpc_wishlist_remove', { p_user: c!.id, p_product: s(a, 'productId') }, tokenOf(c)); },
  recentSearches: async (c) => ({ items: (camel(await select('search_history', 'select=query&order=created_at.desc&limit=10', tokenOf(c))) as A[]).map((r) => r.query) }),
  recordSearch: async (c, a) => { await rpc('rpc_record_search', { p_user: c!.id, p_q: s(a, 'q') }, tokenOf(c)); },
  paymentMethods: async (_c, a) => camel(await publicRpc<A>('rpc_payment_methods', { p_total_paise: Number((a as A).totalPaise ?? 0) })),
  checkout: async (c, a) => camel(await rpc<A>('rpc_marketplace_checkout', {
    p_user: c!.id, p_address: obj(a, 'input'), p_method: s(obj(a, 'input'), 'paymentMethod'),
    p_slot: s(obj(a, 'input'), 'deliverySlot') || 'standard', p_coupon: (obj(a, 'input') as A).coupon ?? null,
    p_instructions: s(obj(a, 'input'), 'instructions'), p_journey: (obj(a, 'input') as A).journeyId ?? null,
    p_idem: s(a, 'idempotencyKey'),
  }, tokenOf(c))),
  // ---- GOWAYY PARTNER hub ----------------------------------------------------
  partnerOverview: async (c) => camel(await rpc<A>('rpc_partner_overview', { p_user: c!.id }, tokenOf(c))),
  partnerProfile: async (c) => ({ profile: camel(await select('partner_profiles', 'select=*&user_id=eq.' + c!.id, tokenOf(c)).then((r) => (Array.isArray(r) ? r[0] ?? null : null))) }),
  updatePartnerProfile: async (c, a) => camel(await rpc('rpc_partner_profile_upsert', { p_user: c!.id, p_payload: obj(a, 'input') }, tokenOf(c))),
  partnerVerification: async (c) => ({ documents: camel(await select('partner_documents', 'select=*&user_id=eq.' + c!.id, tokenOf(c))) }),
  uploadPartnerDocument: async (c, a) => camel(await rpc('rpc_partner_document_upload', { p_user: c!.id, p_payload: obj(a, 'input') }, tokenOf(c))),
  partnerInventory: async (c) => camel(await rpc<A>('rpc_partner_inventory', { p_user: c!.id }, tokenOf(c))),
  adjustInventory: async (c, a) => camel(await rpc('rpc_partner_inventory_adjust', { p_user: c!.id, p_payload: obj(a, 'input') }, tokenOf(c))),
  partnerMenu: async (c) => ({ items: camel(await select('partner_menu_items', 'select=*&user_id=eq.' + c!.id + '&order=created_at.desc', tokenOf(c))) }),
  addMenuItem: async (c, a) => camel(await rpc('rpc_partner_menu_add', { p_user: c!.id, p_payload: obj(a, 'input') }, tokenOf(c))),
  updateMenuItem: async (c, a) => camel(await rpc('rpc_partner_menu_update', { p_user: c!.id, p_id: s(a, 'id'), p_payload: obj(a, 'input') }, tokenOf(c))),
  deleteMenuItem: async (c, a) => { await rpc('rpc_partner_menu_delete', { p_user: c!.id, p_id: s(a, 'id') }, tokenOf(c)); },
  partnerRooms: async (c) => ({ items: camel(await select('partner_rooms', 'select=*&user_id=eq.' + c!.id + '&order=created_at.desc', tokenOf(c))) }),
  addRoom: async (c, a) => camel(await rpc('rpc_partner_room_add', { p_user: c!.id, p_payload: obj(a, 'input') }, tokenOf(c))),
  updateRoom: async (c, a) => camel(await rpc('rpc_partner_room_update', { p_user: c!.id, p_id: s(a, 'id'), p_payload: obj(a, 'input') }, tokenOf(c))),
  setAvailability: async (c, a) => camel(await rpc('rpc_partner_availability_set', { p_user: c!.id, p_payload: obj(a, 'input') }, tokenOf(c))),
  partnerTours: async (c) => ({ items: camel(await select('partner_tours', 'select=*&user_id=eq.' + c!.id + '&order=created_at.desc', tokenOf(c))) }),
  addTour: async (c, a) => camel(await rpc('rpc_partner_tour_add', { p_user: c!.id, p_payload: obj(a, 'input') }, tokenOf(c))),
  updateTour: async (c, a) => camel(await rpc('rpc_partner_tour_update', { p_user: c!.id, p_id: s(a, 'id'), p_payload: obj(a, 'input') }, tokenOf(c))),
  partnerExperienceSlots: async (c, a) => camel(await rpc('rpc_partner_experience_slots', { p_offering_id: s(a, 'offeringId') }, tokenOf(c))),
  addExperienceSlot: async (c, a) => camel(await rpc('rpc_partner_experience_slot_add', { p_payload: obj(a, 'input') }, tokenOf(c))),
  deleteExperienceSlot: async (c, a) => camel(await rpc('rpc_partner_experience_slot_delete', { p_id: s(a, 'id') }, tokenOf(c))),
  partnerEarnings: async (c) => camel(await rpc<A>('rpc_partner_earnings', { p_user: c!.id }, tokenOf(c))),
  partnerSettlements: async (c) => camel(await rpc('rpc_partner_settlements', {}, tokenOf(c))),
  requestSettlement: async (c) => camel(await rpc('rpc_settlement_request', { p_user: c!.id }, tokenOf(c))),
  partnerInbox: async (c) => camel(await rpc<A>('rpc_partner_inbox', { p_user: c!.id }, tokenOf(c))),

  // ---- shared uploads, partner catalogue and delivery ----------------------
  uploadImage: async (c, a) => uploadImage(c, obj(a, 'input')),
  updateAddress: async (c, a) => camel(await rpc('rpc_update_address', { p_id: s(a, 'id'), p_payload: obj(a, 'input') }, tokenOf(c))),
  partnerCategories: async (c) => camel(await rpc('rpc_partner_categories', {}, tokenOf(c))),
  createPartnerCategory: async (c, a) => ({ category: camel(await rpc('rpc_partner_category_create', { p_payload: obj(a, 'input') }, tokenOf(c))) }),
  partnerProducts: async (c) => ({ items: camel(await rpc('rpc_partner_products', {}, tokenOf(c))) }),
  createPartnerProduct: async (c, a) => ({ product: camel(await rpc('rpc_partner_product_create', { p_payload: obj(a, 'input') }, tokenOf(c))) }),
  updatePartnerProduct: async (c, a) => ({ product: camel(await rpc('rpc_partner_product_update', { p_id: s(a, 'id'), p_payload: obj(a, 'input') }, tokenOf(c))) }),
  partnerStores: async (c) => ({ items: camel(await rpc('rpc_partner_stores', {}, tokenOf(c))) }),
  createPartnerStore: async (c, a) => ({ store: camel(await rpc('rpc_partner_store_create', { p_payload: obj(a, 'input') }, tokenOf(c))) }),
  updatePartnerStore: async (c, a) => ({ store: camel(await rpc('rpc_partner_store_update', { p_id: s(a, 'id'), p_payload: obj(a, 'input') }, tokenOf(c))) }),
  partnerOffers: async (c) => ({ items: camel(await rpc('rpc_partner_offers', {}, tokenOf(c))) }),
  createPartnerOffer: async (c, a) => ({ offer: camel(await rpc('rpc_partner_offer_create', { p_payload: obj(a, 'input') }, tokenOf(c))) }),
  updatePartnerOffer: async (c, a) => ({ offer: camel(await rpc('rpc_partner_offer_update', { p_id: s(a, 'id'), p_payload: obj(a, 'input') }, tokenOf(c))) }),
  partnerCoupons: async (c) => ({ items: camel(await rpc('rpc_partner_coupons', {}, tokenOf(c))) }),
  updatePartnerOrderStatus: async (c, a) => {
    const id = s(a, 'id'); const status = s(a, 'status');
    await rpc('rpc_transition_order', { p_id: id, p_status: status }, tokenOf(c));
    return { order: { id, status } };
  },
  partnerDeliveries: async (c) => ({ items: camel(await rpc('rpc_partner_deliveries', {}, tokenOf(c))) }),
  verifyDelivery: async (c, a) => {
    const result = camel<A>(await rpc('rpc_verify_delivery', { p_order_id: s(a, 'orderId'), p_code: s(a, 'code') }, tokenOf(c)));
    if (result.verified !== true) throw new HttpError(422, 'INCORRECT_CODE', `The delivery code is incorrect. ${Number(result.remainingAttempts ?? 0)} attempts remaining.`);
    return result;
  },

  // ---- server-authorized admin console ------------------------------------
  adminRequest: async (c, a) => adminRequest(c, s(a, 'path'), s(a, 'method') || 'GET', obj(a, 'input'), obj(a, 'query')),
  adminPosters: async (c) => adminRequest(c, '/posters'),
  createPoster: async (c, a) => adminRequest(c, '/posters', 'POST', obj(a, 'input')),
  updatePoster: async (c, a) => adminRequest(c, `/posters/${encodeURIComponent(s(a, 'id'))}`, 'PATCH', obj(a, 'input')),
  deletePoster: async (c, a) => adminRequest(c, `/posters/${encodeURIComponent(s(a, 'id'))}`, 'DELETE'),
  reorderPosters: async (c, a) => adminRequest(c, '/posters/reorder', 'POST', { ids: Array.isArray(a.ids) ? a.ids : [] }),
  adminServiceAreas: async (c) => adminRequest(c, '/service-areas'),
  createServiceArea: async (c, a) => adminRequest(c, '/service-areas', 'POST', obj(a, 'input')),
  updateServiceArea: async (c, a) => adminRequest(c, `/service-areas/${encodeURIComponent(s(a, 'id'))}`, 'PATCH', obj(a, 'input')),
  deleteServiceArea: async (c, a) => adminRequest(c, `/service-areas/${encodeURIComponent(s(a, 'id'))}`, 'DELETE'),
  adminDestinations: async (c) => adminRequest(c, '/destinations'),
  createDestination: async (c, a) => adminRequest(c, '/destinations', 'POST', obj(a, 'input')),
  updateDestination: async (c, a) => adminRequest(c, `/destinations/${encodeURIComponent(s(a, 'id'))}`, 'PATCH', obj(a, 'input')),
  deleteDestination: async (c, a) => adminRequest(c, `/destinations/${encodeURIComponent(s(a, 'id'))}`, 'DELETE'),
  addDestinationImage: async (c, a) => adminRequest(c, `/destinations/${encodeURIComponent(s(a, 'id'))}/images`, 'POST', obj(a, 'input')),
  updateDestinationImage: async (c, a) => adminRequest(c, `/destinations/${encodeURIComponent(s(a, 'id'))}/images/${encodeURIComponent(s(a, 'imageId'))}`, 'PATCH', obj(a, 'input')),
  deleteDestinationImage: async (c, a) => adminRequest(c, `/destinations/${encodeURIComponent(s(a, 'id'))}/images/${encodeURIComponent(s(a, 'imageId'))}`, 'DELETE'),

  resetDev: async () => { throw new HttpError(501, 'NOT_AVAILABLE', 'The development reset endpoint does not exist on the Supabase backend.'); },
};

async function createBooking(c: Caller | null, service: string, a: A): Promise<unknown> {
  parse(idemSchema, { idempotencyKey: s(a, 'idempotencyKey') });
  const r = await rpc<A>('rpc_create_booking', {
    p_service: service,
    p_payload: bookingPayload(service, obj(a, 'input')),
    p_idem: s(a, 'idempotencyKey'),
  }, tokenOf(c));
  return camel(r);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return jsonResponse({}, 204);
  try {
    config();
    const body = req.method === 'GET' ? {} : await readJson(req);
    const op = typeof body.op === 'string' ? body.op : '';
    const args = (body.args && typeof body.args === 'object' ? body.args : {}) as A;
    const handler = handlers[op];
    if (!handler) throw new HttpError(400, 'UNKNOWN_OPERATION', `Unknown operation: ${op || '(none)'}`);
    const caller = PUBLIC.has(op) ? null : await requireCaller(req);
    const data = await handler(caller, args);
    return jsonResponse({ data });
  } catch (error) {
    return errorResponse(error);
  }
});
