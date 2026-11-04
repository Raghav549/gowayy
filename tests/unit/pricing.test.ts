import { describe, expect, it } from 'vitest';
import {
  quoteCabFare, quoteSharedTaxiFare, priceOrder, priceStay, priceTourism, priceParcel,
  commissionFor, taxBreakdown, refundableAmount, assertIdempotency, COMMISSION_RATES, GST_PERCENT,
} from '@gowayy/pricing-engine';
import { catalogue } from '@gowayy/catalog';
import type { VehicleClass } from '@gowayy/types';

const vehicle: VehicleClass = catalogue.vehicles[0];

describe('pricing engine — integer paise, published rate cards', () => {
  it('cab fare is a transparent sum of base, distance, time and GST', () => {
    const q = quoteCabFare({ distanceKm: 20, durationMin: 60, vehicle, tripType: 'one_way', passengers: 2 });
    expect(q.currency).toBe('INR');
    expect(q.subtotalPaise).toBe(q.lines.reduce((s, l) => s + l.paise, 0));
    expect(q.totalPaise).toBe(q.subtotalPaise + q.taxPaise);
    expect(q.taxPaise).toBe(Math.round((q.subtotalPaise * GST_PERCENT) / 100));
    expect(q.lines[0].label).toBe('Base fare');
    expect(q.lines[0].paise).toBe(vehicle.baseFarePaise);
    expect(q.commissionPaise).toBe(Math.round((q.subtotalPaise * COMMISSION_RATES.cab) / 100));
  });

  it('round trips cost at least as much as one way and the minimum fare is honoured', () => {
    const one = quoteCabFare({ distanceKm: 1, durationMin: 2, vehicle, tripType: 'one_way', passengers: 1 });
    const round = quoteCabFare({ distanceKm: 1, durationMin: 2, vehicle, tripType: 'round_trip', passengers: 1 });
    expect(round.subtotalPaise).toBeGreaterThanOrEqual(one.subtotalPaise);
    expect(one.subtotalPaise).toBeGreaterThanOrEqual(vehicle.minimumFarePaise);
  });

  it('shared taxi fares use operator-defined prices with no added tax', () => {
    const q = quoteSharedTaxiFare(25000, 2);
    expect(q.subtotalPaise).toBe(50000);
    expect(q.taxPaise).toBe(0);
    expect(q.totalPaise).toBe(50000);
  });

  it('orders include delivery, coupon discount, tax and commission', () => {
    const q = priceOrder({
      items: [{ name: 'Momos', quantity: 2, unitPricePaise: 12000 }],
      deliveryFeePaise: 4000, discountPaise: 10000, taxPercent: 5, service: 'food',
    });
    expect(q.subtotalPaise).toBe(24000 + 4000 - 10000);
    expect(q.lines.some((l) => l.paise < 0)).toBe(true);
    expect(q.totalPaise).toBe(q.subtotalPaise + q.taxPaise);
    expect(q.commissionPaise).toBe(commissionFor('food', q.subtotalPaise));
  });

  it('stay, tourism and parcel prices are deterministic', () => {
    const stay = priceStay({ nightlyRatePaise: 300000, nights: 3, rooms: 2, taxesPercent: 12 });
    expect(stay.subtotalPaise).toBe(1800000);
    expect(stay.taxPaise).toBe(216000);
    const tour = priceTourism({ basePaise: 150000, guests: 3, service: 'package' });
    expect(tour.subtotalPaise).toBe(450000);
    const parcel = priceParcel({ distanceKm: 10, weightKg: 2 });
    expect(parcel.subtotalPaise).toBeGreaterThan(parcel.lines[0].paise);
    expect(parcel.subtotalPaise).toBe(6000 + 14000 + 1200);
  });

  it('tax breakdown, refunds and idempotency', () => {
    const q = priceStay({ nightlyRatePaise: 100000, nights: 2, rooms: 1, taxesPercent: 12 });
    const t = taxBreakdown(q);
    expect(t.taxPercent).toBe(12);
    expect(t.totalPaise).toBe(q.totalPaise);
    expect(refundableAmount(100000, { kind: 'full' })).toBe(100000);
    expect(refundableAmount(100000, { kind: 'none' })).toBe(0);
    expect(refundableAmount(100000, { kind: 'partial', percent: 80, flatFeePaise: 5000 })).toBe(75000);
    expect(assertIdempotency(['a', 'b'], 'c')).toBe(true);
    expect(assertIdempotency(['a', 'b'], 'b')).toBe(false);
  });

  it('never returns non-integer paise', () => {
    const values = [
      quoteCabFare({ distanceKm: 13.37, durationMin: 41.5, vehicle, tripType: 'round_trip', passengers: 3 }),
      priceOrder({ items: [{ name: 'Tea', quantity: 3, unitPricePaise: 3333 }], deliveryFeePaise: 3000, service: 'grocery' }),
      priceParcel({ distanceKm: 7.13, weightKg: 1.7 }),
    ];
    for (const p of values) {
      expect(Number.isInteger(p.subtotalPaise)).toBe(true);
      expect(Number.isInteger(p.taxPaise)).toBe(true);
      expect(Number.isInteger(p.totalPaise)).toBe(true);
      expect(Number.isInteger(p.commissionPaise)).toBe(true);
    }
  });
});
