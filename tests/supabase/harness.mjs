/**
 * Executes the real supabase/migrations SQL against an embedded PostgreSQL 17 (PGlite).
 * Supabase-only objects (auth schema, auth.uid(), anon/authenticated roles, realtime
 * publication, PostGIS) are shimmed or guarded; everything else is executed verbatim.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const REQUIRED_TABLES = [
  'profiles','user_roles','user_addresses','destinations','destination_attractions',
  'destination_images','destination_routes','drivers','driver_documents','driver_vehicles',
  'driver_services','driver_availability','driver_locations','ride_bookings',
  'ride_assignments','ride_tracking','ride_fares','restaurants','restaurant_menus',
  'food_products','food_orders','food_order_items','grocery_stores','grocery_products',
  'grocery_inventory','grocery_orders','grocery_order_items','properties','property_rooms',
  'room_availability','hotel_bookings','tour_packages','tour_activities','experience_bookings',
  'payments','transactions','refunds','commissions','settlements','notifications','reviews',
  'support_tickets','coupons','promotions','journeys','journey_services','saved_places',
];

export function migrationFiles() {
  const dir = join(root, 'supabase', 'migrations');
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

export function seedFiles() {
  const dir = join(root, 'supabase', 'seed');
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

const SHIM = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

export async function createDatabase({ withSeed = true, demoMode = true } = {}) {
  const db = new PGlite();
  await db.exec(SHIM);
  const errors = [];
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(root, 'supabase', 'migrations', file), 'utf8');
    try { await db.exec(sql); }
    catch (error) { errors.push(`${file}: ${error.message}`); }
  }
  if (withSeed && errors.length === 0) {
    for (const file of seedFiles()) {
      const sql = readFileSync(join(root, 'supabase', 'seed', file), 'utf8');
      try { await db.exec(sql); }
      catch (error) { errors.push(`${file}: ${error.message}`); }
    }
  }
  // Migration 202611040013 ships production-safe defaults (demo_mode = false).
  // These tests deliberately exercise the labelled development adapters — demo OTP
  // return, partner auto-verify and sandbox payment capture — so the harness opts
  // back in explicitly instead of relying on the shipped default. Pass
  // { demoMode: false } to force the production posture, or { demoMode: null } to
  // inspect the values the migrations themselves produce.
  if (errors.length === 0 && demoMode !== null) {
    await db.query(
      `UPDATE public.app_config SET value = $2::jsonb, updated_at = now() WHERE key = $1`,
      ['demo_mode', demoMode ? 'true' : 'false']);
    await db.query(
      `UPDATE public.app_config SET value = $2::jsonb, updated_at = now() WHERE key = $1`,
      ['payment_provider', demoMode ? '"sandbox"' : '"unconfigured"']);
    await db.query(
      `UPDATE public.app_config SET value = $2::jsonb, updated_at = now() WHERE key = $1`,
      ['otp_mode', demoMode ? '"demo"' : '"provider_required"']);
  }
  return { db, errors, close: () => db.close() };
}

export async function createUser(db, email, first = 'Asha', last = 'Rai') {
  const r = await db.query(
    `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email]);
  const id = r.rows[0].id;
  await db.query(`INSERT INTO public.profiles (id, first_name, last_name) VALUES ($1,$2,$3)`, [id, first, last]);
  await db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1,'customer')`, [id]);
  return id;
}

export async function asUser(db, id) {
  await db.query(`SELECT set_config('app.current_user_id', $1, false)`, [String(id)]);
}
