/** Independent server-side Zod validation. Client-side validation is never trusted. */
import { z } from 'npm:zod@^3.23.8';
import { HttpError } from './config.ts';

export const email = z.string().trim().toLowerCase().email('Enter a valid email address');
export const password = z.string().min(10, 'Use at least 10 characters')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[0-9]/, 'Include a number');
const name = z.string().trim().min(1).max(60);

export const registerSchema = z.object({
  firstName: name, lastName: name, email, password,
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

export const loginSchema = z.object({ email, password: z.string().min(1) });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ resetId: z.string().min(8), code: z.string().length(6), password });
export const otpSchema = z.object({ registrationId: z.string().min(8), code: z.string().regex(/^\d{6}$/), password: z.string().optional() });
export const phone = z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Use an international number such as +919876543210');
export const phoneRequestSchema = z.object({ phone });
export const phoneVerifySchema = z.object({
  phone, code: z.string().regex(/^\d{6}$/),
  firstName: name.optional(), lastName: name.optional(),
});
export const resendSchema = z.object({ registrationId: z.string().min(8) });
export const idemSchema = z.object({ idempotencyKey: z.string().min(8) });

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(422, 'VALIDATION_FAILED', 'Please check the form',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return result.data;
}
