/**
 * Deterministic money maths in integer paise. Every quote is an estimate derived
 * from an explicit rate card — never a fabricated "market price" or random surge.
 */
import type { PriceBreakdown, ServiceKind, VehicleClass } from '@gowayy/types';

export interface QuoteInput {
  distanceKm: number;
  durationMin: number;
  vehicle: VehicleClass;
  tripType: 'one_way' | 'round_trip';
  passengers: number;
}

const round = (n: number): number => Math.round(n);
export const GST_PERCENT = 5;

function finish(lines: PriceBreakdown['lines'], taxPercent: number, commissionPercent: number): PriceBreakdown {
  const subtotalPaise = lines.reduce((s, l) => s + l.paise, 0);
  const taxPaise = round((subtotalPaise * taxPercent) / 100);
  const commissionPaise = round((subtotalPaise * commissionPercent) / 100);
  return {
    lines, subtotalPaise, taxPaise, commissionPaise,
    totalPaise: subtotalPaise + taxPaise, currency: 'INR',
  };
}

export function quoteCabFare(input: QuoteInput): PriceBreakdown {
  const km = Math.max(0, input.distanceKm);
  const min = Math.max(0, input.durationMin);
  const multiplier = input.tripType === 'round_trip' ? 2 : 1;
  const lines: PriceBreakdown['lines'] = [
    { label: 'Base fare', paise: round(input.vehicle.baseFarePaise * multiplier) },
    { label: `Distance (${km.toFixed(1)} km)`, paise: round(km * input.vehicle.perKmPaise * multiplier) },
    { label: `Estimated time (${Math.round(min)} min)`, paise: round(min * input.vehicle.perMinutePaise * multiplier) },
  ];
  const subtotal = lines.reduce((s, l) => s + l.paise, 0);
  if (subtotal < input.vehicle.minimumFarePaise) {
    lines.push({ label: 'Minimum fare adjustment', paise: input.vehicle.minimumFarePaise - subtotal });
  }
  return finish(lines, GST_PERCENT, COMMISSION_RATES.cab);
}

export function quoteSharedTaxiFare(pricePaise: number, seats: number): PriceBreakdown {
  return finish([{ label: `Fixed operator fare × ${seats} seat(s)`, paise: pricePaise * seats }], 0, COMMISSION_RATES.shared_taxi);
}

export interface OrderPriceInput {
  items: Array<{ name: string; quantity: number; unitPricePaise: number }>;
  deliveryFeePaise: number;
  discountPaise?: number;
  taxPercent?: number;
  service: 'food' | 'grocery';
}

export function priceOrder(input: OrderPriceInput): PriceBreakdown {
  const lines: PriceBreakdown['lines'] = input.items.map((i) => ({
    label: `${i.quantity} × ${i.name}`, paise: i.quantity * i.unitPricePaise,
  }));
  lines.push({ label: 'Delivery fee', paise: input.deliveryFeePaise });
  if (input.discountPaise && input.discountPaise > 0) lines.push({ label: 'Coupon discount', paise: -input.discountPaise });
  return finish(lines, input.taxPercent ?? 5, COMMISSION_RATES[input.service]);
}

export function priceStay(input: { nightlyRatePaise: number; nights: number; rooms: number; taxesPercent: number }): PriceBreakdown {
  const nights = Math.max(1, input.nights); const rooms = Math.max(1, input.rooms);
  return finish([
    { label: `${rooms} room(s) × ${nights} night(s)`, paise: input.nightlyRatePaise * nights * rooms },
  ], input.taxesPercent, COMMISSION_RATES.hotel);
}

export function priceTourism(input: { basePaise: number; guests: number; service: 'tourism' | 'experience' | 'package' }): PriceBreakdown {
  return finish([{ label: `${input.guests} guest(s)`, paise: input.basePaise * input.guests }], GST_PERCENT, COMMISSION_RATES[input.service]);
}

export function priceParcel(input: { distanceKm: number; weightKg: number }): PriceBreakdown {
  const base = 6000; const perKm = 1400; const weightSurcharge = round(Math.max(0, input.weightKg - 1) * 1200);
  return finish([
    { label: 'Pickup base', paise: base },
    { label: `Distance (${input.distanceKm.toFixed(1)} km)`, paise: round(input.distanceKm * perKm) },
    ...(weightSurcharge > 0 ? [{ label: 'Weight surcharge', paise: weightSurcharge }] : []),
  ], GST_PERCENT, COMMISSION_RATES.parcel);
}

/** Platform commission rates as a percentage of the pre-tax subtotal. */
export const COMMISSION_RATES: Record<ServiceKind, number> = {
  cab: 12, shared_taxi: 8, food: 15, grocery: 10, hotel: 12, homestay: 12,
  tourism: 14, experience: 14, package: 14, parcel: 12,
};

export function commissionFor(service: ServiceKind, subtotalPaise: number): number {
  return round((subtotalPaise * COMMISSION_RATES[service]) / 100);
}

export function taxBreakdown(price: PriceBreakdown): { taxablePaise: number; taxPaise: number; taxPercent: number; totalPaise: number } {
  return { taxablePaise: price.subtotalPaise, taxPaise: price.taxPaise, taxPercent: price.subtotalPaise ? round((price.taxPaise / price.subtotalPaise) * 100) : 0, totalPaise: price.totalPaise };
}

export interface RefundPolicy { kind: 'full' | 'partial' | 'none'; percent?: number; flatFeePaise?: number }
export function refundableAmount(paidPaise: number, policy: RefundPolicy): number {
  if (policy.kind === 'none') return 0;
  const percent = policy.kind === 'full' ? 100 : (policy.percent ?? 0);
  return Math.max(0, round((paidPaise * percent) / 100) - (policy.flatFeePaise ?? 0));
}

export function assertIdempotency(keys: string[], key: string): boolean {
  return !keys.includes(key);
}
