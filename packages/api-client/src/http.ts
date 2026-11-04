import type {
  Booking, Destination, DispatchJob, DriverProfile, Journey, Notification, Order, Payment,
  Place, SearchHit, Session, SupportTicket, Transaction, User, VehicleClass, SharedTaxiRoute,
  Property, Restaurant, GroceryStore, TourPackage, Experience, Attraction, HiddenGem,
} from '@gowayy/types';
import type { PaymentMethodOption } from '@gowayy/commerce';

export interface TokenStore {
  get(): string | null;
  set(token: string | null): void;
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message); this.name = 'ApiError';
  }
}

export interface Review { id: string; listingId: string | null; rating: number; comment: string; source: string; createdAt: string }

export interface RegisterResult {
  registrationId: string; otpRequired: boolean; expiresAt: string; resendAfterSeconds: number;
  demoMode: boolean; demoOtp?: string; demoNotice: string;
}
export type VerifyResult =
  | { verified: true; user: User; session: Session }
  | { verified: false; error: string; message: string; attemptsRemaining: number };
export interface AuthResult { user: User; session: Session }
export interface CatalogBundle {
  destinations: Destination[]; hiddenGems: HiddenGem[]; attractions: Attraction[]; places: Place[];
  vehicles: VehicleClass[]; sharedRoutes: SharedTaxiRoute[]; properties: Property[];
  restaurants: Restaurant[]; stores: GroceryStore[]; packages: TourPackage[]; experiences: Experience[];
}
export interface RouteEstimate {
  route: { straightLineKm: number; distanceKm: number; durationMin: number; provider: string; note: string; points: Array<{ lat: number; lng: number }> };
  vehicle: VehicleClass | null;
}
export interface JourneyComponents {
  journey: Journey;
  components: Array<{ service: string; label: string; state: string; bookingId: string | null; statusLabel: string | null }>;
}
export interface RecommendationGroups {
  properties: Array<{ id: string; title: string; service: string; available: boolean; href: string }>;
  restaurants: Array<{ id: string; title: string; service: string; available: boolean; href: string }>;
  attractions: Array<{ id: string; title: string; service: string; available: boolean; href: string }>;
  packages: Array<{ id: string; title: string; service: string; available: boolean; href: string }>;
  experiences: Array<{ id: string; title: string; service: string; available: boolean; href: string }>;
  groceries: Array<{ id: string; title: string; service: string; available: boolean; href: string }>;
  taxiRoutes: Array<{ id: string; title: string; service: string; available: boolean; href: string }>;
}

/** The full client contract shared by the web and mobile apps. */
export interface GowayyClient {
  readonly baseUrl: string;
  readonly demoMode: boolean;
  health(): Promise<Record<string, unknown>>;
  catalog(): Promise<CatalogBundle>;
  search(q: string): Promise<SearchHit[]>;
  recommendations(destinationId: string): Promise<RecommendationGroups>;
  credits(): Promise<{ policy: string; credits: Array<{ place: string; alt: string; credit?: string; license?: string; sourceUrl?: string }>; unavailablePlaces: string[] }>;
  estimateRoute(from: string, to: string, vehicle?: string): Promise<RouteEstimate>;
  register(input: { firstName: string; lastName: string; email: string; password: string; confirmPassword: string }): Promise<RegisterResult>;
  resendOtp(registrationId: string): Promise<RegisterResult>;
  verifyOtp(registrationId: string, code: string, password?: string): Promise<VerifyResult>;
  login(email: string, password: string): Promise<AuthResult>;
  forgotPassword(email: string): Promise<{ accepted: boolean; resetId: string; demoCode?: string; demoNotice: string }>;
  resetPassword(resetId: string, code: string, password: string): Promise<{ reset: boolean }>;
  me(): Promise<User>;
  updateProfile(input: { firstName?: string; lastName?: string }): Promise<User>;
  logout(): Promise<void>;
  deleteAccount(): Promise<void>;
  createJourney(draft: Record<string, unknown>): Promise<Journey>;
  journeys(): Promise<Journey[]>;
  journey(id: string): Promise<JourneyComponents>;
  updateJourney(id: string, patch: Record<string, unknown>): Promise<Journey>;
  bookCab(input: unknown, idempotencyKey: string): Promise<Booking>;
  bookSharedTaxi(input: unknown, idempotencyKey: string): Promise<Booking>;
  bookStay(input: unknown, idempotencyKey: string): Promise<Booking>;
  bookTourism(input: unknown, idempotencyKey: string): Promise<Booking>;
  bookParcel(input: unknown, idempotencyKey: string): Promise<Booking>;
  placeOrder(input: unknown, idempotencyKey: string): Promise<Order>;
  bookings(): Promise<Booking[]>;
  booking(id: string): Promise<{ booking: Booking; payment: Payment | null }>;
  orders(): Promise<Order[]>;
  order(id: string): Promise<{ order: Order; payment: Payment | null }>;
  transitionBooking(id: string, status: string, note?: string): Promise<Booking>;
  cancelBooking(id: string, reason?: string): Promise<Booking>;
  reviewBooking(id: string, rating: number, comment: string): Promise<unknown>;
  transitionOrder(id: string, status: string): Promise<Order>;
  initPayment(input: unknown): Promise<Payment>;
  captureSandboxPayment(id: string): Promise<{ payment: Payment; sandbox: boolean; note?: string }>;
  refundPayment(id: string, full?: boolean, reason?: string): Promise<{ payment: Payment; refundPaise: number }>;
  payments(): Promise<Payment[]>;
  transactions(): Promise<Transaction[]>;
  notifications(): Promise<{ items: Notification[]; unreadCount: number }>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  tickets(): Promise<SupportTicket[]>;
  createTicket(input: { subject: string; body: string }): Promise<SupportTicket>;
  addresses(): Promise<unknown[]>;
  createAddress(input: unknown): Promise<unknown>;
  deleteAddress(id: string): Promise<void>;
  savedPlaces(): Promise<unknown[]>;
  savePlace(input: unknown): Promise<unknown>;
  deleteSavedPlace(id: string): Promise<void>;
  reviews(listingId?: string): Promise<Review[]>;
  coupons(): Promise<Array<{ code: string; kind: string; minSubtotalPaise: number }>>;
  claimPartner(role: string, listingId: string): Promise<User>;
  registerDriver(input: unknown): Promise<{ driver: DriverProfile; user: User }>;
  driverMe(): Promise<{ driver: DriverProfile | null; dispatchRules: Record<string, unknown> }>;
  updateDriver(input: unknown): Promise<DriverProfile>;
  verifyDriverDemo(): Promise<{ driver: DriverProfile; demoNotice: string }>;
  partnerRequests(): Promise<{ bookings: Booking[]; orders: Order[]; claimedListings: unknown[] }>;
  jobs(): Promise<{ items: DispatchJob[]; driver: DriverProfile | null }>;
  acceptJob(id: string): Promise<{ job: DispatchJob; driver: DriverProfile }>;
  resetDev(): Promise<void>;
  // ---- marketplace commerce ----
  commerceCategories(): Promise<{ items: Array<{ name: string; count: number }> }>;
  commerceProducts(filter?: { category?: string; storeId?: string; q?: string }): Promise<{ items: unknown[] }>;
  productDetail(slug: string): Promise<{ product: unknown }>;
  recommendedStores(): Promise<{ items: unknown[] }>;
  recentlyViewedProducts(): Promise<{ items: unknown[] }>;
  recordProductView(slug: string): Promise<void>;
  cart(): Promise<{ lines: unknown[]; itemCount: number }>;
  addToCart(input: { productId: string; variantId: string; quantity: number; protectionPlanId?: string | null }): Promise<{ lines: unknown[] }>;
  updateCartLine(id: string, input: { quantity?: number; protectionPlanId?: string | null }): Promise<{ lines: unknown[] }>;
  removeCartLine(id: string): Promise<{ lines: unknown[] }>;
  clearCart(): Promise<void>;
  cartQuote(input: { deliverySlot?: string; coupon?: string }): Promise<unknown>;
  wishlist(): Promise<{ items: unknown[] }>;
  addToWishlist(productId: string): Promise<void>;
  removeFromWishlist(productId: string): Promise<void>;
  recentSearches(): Promise<{ items: string[] }>;
  recordSearch(q: string): Promise<void>;
  paymentMethods(totalPaise: number): Promise<{ items: PaymentMethodOption[]; note: string }>;
  checkout(input: unknown, idempotencyKey: string): Promise<Order>;
  // ---- GOWAYY PARTNER hub ----
  partnerOverview(): Promise<Record<string, unknown>>;
  partnerProfile(): Promise<{ profile: unknown }>;
  updatePartnerProfile(input: unknown): Promise<{ profile: unknown }>;
  partnerVerification(): Promise<Record<string, unknown>>;
  uploadPartnerDocument(input: { type: string; number: string }): Promise<Record<string, unknown>>;
  partnerInventory(): Promise<{ items: unknown[] }>;
  adjustInventory(input: { listingId: string; productId: string; delta: number }): Promise<Record<string, unknown>>;
  partnerMenu(): Promise<{ items: unknown[] }>;
  addMenuItem(input: unknown): Promise<{ item: unknown }>;
  updateMenuItem(id: string, input: unknown): Promise<{ item: unknown }>;
  deleteMenuItem(id: string): Promise<void>;
  partnerRooms(): Promise<{ items: unknown[] }>;
  addRoom(input: unknown): Promise<{ room: unknown }>;
  updateRoom(id: string, input: unknown): Promise<{ room: unknown }>;
  setAvailability(input: { roomId: string; date: string; delta: number }): Promise<Record<string, unknown>>;
  partnerTours(): Promise<{ items: unknown[] }>;
  addTour(input: unknown): Promise<{ tour: unknown }>;
  updateTour(id: string, input: unknown): Promise<{ tour: unknown }>;
  partnerEarnings(): Promise<Record<string, unknown>>;
  partnerSettlements(): Promise<{ items: unknown[] }>;
  requestSettlement(): Promise<{ settlement: unknown }>;
  partnerInbox(): Promise<Record<string, unknown>>;

  // ---- storefront / database-driven catalogue ----
  storefront?(): Promise<Record<string, unknown>>;
  storeDetail?(id: string): Promise<Record<string, unknown>>;
  banners?(): Promise<{ items: unknown[] }>;
  orderDetail?(id: string): Promise<Record<string, unknown>>;
  uploadImage?(input: { dataBase64: string; mimeType: string }): Promise<{ url: string }>;
  partnerCategories?(): Promise<{ items: unknown[]; mine: unknown[] }>;
  createPartnerCategory?(input: unknown): Promise<Record<string, unknown>>;
  partnerProducts?(): Promise<{ items: unknown[] }>;
  createPartnerProduct?(input: unknown): Promise<Record<string, unknown>>;
  updatePartnerProduct?(id: string, input: unknown): Promise<Record<string, unknown>>;
  partnerStores?(): Promise<{ items: unknown[] }>;
  updatePartnerStore?(id: string, input: unknown): Promise<Record<string, unknown>>;
  partnerOffers?(): Promise<{ items: unknown[] }>;
  createPartnerOffer?(input: unknown): Promise<Record<string, unknown>>;
  updatePartnerOffer?(id: string, input: unknown): Promise<Record<string, unknown>>;
  partnerCoupons?(): Promise<{ items: unknown[] }>;
  updatePartnerOrderStatus?(id: string, status: string): Promise<Record<string, unknown>>;
  partnerDeliveries?(): Promise<{ items: unknown[] }>;
  verifyDelivery?(orderId: string, code: string): Promise<Record<string, unknown>>;
  updateAddress?(id: string, input: unknown): Promise<{ address: unknown }>;
  // ---- content managed by the admin console ----
  posters?(kind?: 'food' | 'grocery'): Promise<{ items: unknown[]; food: unknown[]; grocery: unknown[] }>;
  destinations?(): Promise<{ items: unknown[] }>;
  destination?(slug: string): Promise<Record<string, unknown>>;
  serviceAreas?(): Promise<{ items: unknown[] }>;
  serviceAreaCheck?(pincode: string): Promise<{ pincode: string; food: { supported: boolean; cities: string[] }; grocery: { supported: boolean; cities: string[] } }>;
  adminPosters?(): Promise<{ items: unknown[] }>;
  createPoster?(input: unknown): Promise<Record<string, unknown>>;
  updatePoster?(id: string, input: unknown): Promise<Record<string, unknown>>;
  deletePoster?(id: string): Promise<void>;
  reorderPosters?(ids: string[]): Promise<Record<string, unknown>>;
  adminServiceAreas?(): Promise<{ items: unknown[] }>;
  createServiceArea?(input: unknown): Promise<Record<string, unknown>>;
  updateServiceArea?(id: string, input: unknown): Promise<Record<string, unknown>>;
  deleteServiceArea?(id: string): Promise<void>;
  adminDestinations?(): Promise<{ items: unknown[] }>;
  createDestination?(input: unknown): Promise<Record<string, unknown>>;
  updateDestination?(id: string, input: unknown): Promise<Record<string, unknown>>;
  deleteDestination?(id: string): Promise<void>;
  addDestinationImage?(id: string, input: unknown): Promise<Record<string, unknown>>;
  updateDestinationImage?(id: string, imageId: string, input: unknown): Promise<Record<string, unknown>>;
  deleteDestinationImage?(id: string, imageId: string): Promise<Record<string, unknown>>;
}

type FetchImpl = typeof fetch;

export function createHttpTransport(options: { baseUrl?: string; tokenStore: TokenStore; fetchImpl?: FetchImpl; demoMode?: boolean }): GowayyClient {
  const envBase = typeof import.meta !== 'undefined' ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL : undefined;
  const base = (options.baseUrl ?? envBase ?? '/api').replace(/\/$/, '');
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function request<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
    const token = options.tokenStore.get();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (init.idempotencyKey) headers['idempotency-key'] = init.idempotencyKey;
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, { method: init.method ?? 'GET', headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the GOWAYY service. Check your connection and try again.');
    }
    let payload: unknown = null;
    try { payload = await response.json(); } catch { /* empty body */ }
    if (!response.ok) {
      const p = (payload ?? {}) as { error?: string; message?: string; details?: unknown };
      throw new ApiError(response.status, p.error ?? 'REQUEST_FAILED', p.message ?? 'Something went wrong', p.details);
    }
    return payload as T;
  }
  const post = <T>(path: string, body: unknown, key?: string) => request<T>(path, { method: 'POST', body: body ?? {}, ...(key ? { idempotencyKey: key } : {}) });
  const patch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body });
  const get = <T>(path: string) => request<T>(path);
  const unwrapUser = async (r: Promise<{ user: User }>) => (await r).user;

  return {
    baseUrl: base,
    demoMode: options.demoMode ?? true,
    health: () => get('/health'),
    catalog: async () => {
      const keys: Array<[string, keyof CatalogBundle]> = [
        ['destinations', 'destinations'], ['hidden-gems', 'hiddenGems'], ['attractions', 'attractions'],
        ['places', 'places'], ['vehicles', 'vehicles'], ['shared-routes', 'sharedRoutes'],
        ['properties', 'properties'], ['restaurants', 'restaurants'], ['stores', 'stores'],
        ['packages', 'packages'], ['experiences', 'experiences'],
      ];
      const results = await Promise.all(keys.map(async ([p]) => (await get<{ items: unknown[] }>(`/catalog/${p}`)).items));
      const bundle = {} as CatalogBundle;
      keys.forEach(([, k], i) => { (bundle as unknown as Record<string, unknown>)[k] = results[i]; });
      return bundle;
    },
    search: async (q) => (await get<{ hits: SearchHit[] }>(`/search?q=${encodeURIComponent(q)}`)).hits,
    recommendations: async (destinationId) => (await get<{ groups: RecommendationGroups }>(`/recommendations?destinationId=${encodeURIComponent(destinationId)}`)).groups,
    credits: () => get('/credits'),
    estimateRoute: (from, to, vehicle) => get(`/routes/estimate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${vehicle ? `&vehicle=${encodeURIComponent(vehicle)}` : ''}`),
    register: (input) => post('/auth/register', input),
    resendOtp: (registrationId) => post('/auth/otp/send', { registrationId }),
    verifyOtp: (registrationId, code, password) => post('/auth/otp/verify', { registrationId, code, ...(password ? { password } : {}) }),
    login: (email, password) => post('/auth/login', { email, password }),
    forgotPassword: (email) => post('/auth/forgot-password', { email }),
    resetPassword: (resetId, code, password) => post('/auth/reset-password', { resetId, code, password }),
    me: async () => unwrapUser(get<{ user: User }>('/auth/me')),
    updateProfile: async (input) => unwrapUser(patch<{ user: User }>('/auth/me', input)),
    logout: () => post('/auth/logout', {}),
    deleteAccount: () => request('/auth/account', { method: 'DELETE' }),
    createJourney: async (draft) => (await post<{ journey: Journey }>('/journeys', draft)).journey,
    journeys: async () => (await get<{ items: Journey[] }>('/journeys')).items,
    journey: (id) => get(`/journeys/${id}`),
    updateJourney: async (id, patchBody) => (await patch<{ journey: Journey }>(`/journeys/${id}`, patchBody)).journey,
    bookCab: async (input, key) => (await post<{ booking: Booking }>('/bookings/cab', input, key)).booking,
    bookSharedTaxi: async (input, key) => (await post<{ booking: Booking }>('/bookings/shared-taxi', input, key)).booking,
    bookStay: async (input, key) => (await post<{ booking: Booking }>('/bookings/hotels', input, key)).booking,
    bookTourism: async (input, key) => (await post<{ booking: Booking }>('/bookings/tourism', input, key)).booking,
    bookParcel: async (input, key) => (await post<{ booking: Booking }>('/bookings/parcel', input, key)).booking,
    placeOrder: async (input, key) => (await post<{ order: Order }>('/orders', input, key)).order,
    bookings: async () => (await get<{ items: Booking[] }>('/bookings')).items,
    booking: (id) => get(`/bookings/${id}`),
    orders: async () => (await get<{ items: Order[] }>('/orders')).items,
    order: (id) => get(`/orders/${id}`),
    transitionBooking: async (id, status, note) => (await post<{ booking: Booking }>(`/bookings/${id}/transition`, { status, note })).booking,
    cancelBooking: async (id, reason) => (await post<{ booking: Booking }>(`/bookings/${id}/cancel`, { reason })).booking,
    reviewBooking: async (id, rating, comment) => (await post<{ review: unknown }>(`/bookings/${id}/review`, { rating, comment })).review,
    transitionOrder: async (id, status) => (await post<{ order: Order }>(`/orders/${id}/transition`, { status })).order,
    initPayment: async (input) => (await post<{ payment: Payment }>('/payments/init', input)).payment,
    captureSandboxPayment: (id) => post(`/payments/${id}/sandbox-capture`, {}),
    refundPayment: (id, full, reason) => post(`/payments/${id}/refund`, { full, reason }),
    payments: async () => (await get<{ items: Payment[] }>('/payments')).items,
    transactions: async () => (await get<{ items: Transaction[] }>('/transactions')).items,
    notifications: () => get('/notifications'),
    markNotificationRead: async (id) => { await post(`/notifications/${id}/read`, {}); },
    markAllNotificationsRead: async () => { await post('/notifications/read-all', {}); },
    tickets: async () => (await get<{ items: SupportTicket[] }>('/support/tickets')).items,
    createTicket: async (input) => (await post<{ ticket: SupportTicket }>('/support/tickets', input)).ticket,
    addresses: async () => (await get<{ items: unknown[] }>('/addresses')).items,
    createAddress: async (input) => (await post<{ address: unknown }>('/addresses', input)).address,
    deleteAddress: async (id) => { await request(`/addresses/${id}`, { method: 'DELETE' }); },
    savedPlaces: async () => (await get<{ items: unknown[] }>('/saved-places')).items,
    savePlace: async (input) => (await post<{ savedPlace: unknown }>('/saved-places', input)).savedPlace,
    deleteSavedPlace: async (id) => { await request(`/saved-places/${id}`, { method: 'DELETE' }); },
    coupons: async () => (await get<{ items: Array<{ code: string; kind: string; minSubtotalPaise: number }> }>('/coupons')).items,
    reviews: async (listingId) => (await get<{ items: Review[] }>(`/reviews${listingId ? `?listingId=${encodeURIComponent(listingId)}` : ''}`)).items,
    claimPartner: async (role, listingId) => unwrapUser(post<{ user: User }>('/partners/claim', { role, listingId })),
    registerDriver: (input) => post('/partners/drivers', input),
    driverMe: () => get('/partners/drivers/me'),
    updateDriver: async (input) => (await patch<{ driver: DriverProfile }>('/partners/drivers/me', input)).driver,
    verifyDriverDemo: () => post('/partners/drivers/verify-demo', {}),
    partnerRequests: () => get('/partners/requests'),
    jobs: () => get('/partners/jobs'),
    acceptJob: (id) => post(`/partners/jobs/${id}/accept`, {}),
    resetDev: async () => { await post('/dev/reset', {}); },
    commerceCategories: () => get('/commerce/categories'),
    commerceProducts: async (filter) => {
      const qs = new URLSearchParams();
      if (filter?.category) qs.set('category', filter.category);
      if (filter?.storeId) qs.set('storeId', filter.storeId);
      if (filter?.q) qs.set('q', filter.q);
      return get(`/commerce/products${qs.size ? `?${qs}` : ''}`);
    },
    productDetail: (slug) => get(`/commerce/products/${encodeURIComponent(slug)}`),
    recommendedStores: () => get('/commerce/stores'),
    recentlyViewedProducts: () => get('/products/recently-viewed'),
    recordProductView: async (slug) => { await post(`/products/${encodeURIComponent(slug)}/view`, {}); },
    cart: () => get('/cart'),
    addToCart: (input) => post('/cart/items', input),
    updateCartLine: (id, input) => patch(`/cart/items/${encodeURIComponent(id)}`, input),
    removeCartLine: async (id) => (await request<{ lines: unknown[] }>(`/cart/items/${encodeURIComponent(id)}`, { method: 'DELETE' })).lines as never as { lines: unknown[] } as never,
    clearCart: async () => { await post('/cart/clear', {}); },
    cartQuote: (input) => post('/cart/quote', input),
    wishlist: () => get('/wishlist'),
    addToWishlist: async (productId) => { await post('/wishlist', { productId }); },
    removeFromWishlist: async (productId) => { await request(`/wishlist/${encodeURIComponent(productId)}`, { method: 'DELETE' }); },
    recentSearches: () => get('/search/recent'),
    recordSearch: async (q) => { await post('/search/recent', { q }); },
    paymentMethods: (totalPaise) => get(`/checkout/payment-methods?totalPaise=${Math.max(0, Math.round(totalPaise))}`),
    checkout: async (input, key) => (await post<{ order: Order }>('/checkout', input, key)).order,
    partnerOverview: () => get('/partner/overview'),
    partnerProfile: () => get('/partner/profile'),
    updatePartnerProfile: (input) => patch('/partner/profile', input),
    partnerVerification: () => get('/partner/verification'),
    uploadPartnerDocument: (input) => post('/partner/documents', input),
    partnerInventory: () => get('/partner/inventory'),
    adjustInventory: (input) => post('/partner/inventory', input),
    partnerMenu: () => get('/partner/menu'),
    addMenuItem: (input) => post('/partner/menu', input),
    updateMenuItem: (id, input) => patch(`/partner/menu/${encodeURIComponent(id)}`, input),
    deleteMenuItem: async (id) => { await request(`/partner/menu/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
    partnerRooms: () => get('/partner/rooms'),
    addRoom: (input) => post('/partner/rooms', input),
    updateRoom: (id, input) => patch(`/partner/rooms/${encodeURIComponent(id)}`, input),
    setAvailability: (input) => post('/partner/availability', input),
    partnerTours: () => get('/partner/tours'),
    addTour: (input) => post('/partner/tours', input),
    updateTour: (id, input) => patch(`/partner/tours/${encodeURIComponent(id)}`, input),
    partnerEarnings: () => get('/partner/earnings'),
    partnerSettlements: () => get('/partner/settlements'),
    requestSettlement: () => post('/partner/settlements/request', {}),
    partnerInbox: () => get('/partner/inbox'),
    storefront: () => get('/storefront'),
    storeDetail: (id) => get(`/stores/${encodeURIComponent(id)}`),
    banners: () => get('/banners'),
    orderDetail: (id) => get(`/orders/${encodeURIComponent(id)}`),
    uploadImage: (input) => post('/uploads', input),
    partnerCategories: () => get('/partner/catalog/categories'),
    createPartnerCategory: (input) => post('/partner/catalog/categories', input),
    partnerProducts: () => get('/partner/catalog/products'),
    createPartnerProduct: (input) => post('/partner/catalog/products', input),
    updatePartnerProduct: (id, input) => patch(`/partner/catalog/products/${encodeURIComponent(id)}`, input),
    partnerStores: () => get('/partner/catalog/stores'),
    updatePartnerStore: (id, input) => patch(`/partner/stores/${encodeURIComponent(id)}`, input),
    partnerOffers: () => get('/partner/offers'),
    createPartnerOffer: (input) => post('/partner/offers', input),
    updatePartnerOffer: (id, input) => patch(`/partner/offers/${encodeURIComponent(id)}`, input),
    partnerCoupons: () => get('/partner/coupons'),
    updatePartnerOrderStatus: (id, status) => post(`/partner/orders/${encodeURIComponent(id)}/status`, { status }),
    partnerDeliveries: () => get('/partner/deliveries'),
    verifyDelivery: (orderId, code) => post(`/partner/deliveries/${encodeURIComponent(orderId)}/verify`, { code }),
    updateAddress: (id, input) => patch(`/addresses/${encodeURIComponent(id)}`, input),
    posters: (kind) => get(`/posters${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`),
    destinations: () => get('/destinations'),
    destination: (slug) => get(`/destinations/${encodeURIComponent(slug)}`),
    serviceAreas: () => get('/service-areas'),
    serviceAreaCheck: (pincode) => get(`/service-areas?pincode=${encodeURIComponent(pincode)}`),
    adminPosters: () => get('/admin/posters'),
    createPoster: (input) => post('/admin/posters', input),
    updatePoster: (id, input) => patch(`/admin/posters/${encodeURIComponent(id)}`, input),
    deletePoster: (id) => request(`/admin/posters/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    reorderPosters: (ids) => post('/admin/posters/reorder', { ids }),
    adminServiceAreas: () => get('/admin/service-areas'),
    createServiceArea: (input) => post('/admin/service-areas', input),
    updateServiceArea: (id, input) => patch(`/admin/service-areas/${encodeURIComponent(id)}`, input),
    deleteServiceArea: (id) => request(`/admin/service-areas/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    adminDestinations: () => get('/admin/destinations'),
    createDestination: (input) => post('/admin/destinations', input),
    updateDestination: (id, input) => patch(`/admin/destinations/${encodeURIComponent(id)}`, input),
    deleteDestination: (id) => request(`/admin/destinations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    addDestinationImage: (id, input) => post(`/admin/destinations/${encodeURIComponent(id)}/images`, input),
    updateDestinationImage: (id, imageId, input) => patch(`/admin/destinations/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}`, input),
    deleteDestinationImage: (id, imageId) => request(`/admin/destinations/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}`, { method: 'DELETE' }),
  };
}
