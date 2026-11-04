-- GOWAYY / Phase 2 foundation
-- Portable across Supabase PostgreSQL and plain PostgreSQL (used by the migration test harness).
-- No service-role keys, secrets or client credentials are ever stored in SQL.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgcrypto unavailable (%), relying on built-in gen_random_uuid()', SQLERRM;
END $$;

-- PostGIS is required on Supabase. The guarded block keeps the schema executable on
-- PostgreSQL builds without PostGIS (e.g. local/CI verification) instead of failing.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS postgis;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PostGIS unavailable (%); spatial column/index creation will be skipped', SQLERRM;
END $$;

-- Shared updated_at trigger.
CREATE OR REPLACE FUNCTION public.gowayy_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Returns true when PostGIS geography is available. Used by spatial index setup and
-- by the location engine adapter so the same schema works in both environments.
CREATE OR REPLACE FUNCTION public.gowayy_has_postgis()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT to_regtype('public.geography') IS NOT NULL OR to_regtype('geography') IS NOT NULL;
$$;

-- Attach a generated PostGIS geography column + GiST index to every table that carries
-- coordinates. Generated (STORED) columns need no application writes and cannot drift.
-- Called from the final migration, after the tables exist.
CREATE OR REPLACE FUNCTION public.gowayy_attach_geo()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  t text;
  attached integer := 0;
  targets text[] := ARRAY[
    'destinations','destination_attractions','destination_routes','places',
    'properties','restaurants','grocery_stores','driver_locations',
    'ride_bookings','ride_tracking','hotel_bookings','food_orders',
    'grocery_orders','parcel_bookings','tour_packages','tour_activities',
    'saved_places','user_addresses','taxi_stands'
  ];
BEGIN
  IF NOT public.gowayy_has_postgis() THEN
    RAISE NOTICE 'PostGIS absent: lat/lng columns remain authoritative; GiST indexes are added on Supabase.';
    RETURN 0;
  END IF;
  FOREACH t IN ARRAY targets LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS geo geography(Point,4326) '
        || 'GENERATED ALWAYS AS (st_setsrid(st_makepoint(lng, lat), 4326)::geography) STORED', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I USING gist (geo)', t || '_geo_gix', t);
      attached := attached + 1;
    END IF;
  END LOOP;
  RETURN attached;
END $$;

-- The auth schema and auth.uid() are provided by Supabase Auth. The local test harness
-- installs a compatible shim before running migrations. Never create them here.
