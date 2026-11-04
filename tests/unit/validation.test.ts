import { describe, expect, it } from 'vitest';
import {
  assessPassword, passwordSchema, nameSchema, emailSchema, stepOneSchema, stepTwoSchema,
  otpSchema, loginSchema, addressSchema, coordsSchema, cabBookingSchema, stayBookingSchema,
  orderSchema, tourismBookingSchema, parcelBookingSchema, paymentInitSchema,
  driverRegistrationSchema, supportTicketSchema,
} from '@gowayy/validation';

const strong = 'Orchid!Ridge42';

describe('password validation and strength meter', () => {
  it('accepts a strong passphrase and flags weak inputs', () => {
    expect(passwordSchema.safeParse(strong).success).toBe(true);
    for (const weak of ['short', 'alllowercase1!', 'NOLOWERCASE1!', 'NoNumbers!!', 'NoSymbols123']) {
      expect(passwordSchema.safeParse(weak).success).toBe(false);
    }
  });

  it('produces actionable issues and a suggestion', () => {
    const a = assessPassword('password');
    expect(a.valid).toBe(false);
    expect(a.issues.length).toBeGreaterThan(1);
    expect(a.suggestion.toLowerCase()).toContain('suggestion');
    expect(a.label).toBe('Too weak');
  });

  it('rejects the user\'s own name or email inside the password', () => {
    const a = assessPassword('Aarav!Ridge42', { firstName: 'Aarav', email: 'aarav@example.com' });
    expect(a.issues.some((i) => i.toLowerCase().includes('name or email'))).toBe(true);
    expect(a.valid).toBe(false);
  });

  it('scores a valid passphrase above a weak one', () => {
    expect(assessPassword(strong).score).toBeGreaterThan(assessPassword('aaaaaaaaaaaa').score);
    expect(assessPassword(strong).valid).toBe(true);
  });
});

describe('registration schemas', () => {
  it('step one requires two valid names', () => {
    expect(stepOneSchema.safeParse({ firstName: 'Aarav', lastName: "D'Souza" }).success).toBe(true);
    expect(stepOneSchema.safeParse({ firstName: 'A', lastName: 'Sharma' }).success).toBe(false);
    expect(stepOneSchema.safeParse({ firstName: 'Aarav2', lastName: 'Sharma' }).success).toBe(false);
  });

  it('step two validates email, password and confirmation', () => {
    expect(emailSchema.safeParse('  AARAV@Example.COM ').data).toBe('aarav@example.com');
    expect(stepTwoSchema.safeParse({ email: 'aarav@example.com', password: strong, confirmPassword: strong }).success).toBe(true);
    const mismatch = stepTwoSchema.safeParse({ email: 'aarav@example.com', password: strong, confirmPassword: strong + 'x' });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) expect(mismatch.error.issues[0].path).toEqual(['confirmPassword']);
    expect(stepTwoSchema.safeParse({ email: 'not-an-email', password: strong, confirmPassword: strong }).success).toBe(false);
  });

  it('OTP accepts exactly six digits', () => {
    expect(otpSchema.safeParse('012345').success).toBe(true);
    for (const v of ['12345', '1234567', '12a456', '']) expect(otpSchema.safeParse(v).success).toBe(false);
  });

  it('login and forgot-password validate input', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('domain form schemas', () => {
  const cab = {
    pickupId: 'plc_bagdogra_airport', dropoffId: 'plc_darjeeling', vehicleClassId: 'veh_sedan',
    tripType: 'one_way', scheduledAt: null, passengers: 2, journeyId: null,
  } as const;
  it('cab booking rejects identical pickup/dropoff and invalid passengers', () => {
    expect(cabBookingSchema.safeParse(cab).success).toBe(true);
    expect(cabBookingSchema.safeParse({ ...cab, dropoffId: cab.pickupId }).success).toBe(false);
    expect(cabBookingSchema.safeParse({ ...cab, passengers: 9 }).success).toBe(false);
    expect(cabBookingSchema.safeParse({ ...cab, tripType: 'hourly' }).success).toBe(false);
  });

  const stay = {
    propertyId: 'prp_1', roomId: 'rom_1', checkIn: '2026-12-01', checkOut: '2026-12-03',
    adults: 2, children: 0, rooms: 1, guestName: 'Aarav Sharma', journeyId: null,
  };
  it('stay booking requires checkout after checkin and ISO dates', () => {
    expect(stayBookingSchema.safeParse(stay).success).toBe(true);
    expect(stayBookingSchema.safeParse({ ...stay, checkOut: '2026-11-30' }).success).toBe(false);
    expect(stayBookingSchema.safeParse({ ...stay, checkIn: '01/12/2026' }).success).toBe(false);
  });

  const item = { id: 'itm_1', name: 'Momos', quantity: 2, unitPricePaise: 12000, options: [] };
  it('orders require at least one item and a real address', () => {
    expect(orderSchema.safeParse({ listingId: 'rst_1', service: 'food', items: [item], deliveryAddress: '12 Mall Road, Darjeeling', instructions: '', slot: null, journeyId: null }).success).toBe(true);
    expect(orderSchema.safeParse({ listingId: 'rst_1', service: 'food', items: [], deliveryAddress: '12 Mall Road', instructions: '', slot: null, journeyId: null }).success).toBe(false);
    expect(orderSchema.safeParse({ listingId: 'rst_1', service: 'food', items: [item], deliveryAddress: 'x', instructions: '', slot: null, journeyId: null }).success).toBe(false);
  });

  it('tourism, parcel and payment schemas reject malformed values', () => {
    const tourism = { offeringId: 'tou_1', service: 'package', date: '2026-12-01', guests: 2, journeyId: null };
    expect(tourismBookingSchema.safeParse(tourism).success).toBe(true);
    expect(tourismBookingSchema.safeParse({ ...tourism, guests: 0 }).success).toBe(false);
    const parcel = { pickupId: 'plc_a', dropoffId: 'plc_b', weightKg: 1.5, description: 'Documents', recipientPhone: '9876543210', journeyId: null };
    expect(parcelBookingSchema.safeParse(parcel).success).toBe(true);
    expect(parcelBookingSchema.safeParse({ ...parcel, recipientPhone: '123' }).success).toBe(false);
    const payment = { bookingId: 'bkg_1', orderId: null, method: 'upi', amountPaise: 120000, idempotencyKey: 'idem_12345678' };
    expect(paymentInitSchema.safeParse(payment).success).toBe(true);
    expect(paymentInitSchema.safeParse({ ...payment, amountPaise: 0 }).success).toBe(false);
    expect(paymentInitSchema.safeParse({ ...payment, idempotencyKey: 'short' }).success).toBe(false);
  });

  it('address, coordinates, driver and support ticket schemas validate boundaries', () => {
    expect(addressSchema.safeParse({ label: 'Home', line: '12 Mall Road, Darjeeling', city: 'Darjeeling', pincode: '734101' }).success).toBe(true);
    expect(addressSchema.safeParse({ label: 'Home', line: '12 Mall Road', city: 'Darjeeling', pincode: '7341' }).success).toBe(false);
    expect(coordsSchema.safeParse({ lat: 27.036, lng: 88.2627 }).success).toBe(true);
    expect(coordsSchema.safeParse({ lat: 91, lng: 88 }).success).toBe(false);
    const driver = {
      name: 'Ravi Thapa', phone: '9876543210', vehicleClass: 'hatchback', services: ['cab', 'parcel'],
      licenceNumber: 'WB-2020-1234567', vehicleRegistration: 'WB73A1234', insuranceNumber: 'INS-998877',
    };
    expect(driverRegistrationSchema.safeParse(driver).success).toBe(true);
    expect(driverRegistrationSchema.safeParse({ ...driver, services: [] }).success).toBe(false);
    expect(driverRegistrationSchema.safeParse({ ...driver, services: ['hotel'] }).success).toBe(false);
    expect(supportTicketSchema.safeParse({ subject: 'Refund', body: 'Please refund my cancelled cab booking.' }).success).toBe(true);
    expect(supportTicketSchema.safeParse({ subject: 'R', body: 'too short' }).success).toBe(false);
  });
});
