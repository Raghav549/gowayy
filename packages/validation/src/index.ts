import { z } from 'zod';

export const nameSchema = z.string().trim().min(2, 'Enter at least 2 characters').max(40, 'Use 40 characters or fewer')
  .regex(/^[\p{L}\p{M}'\-\s.]+$/u, 'Use letters, spaces, hyphens or apostrophes only');

export const emailSchema = z.string().trim().toLowerCase().min(5).max(254).email('Enter a valid email address');

export const passwordSchema = z.string()
  .min(10, 'Use at least 10 characters')
  .max(72, 'Use 72 characters or fewer')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[0-9]/, 'Include a number')
  .regex(/[^A-Za-z0-9]/, 'Include a symbol');

export interface PasswordAssessment {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too weak' | 'Weak' | 'Fair' | 'Strong' | 'Very strong';
  issues: string[];
  suggestion: string;
  valid: boolean;
}

/** Deterministic, explainable strength assessment — no network calls. */
export function assessPassword(password: string, personal: { firstName?: string; lastName?: string; email?: string } = {}): PasswordAssessment {
  const issues: string[] = [];
  if (password.length < 10) issues.push('Use at least 10 characters');
  if (!/[a-z]/.test(password)) issues.push('Add a lowercase letter');
  if (!/[A-Z]/.test(password)) issues.push('Add an uppercase letter');
  if (!/[0-9]/.test(password)) issues.push('Add a number');
  if (!/[^A-Za-z0-9]/.test(password)) issues.push('Add a symbol');
  const lowered = password.toLowerCase();
  for (const word of [personal.firstName, personal.lastName, personal.email?.split('@')[0]]) {
    if (word && word.length >= 3 && lowered.includes(word.toLowerCase())) issues.push('Avoid your name or email in the password');
  }
  if (/^(?:password|qwerty|12345|letmein|gowayy)/i.test(password)) issues.push('Avoid common passwords');
  if (/(.)\1{2,}/.test(password)) issues.push('Avoid repeated characters');
  const variety = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  let score = Math.min(4, Math.floor(variety * 0.7 + Math.min(password.length, 20) / 10)) as PasswordAssessment['score'];
  if (issues.length) score = Math.max(0, score - Math.ceil(issues.length / 2)) as PasswordAssessment['score'];
  const labels: PasswordAssessment['label'][] = ['Too weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  const suggestion = issues.length
    ? `Suggestion: ${issues[0].toLowerCase()}. Try a phrase of four unrelated words plus a number and symbol.`
    : 'Good password. Consider a passphrase you have not used elsewhere.';
  return { score, label: labels[score], issues, suggestion, valid: passwordSchema.safeParse(password).success && issues.length === 0 };
}

export const stepOneSchema = z.object({ firstName: nameSchema, lastName: nameSchema });
export const stepTwoSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

export const otpSchema = z.string().regex(/^\d{6}$/, 'Enter all six digits');
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password') });
export const forgotSchema = z.object({ email: emailSchema });

export const addressSchema = z.object({
  label: z.string().trim().min(2).max(40),
  line: z.string().trim().min(5, 'Enter a full address').max(160),
  city: z.string().trim().min(2).max(60),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
});

export const coordsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const cabBookingSchema = z.object({
  pickupId: z.string().min(1, 'Choose a pickup point'),
  dropoffId: z.string().min(1, 'Choose a destination'),
  vehicleClassId: z.string().min(1, 'Choose a vehicle'),
  tripType: z.enum(['one_way', 'round_trip']),
  scheduledAt: z.string().nullable(),
  passengers: z.number().int().min(1).max(8),
  journeyId: z.string().nullable(),
}).refine((v) => v.pickupId !== v.dropoffId, { path: ['dropoffId'], message: 'Pickup and destination must differ' });

export const stayBookingSchema = z.object({
  propertyId: z.string().min(1),
  roomId: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(12),
  children: z.number().int().min(0).max(12),
  rooms: z.number().int().min(1).max(8),
  guestName: z.string().trim().min(2).max(80),
  journeyId: z.string().nullable(),
}).refine((v) => v.checkOut > v.checkIn, { path: ['checkOut'], message: 'Check-out must be after check-in' });

export const cartItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  unitPricePaise: z.number().int().min(0),
  options: z.array(z.string()).optional(),
});

export const orderSchema = z.object({
  listingId: z.string().min(1),
  service: z.enum(['food', 'grocery']),
  items: z.array(cartItemSchema).min(1, 'Add at least one item'),
  deliveryAddress: z.string().trim().min(5, 'Enter a delivery address'),
  instructions: z.string().max(300),
  slot: z.string().nullable(),
  substitution: z.enum(['allow', 'contact_me', 'no_substitutes']).optional(),
  coupon: z.string().trim().max(30).nullable().optional(),
  journeyId: z.string().nullable(),
});

export const tourismBookingSchema = z.object({
  offeringId: z.string().min(1),
  service: z.enum(['tourism', 'experience', 'package']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.number().int().min(1).max(20),
  journeyId: z.string().nullable(),
});

export const parcelBookingSchema = z.object({
  pickupId: z.string().min(1),
  dropoffId: z.string().min(1),
  weightKg: z.number().min(0.1).max(30),
  description: z.string().trim().min(3).max(120),
  recipientPhone: z.string().regex(/^\d{10}$/, 'Enter a 10-digit phone number'),
  journeyId: z.string().nullable(),
}).refine((v) => v.pickupId !== v.dropoffId, { path: ['dropoffId'], message: 'Pickup and delivery points must differ' });

export const paymentInitSchema = z.object({
  bookingId: z.string().nullable(),
  orderId: z.string().nullable(),
  method: z.enum(['upi', 'upi_intent', 'gateway', 'cash']),
  amountPaise: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
});

export const driverRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^\d{10}$/, 'Enter a 10-digit phone number'),
  vehicleClass: z.string().min(1),
  services: z.array(z.enum(['cab', 'food', 'grocery', 'parcel'])).min(1, 'Select at least one service'),
  licenceNumber: z.string().trim().min(5).max(30),
  vehicleRegistration: z.string().trim().min(5).max(20),
  insuranceNumber: z.string().trim().min(5).max(30),
});

export const supportTicketSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(2000),
});

export type StepOne = z.infer<typeof stepOneSchema>;
export type StepTwo = z.infer<typeof stepTwoSchema>;
export type CabBookingInput = z.infer<typeof cabBookingSchema>;
export type StayBookingInput = z.infer<typeof stayBookingSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type TourismBookingInput = z.infer<typeof tourismBookingSchema>;
export type ParcelBookingInput = z.infer<typeof parcelBookingSchema>;
