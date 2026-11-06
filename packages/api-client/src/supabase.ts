/**
 * Supabase transport (production target). Uses ONLY the public anon key plus the
 * signed-in user's JWT; the service-role key never appears in a client bundle.
 *
 * Every mutation goes through the `gowayy-api` Edge Function, which verifies the
 * caller's JWT with Supabase Auth and then calls SECURITY DEFINER RPCs. Reads use
 * PostgREST with the caller's token so RLS is enforced. Booking status, prices and
 * payment state are always server-authoritative.
 *
 * Activate with VITE_GOWAYY_BACKEND=supabase plus VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY. Without those values the factory throws instead of
 * pretending to be connected.
 */
import type {
  Booking, Destination, DispatchJob, DriverProfile, Journey, Notification, Order, Payment,
  Place, SearchHit, Session, SupportTicket, Transaction, User, VehicleClass, SharedTaxiRoute,
  Property, Restaurant, GroceryStore, TourPackage, Experience, Attraction, HiddenGem,
  ExperienceOffering, ExperienceSlot, ExperienceQuote,
} from '@gowayy/types';
import type { GowayyClient, TokenStore, RegisterResult, VerifyResult, AuthResult, CatalogBundle, RouteEstimate, JourneyComponents, RecommendationGroups, Review } from './http.ts';
import { ApiError } from './http.ts';

export interface SupabaseConfig { url: string; anonKey: string; tokenStore: TokenStore }

export function createSupabaseTransport(config: SupabaseConfig): GowayyClient {
  if (!config.url || !config.anonKey) {
    throw new Error('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  const base = config.url.replace(/\/$/, '');

  /** Single gateway call. Throws ApiError with the server's error code and message. */
  async function call<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
    const token = config.tokenStore.get();
    let response: Response;
    try {
      response = await fetch(`${base}/functions/v1/gowayy-api`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: config.anonKey,
          authorization: `Bearer ${token ?? config.anonKey}`,
        },
        body: JSON.stringify({ op, args }),
      });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the GOWAYY service. Check your connection and try again.');
    }
    type EdgePayload = { data?: unknown; error?: string; message?: string; details?: unknown };
    let payload: EdgePayload | null = null;
    try { payload = await response.json() as EdgePayload; } catch { /* empty body */ }
    if (!response.ok || payload?.error) {
      throw new ApiError(response.status || 502, payload?.error ?? 'EDGE_FUNCTION_FAILED',
        payload?.message ?? 'The GOWAYY service could not complete this request.', payload?.details);
    }
    return payload?.data as T;
  }

  const op = <T>(name: string) => (args: Record<string, unknown> = {}) => call<T>(name, args);
  const withId = <T>(name: string) => (id: string) => call<T>(name, { id });
  const withInput = <T>(name: string) => (input: unknown) => call<T>(name, { input });

  return {
    baseUrl: `${base}/functions/v1/gowayy-api`,
    demoMode: false,
    health: () => call<Record<string, unknown>>('health'),
    catalog: () => call<CatalogBundle>('catalog'),
    search: (q) => call<SearchHit[]>('search', { q }),
    recommendations: (id) => call<RecommendationGroups>('recommendations', { destinationId: id }),
    credits: () => call<{ policy: string; credits: Array<{ place: string; alt: string; credit?: string; license?: string; sourceUrl?: string }>; unavailablePlaces: string[] }>('credits'),
    estimateRoute: (from, to, vehicle) => call<RouteEstimate>('estimateRoute', { from, to, vehicle: vehicle ?? null }),

    register: (input) => call<RegisterResult>('register', input as unknown as Record<string, unknown>),
    resendOtp: (id) => call<RegisterResult>('resendOtp', { registrationId: id }),
    verifyOtp: (id, code, password) => call<VerifyResult>('verifyOtp', { registrationId: id, code, ...(password ? { password } : {}) }),
    login: (email, password) => call<AuthResult>('login', { email, password }),
    forgotPassword: (email) => call<{ accepted: boolean; resetId: string; demoCode?: string; demoNotice: string }>('forgotPassword', { email }),
    resetPassword: (resetId, code, password) => call<{ reset: boolean }>('resetPassword', { resetId, code, password }),
    me: () => call<User>('me'),
    updateProfile: (input) => call<User>('updateProfile', input as Record<string, unknown>),
    logout: async () => { await call<null>('logout'); },
    deleteAccount: async () => { await call<null>('deleteAccount'); },

    createJourney: (draft) => call<Journey>('createJourney', { draft }),
    journeys: () => call<Journey[]>('journeys'),
    journey: (id) => call<JourneyComponents>('journey', { id }),
    updateJourney: (id, patch) => call<Journey>('updateJourney', { id, patch }),

    bookCab: (input, key) => call<Booking>('bookCab', { input, idempotencyKey: key }),
    bookSharedTaxi: (input, key) => call<Booking>('bookSharedTaxi', { input, idempotencyKey: key }),
    bookStay: (input, key) => call<Booking>('bookStay', { input, idempotencyKey: key }),
    bookTourism: (input, key) => call<Booking>('bookTourism', { input, idempotencyKey: key }),
    experienceOfferings: (destinationId, kind) => call<{ items: ExperienceOffering[] }>('experienceOfferings', { destinationId: destinationId ?? null, kind: kind ?? null }),
    experienceSlots: (offeringId, date) => call<{ offering: ExperienceOffering; items: ExperienceSlot[] }>('experienceSlots', { offeringId, date }),
    experienceQuote: (slotId, guests) => call<ExperienceQuote>('experienceQuote', { slotId, guests }),
    bookParcel: (input, key) => call<Booking>('bookParcel', { input, idempotencyKey: key }),
    placeOrder: (input, key) => call<Order>('placeOrder', { input, idempotencyKey: key }),

    bookings: () => call<Booking[]>('bookings'),
    booking: (id) => call<{ booking: Booking; payment: Payment | null }>('booking', { id }),
    orders: () => call<Order[]>('orders'),
    order: (id) => call<{ order: Order; payment: Payment | null }>('order', { id }),
    transitionBooking: (id, status, note) => call<Booking>('transitionBooking', { id, status, note: note ?? null }),
    cancelBooking: (id, reason) => call<Booking>('cancelBooking', { id, reason: reason ?? '' }),
    reviewBooking: (id, rating, comment) => call<unknown>('reviewBooking', { id, rating, comment }),
    transitionOrder: (id, status) => call<Order>('transitionOrder', { id, status }),

    initPayment: (input) => call<Payment>('initPayment', { input }),
    captureSandboxPayment: (id) => call<{ payment: Payment; sandbox: boolean; note?: string }>('captureSandboxPayment', { id }),
    refundPayment: (id, full = true, reason = '') => call<{ payment: Payment; refundPaise: number }>('refundPayment', { id, full, reason }),
    payments: () => call<Payment[]>('payments'),
    transactions: () => call<Transaction[]>('transactions'),

    notifications: () => call<{ items: Notification[]; unreadCount: number }>('notifications'),
    markNotificationRead: async (id) => { await withId<unknown>('markNotificationRead')(id); },
    markAllNotificationsRead: async () => { await op<unknown>('markAllNotificationsRead')(); },
    tickets: () => call<SupportTicket[]>('tickets'),
    createTicket: (input) => call<SupportTicket>('createTicket', input as Record<string, unknown>),
    addresses: () => call<unknown[]>('addresses'),
    createAddress: withInput<unknown>('createAddress'),
    deleteAddress: async (id) => { await withId<unknown>('deleteAddress')(id); },
    savedPlaces: () => call<unknown[]>('savedPlaces'),
    savePlace: withInput<unknown>('savePlace'),
    deleteSavedPlace: async (id) => { await withId<unknown>('deleteSavedPlace')(id); },
    reviews: (listingId) => call<Review[]>('reviews', listingId ? { listingId } : {}),
    coupons: () => call<Array<{ code: string; kind: string; minSubtotalPaise: number }>>('coupons'),

    claimPartner: (role, listingId) => call<User>('claimPartner', { role, listingId }),
    registerDriver: (input) => call<{ driver: DriverProfile; user: User }>('registerDriver', { input }),
    driverMe: () => call<{ driver: DriverProfile | null; dispatchRules: Record<string, unknown> }>('driverMe'),
    updateDriver: (input) => call<DriverProfile>('updateDriver', { input }),
    verifyDriverDemo: () => call<{ driver: DriverProfile; demoNotice: string }>('verifyDriverDemo'),
    partnerRequests: () => call<{ bookings: Booking[]; orders: Order[]; claimedListings: unknown[] }>('partnerRequests'),
    jobs: () => call<{ items: DispatchJob[]; driver: DriverProfile | null }>('jobs'),
    acceptJob: (id) => call<{ job: DispatchJob; driver: DriverProfile }>('acceptJob', { id }),
    resetDev: async () => { await op<unknown>('resetDev')(); },

    // Marketplace commerce + GOWAYY PARTNER hub: backed by the gowayy-api Edge
    // gateway operations of the same names.
    commerceCategories: () => call('commerceCategories'),
    commerceProducts: (filter) => call('commerceProducts', filter ? { filter } : {}),
    productDetail: (slug) => call('productDetail', { slug }),
    recommendedStores: () => call('recommendedStores'),
    recentlyViewedProducts: () => call('recentlyViewedProducts'),
    recordProductView: async (slug) => { await call<unknown>('recordProductView', { slug }); },
    cart: () => call('cart'),
    addToCart: (input) => call('addToCart', { input }),
    updateCartLine: (id, input) => call('updateCartLine', { id, input }),
    removeCartLine: (id) => call('removeCartLine', { id }),
    clearCart: async () => { await call<unknown>('clearCart'); },
    cartQuote: (input) => call('cartQuote', { input }),
    wishlist: () => call('wishlist'),
    addToWishlist: async (productId) => { await call<unknown>('addToWishlist', { productId }); },
    removeFromWishlist: async (productId) => { await call<unknown>('removeFromWishlist', { productId }); },
    recentSearches: () => call('recentSearches'),
    recordSearch: async (q) => { await call<unknown>('recordSearch', { q }); },
    paymentMethods: (totalPaise) => call('paymentMethods', { totalPaise }),
    checkout: (input, idempotencyKey) => call<Order>('checkout', { input, idempotencyKey }),
    partnerOverview: () => call('partnerOverview'),
    partnerProfile: () => call('partnerProfile'),
    updatePartnerProfile: (input) => call('updatePartnerProfile', { input }),
    partnerVerification: () => call('partnerVerification'),
    uploadPartnerDocument: (input) => call('uploadPartnerDocument', { input }),
    partnerInventory: () => call('partnerInventory'),
    adjustInventory: (input) => call('adjustInventory', { input }),
    partnerMenu: () => call('partnerMenu'),
    addMenuItem: (input) => call('addMenuItem', { input }),
    updateMenuItem: (id, input) => call('updateMenuItem', { id, input }),
    deleteMenuItem: async (id) => { await call<unknown>('deleteMenuItem', { id }); },
    partnerRooms: () => call('partnerRooms'),
    addRoom: (input) => call('addRoom', { input }),
    updateRoom: (id, input) => call('updateRoom', { id, input }),
    setAvailability: (input) => call('setAvailability', { input }),
    partnerTours: () => call('partnerTours'),
    addTour: (input) => call('addTour', { input }),
    updateTour: (id, input) => call('updateTour', { id, input }),
    partnerExperienceSlots: (offeringId) => call<{ items: ExperienceSlot[] }>('partnerExperienceSlots', { offeringId }),
    addExperienceSlot: (input) => call<{ slot: ExperienceSlot }>('addExperienceSlot', { input }),
    deleteExperienceSlot: (id) => call<{ deactivated: boolean }>('deleteExperienceSlot', { id }),
    partnerEarnings: () => call('partnerEarnings'),
    partnerSettlements: () => call('partnerSettlements'),
    requestSettlement: () => call('requestSettlement'),
    partnerInbox: () => call('partnerInbox'),

    // Storefront, managed content and uploads.
    storefront: () => call('storefront'),
    storeDetail: (id) => call('storeDetail', { id }),
    banners: () => call('banners'),
    orderDetail: (id) => call('orderDetail', { id }),
    uploadImage: (input) => call('uploadImage', { input }),
    updateAddress: (id, input) => call('updateAddress', { id, input }),
    posters: (kind) => call('posters', { kind: kind ?? null }),
    destinations: () => call('destinations'),
    destination: (slug) => call('destination', { slug }),
    serviceAreas: () => call('serviceAreas'),
    serviceAreaCheck: (pincode) => call('serviceAreaCheck', { pincode }),

    // Partner-owned catalogue and fulfilment.
    partnerCategories: () => call('partnerCategories'),
    createPartnerCategory: (input) => call('createPartnerCategory', { input }),
    partnerProducts: () => call('partnerProducts'),
    createPartnerProduct: (input) => call('createPartnerProduct', { input }),
    updatePartnerProduct: (id, input) => call('updatePartnerProduct', { id, input }),
    partnerStores: () => call('partnerStores'),
    createPartnerStore: (input) => call('createPartnerStore', { input }),
    updatePartnerStore: (id, input) => call('updatePartnerStore', { id, input }),
    partnerOffers: () => call('partnerOffers'),
    createPartnerOffer: (input) => call('createPartnerOffer', { input }),
    updatePartnerOffer: (id, input) => call('updatePartnerOffer', { id, input }),
    partnerCoupons: () => call('partnerCoupons'),
    updatePartnerOrderStatus: (id, status) => call('updatePartnerOrderStatus', { id, status }),
    partnerDeliveries: () => call('partnerDeliveries'),
    verifyDelivery: (orderId, code) => call('verifyDelivery', { orderId, code }),

    // Admin managed content; every operation is role-checked again by the RPC.
    adminPosters: () => call('adminPosters'),
    createPoster: (input) => call('createPoster', { input }),
    updatePoster: (id, input) => call('updatePoster', { id, input }),
    deletePoster: async (id) => { await call('deletePoster', { id }); },
    reorderPosters: (ids) => call('reorderPosters', { ids }),
    adminServiceAreas: () => call('adminServiceAreas'),
    createServiceArea: (input) => call('createServiceArea', { input }),
    updateServiceArea: (id, input) => call('updateServiceArea', { id, input }),
    deleteServiceArea: async (id) => { await call('deleteServiceArea', { id }); },
    adminDestinations: () => call('adminDestinations'),
    createDestination: (input) => call('createDestination', { input }),
    updateDestination: (id, input) => call('updateDestination', { id, input }),
    deleteDestination: async (id) => { await call('deleteDestination', { id }); },
    addDestinationImage: (id, input) => call('addDestinationImage', { id, input }),
    updateDestinationImage: (id, imageId, input) => call('updateDestinationImage', { id, imageId, input }),
    deleteDestinationImage: (id, imageId) => call('deleteDestinationImage', { id, imageId }),
    adminRequest: <T = unknown>(path: string, options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {}) =>
      call<T>('adminRequest', { path, method: options.method ?? 'GET', input: options.body ?? {} }),
  };
}

/** True when a hosted Supabase backend is configured in this environment. */
export function supabaseConfigured(env: Record<string, string | undefined> = {}): boolean {
  return Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY && env.VITE_GOWAYY_BACKEND === 'supabase');
}
