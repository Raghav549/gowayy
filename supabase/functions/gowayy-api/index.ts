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
import {
  requireCaller, select, insert, patch, rpc, serviceRpc, publicRpc, authAdmin,
  passwordLogin, authLogout, type Caller,
} from '../_shared/supabase.ts';
import {
  camelize, bookingPayload, orderPayload, vehicleShape, journeyShape, driverShape, jobShape,
} from '../_shared/normalize.ts';
import {
  parse, registerSchema, loginSchema, forgotSchema, resetSchema, otpSchema, resendSchema, idemSchema,
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
  'register', 'resendOtp', 'verifyOtp', 'login', 'forgotPassword', 'resetPassword',
]);

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
    const payments = await select<A>('payments', `select=*&booking_id=eq.${id}`, token);
    return { booking, payment: payments.length ? camel(payments[0]) : null };
  },
  orders: async (c) => camel(await select('customer_orders', 'select=*&order=created_at.desc', tokenOf(c))),
  order: async (c, a) => {
    const token = tokenOf(c); const id = s(a, 'id');
    const rows = await select<A>('customer_orders', `select=*&id=eq.${id}`, token);
    if (!rows.length) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const payments = await select<A>('payments', `select=*&order_id=eq.${id}`, token);
    return { order: camel(rows[0]), payment: payments.length ? camel(payments[0]) : null };
  },
  transitionBooking: async (c, a) => camel(await rpc('rpc_transition_booking', {
    p_id: s(a, 'id'), p_status: s(a, 'status'), p_note: a.note ?? null,
  }, tokenOf(c))),
  cancelBooking: async (c, a) => camel(await rpc('rpc_cancel_booking', { p_id: s(a, 'id'), p_reason: s(a, 'reason') }, tokenOf(c))),
  reviewBooking: async (c, a) => camel(await rpc('rpc_review_booking', {
    p_id: s(a, 'id'), p_rating: n(a, 'rating') ?? 0, p_comment: s(a, 'comment'),
  }, tokenOf(c))),
  transitionOrder: async (c, a) => camel(await rpc('rpc_transition_order', { p_id: s(a, 'id'), p_status: s(a, 'status') }, tokenOf(c))),
  cancelOrder: async (c, a) => camel(await rpc('rpc_cancel_order', { p_id: s(a, 'id'), p_reason: s(a, 'reason') }, tokenOf(c))),

  // ---- payments ------------------------------------------------------------
  initPayment: async (c, a) => {
    parse(idemSchema, { idempotencyKey: s(obj(a, 'input'), 'idempotencyKey') });
    const input = obj(a, 'input');
    return camel(await rpc('rpc_init_payment', { p_payload: {
      bookingId: input.bookingId ?? null, orderId: input.orderId ?? null,
      method: input.method ?? 'upi', amountPaise: input.amountPaise ?? null,
      idempotencyKey: input.idempotencyKey,
    } }, tokenOf(c)));
  },
  captureSandboxPayment: async (c, a) => camel(await rpc('rpc_capture_sandbox_payment', { p_id: s(a, 'id') }, tokenOf(c))),
  refundPayment: async (c, a) => camel(await rpc('rpc_refund_payment', {
    p_id: s(a, 'id'), p_full: a.full !== false, p_reason: s(a, 'reason'),
  }, tokenOf(c))),
  payments: async (c) => camel(await select('payments', 'select=*&order=created_at.desc', tokenOf(c))),
  transactions: async (c) => camel(await select('transactions', 'select=*&order=created_at.desc', tokenOf(c))),

  // ---- notifications, support and account data -----------------------------
  notifications: async (c) => {
    const items = camel<A[]>(await select('notifications', 'select=*&order=created_at.desc', tokenOf(c)));
    return { items, unreadCount: items.filter((x) => !x.readAt).length };
  },
  markNotificationRead: async (c, a) => rpc('rpc_notifications_read', { p_id: s(a, 'id') }, tokenOf(c)),
  markAllNotificationsRead: async (c) => rpc('rpc_notifications_read_all', {}, tokenOf(c)),
  tickets: async (c) => camel(await select('support_tickets', 'select=*&order=created_at.desc', tokenOf(c))),
  createTicket: async (c, a) => camel(await insert('support_tickets', {
    user_id: c!.id, subject: s(a, 'subject'), body: s(a, 'body'),
  }, tokenOf(c))),
  addresses: async (c) => camel(await select('user_addresses', 'select=*&deleted_at=is.null&order=created_at.desc', tokenOf(c))),
  createAddress: async (c, a) => {
    const d = obj(a, 'input');
    return camel(await insert('user_addresses', {
      user_id: c!.id, label: s(d, 'label') || 'Address', line1: s(d, 'line1'), line2: s(d, 'line2') || null,
      city: s(d, 'city'), state: s(d, 'state') || 'West Bengal', postal_code: d.postalCode ?? null,
      lat: d.lat ?? null, lng: d.lng ?? null, is_default: d.isDefault === true,
    }, tokenOf(c)));
  },
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
    const orders = await select('customer_orders', 'select=*&order=created_at.desc', token);
    const bookings = await select('customer_bookings', 'select=*&order=created_at.desc', token);
    const claimed = await select('partner_claims', 'select=*&user_id=eq.' + c!.id, token);
    return { bookings: camel(bookings), orders: camel(orders), claimedListings: camel(claimed) };
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
    p_user: c!.id, p_address: obj(obj(a, 'input'), 'address') ?? {}, p_method: s(obj(a, 'input'), 'paymentMethod'),
    p_slot: s(obj(a, 'input'), 'deliverySlot') ?? 'standard', p_coupon: (obj(a, 'input') as A).coupon ?? null,
    p_instructions: s(obj(a, 'input'), 'instructions') ?? '', p_journey: (obj(a, 'input') as A).journeyId ?? null,
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
  partnerEarnings: async (c) => camel(await rpc<A>('rpc_partner_earnings', { p_user: c!.id }, tokenOf(c))),
  partnerSettlements: async (c) => ({ items: camel(await select('settlements', 'select=*&user_id=eq.' + c!.id + '&order=created_at.desc', tokenOf(c))) }),
  requestSettlement: async (c) => camel(await rpc('rpc_settlement_request', { p_user: c!.id }, tokenOf(c))),
  partnerInbox: async (c) => camel(await rpc<A>('rpc_partner_inbox', { p_user: c!.id }, tokenOf(c))),

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
