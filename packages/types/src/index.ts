/** Shared domain model for GOWAYY web + mobile + server. */

export type ServiceKind =
  | 'cab' | 'shared_taxi' | 'food' | 'grocery' | 'hotel' | 'homestay'
  | 'tourism' | 'experience' | 'package' | 'parcel' | 'marketplace';

export const SERVICE_KINDS: readonly ServiceKind[] = [
  'cab', 'shared_taxi', 'food', 'grocery', 'hotel', 'homestay',
  'tourism', 'experience', 'package', 'parcel', 'marketplace',
] as const;

export type BookingStatus =
  | 'draft' | 'requested' | 'awaiting_payment' | 'confirmed' | 'assigned'
  | 'in_progress' | 'completed' | 'cancelled' | 'refunded' | 'failed';

export type OrderStatus =
  | 'created' | 'accepted' | 'preparing' | 'packed' | 'out_for_delivery'
  | 'delivered' | 'cancelled' | 'refunded';

export type PaymentStatus =
  | 'requires_action' | 'processing' | 'captured' | 'failed'
  | 'refunded' | 'partially_refunded';

export type PaymentMethod = 'upi' | 'upi_intent' | 'gateway' | 'cash';
export type Role = 'customer' | 'driver' | 'restaurant' | 'grocery' | 'property' | 'tour_operator';
export type VerificationState = 'unverified' | 'pending' | 'verified' | 'rejected';
export type ThemeMode = 'light' | 'dark';

export interface Coordinates { lat: number; lng: number }

export interface Place extends Coordinates {
  id: string;
  name: string;
  address?: string;
  locality?: string;
  kind?: 'airport' | 'stand' | 'landmark' | 'address' | 'destination' | 'business';
}

export interface ImageAsset {
  status: 'verified' | 'unavailable';
  assetPath?: string;
  thumbPath?: string;
  alt: string;
  credit?: string;
  license?: string;
  sourceUrl?: string;
  verificationNote?: string;
}

export interface Attraction {
  id: string;
  destinationId: string;
  name: string;
  description: string;
  coords: Coordinates;
  category: string;
  typicalVisitMinutes: number | null;
  image: ImageAsset;
  infoStatus: 'published-reference' | 'community-reference';
}

export interface Destination {
  id: string;
  slug: string;
  name: string;
  region: string;
  state: string;
  country: string;
  coords: Coordinates;
  coordinateAccuracy: 'published' | 'approximate';
  elevationM: number | null;
  elevationVerified: boolean;
  description: string;
  bestSeason: string | null;
  estimatedVisitHours: number | null;
  hiddenGem: boolean;
  images: ImageAsset[];
  activities: string[];
  accessibility: string;
  safety: string;
  weatherNote: string;
  sources: string[];
  dataSourceNote?: string;
  infoStatus: 'published-reference' | 'community-reference';
}

export interface HiddenGem {
  id: string;
  destinationId: string;
  name: string;
  coords: Coordinates;
  coordinateAccuracy: 'approximate';
  route: string;
  accessibility: string;
  bestPeriod: string;
  localTravelGuidance: string;
  restrictions: string;
  safetyWarnings: string;
  source: string;
  infoStatus: 'community-reference';
}

export interface Listing {
  id: string;
  service: ServiceKind;
  name: string;
  destinationId: string;
  description: string;
  coords: Coordinates;
  dataClass: 'demo-listing';
  availabilitySource: 'seeded-inventory';
  image: ImageAsset;
  tags: string[];
  /** No ratings are fabricated. Only populated when an audited review record exists. */
  rating?: { average: number; count: number; source: string };
}

export interface Property extends Listing {
  service: 'hotel' | 'homestay';
  propertyType: 'hotel' | 'resort' | 'homestay' | 'lodge' | 'guesthouse' | 'hostel' | 'camp';
  rooms: RoomType[];
  amenities: string[];
  houseRules: string;
  cancellationPolicy: string;
  taxesPercent: number;
}

export interface RoomType {
  id: string;
  name: string;
  capacityAdults: number;
  capacityChildren: number;
  nightlyRatePaise: number;
  totalRooms: number;
}

export interface Restaurant extends Listing {
  service: 'food';
  cuisines: string[];
  openingHours: string;
  prepMinutes: number;
  menu: MenuItem[];
}

export interface MenuItem {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  pricePaise: number;
  category: string;
  vegetarian: boolean;
  customizations: Array<{ id: string; label: string; extraPaise: number }>;
  available: boolean;
}

export interface GroceryStore extends Listing {
  service: 'grocery';
  deliveryCoverageKm: number;
  slots: string[];
  products: GroceryProduct[];
}

export interface GroceryProduct {
  id: string;
  storeId: string;
  name: string;
  category: string;
  unit: string;
  pricePaise: number;
  stock: number;
  substitutionAllowed: boolean;
}

export interface VehicleClass {
  id: string;
  name: string;
  category: 'hatchback' | 'sedan' | 'suv' | 'premium' | 'shared' | 'tourist_taxi' | 'airport' | 'outstation';
  seats: number;
  baseFarePaise: number;
  perKmPaise: number;
  perMinutePaise: number;
  minimumFarePaise: number;
  description: string;
}

export interface SharedTaxiRoute {
  id: string;
  stand: string;
  fromId: string;
  toId: string;
  pricePaise: number;
  seatsTotal: number;
  departureTimes: string[];
  operator: string;
  permitNote: string;
}

export interface TourPackage {
  id: string;
  destinationId: string;
  name: string;
  description: string;
  durationHours: number;
  pricePaise: number;
  includes: string[];
  activityIds: string[];
}

export interface Experience {
  id: string;
  destinationId: string;
  name: string;
  description: string;
  durationMinutes: number;
  pricePaise: number;
  host: string;
}

export interface Journey {
  id: string;
  userId: string;
  title: string;
  destinationId: string | null;
  pickup: Place | null;
  dropoff: Place | null;
  startDate: string | null;
  endDate: string | null;
  travellers: number;
  preferences: string[];
  serviceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FareLine { label: string; paise: number }
export interface PriceBreakdown {
  lines: FareLine[];
  subtotalPaise: number;
  taxPaise: number;
  commissionPaise: number;
  totalPaise: number;
  currency: 'INR';
}

export interface Booking {
  id: string;
  reference: string;
  userId: string;
  service: ServiceKind;
  status: BookingStatus;
  journeyId: string | null;
  listingId: string | null;
  title: string;
  details: Record<string, unknown>;
  price: PriceBreakdown;
  paymentId: string | null;
  createdAt: string;
  updatedAt: string;
  statusHistory: Array<{ status: BookingStatus; at: string; by: string; note?: string }>;
}

export interface Order {
  id: string;
  reference: string;
  userId: string;
  service: 'food' | 'grocery';
  status: OrderStatus;
  journeyId: string | null;
  listingId: string;
  items: Array<{ id: string; name: string; quantity: number; unitPricePaise: number; options?: string[] }>;
  price: PriceBreakdown;
  deliveryAddress: string;
  instructions: string;
  slot?: string | null;
  substitution?: string | null;
  coupon?: string | null;
  paymentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  bookingId: string | null;
  orderId: string | null;
  userId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amountPaise: number;
  provider: 'sandbox';
  providerReference: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  paymentId: string;
  type: 'charge' | 'refund' | 'commission' | 'settlement';
  amountPaise: number;
  note: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  channel: 'in_app' | 'push';
  readAt: string | null;
  createdAt: string;
  dedupeKey: string;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roles: Role[];
  createdAt: string;
  deletedAt: string | null;
}

export interface Session { token: string; userId: string; expiresAt: string }

export interface DriverProfile {
  id: string;
  userId: string;
  name: string;
  phone: string;
  vehicleClass: string;
  services: ServiceKind[];
  verification: VerificationState;
  online: boolean;
  activeJobId: string | null;
  documents: Record<string, string>;
  createdAt: string;
}

export interface DispatchJob {
  id: string;
  service: ServiceKind;
  bookingId: string | null;
  orderId: string | null;
  status: 'open' | 'offered' | 'accepted' | 'completed' | 'cancelled';
  driverId: string | null;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  body: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

export interface SearchHit {
  id: string;
  kind: 'destination' | 'attraction' | 'property' | 'restaurant' | 'food' | 'grocery' | 'taxi_route' | 'experience' | 'package' | 'product';
  title: string;
  subtitle: string;
  service: ServiceKind | null;
  destinationId: string | null;
  href: string;
}
