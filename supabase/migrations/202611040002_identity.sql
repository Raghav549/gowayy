-- Identity, customer account, saved locations and partner/driver registration.
-- Roles are customer-facing only: there is deliberately no admin role or admin table.

CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name    text NOT NULL CHECK (char_length(btrim(first_name)) BETWEEN 1 AND 60),
  last_name     text NOT NULL CHECK (char_length(btrim(last_name)) BETWEEN 1 AND 60),
  phone         text,
  avatar_path   text,
  locale        text NOT NULL DEFAULT 'en-IN',
  theme         text NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS profiles_active_idx ON public.profiles (deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('customer','driver','restaurant','grocery','property')),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  uuid REFERENCES public.profiles(id),
  PRIMARY KEY (user_id, role)
);
CREATE INDEX IF NOT EXISTS user_roles_role_idx ON public.user_roles (role);

CREATE TABLE IF NOT EXISTS public.user_addresses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label       text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
  line1       text NOT NULL,
  line2       text,
  city        text NOT NULL,
  state       text NOT NULL DEFAULT 'West Bengal',
  postal_code text,
  lat         double precision CHECK (lat BETWEEN -90 AND 90),
  lng         double precision CHECK (lng BETWEEN -180 AND 180),
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS user_addresses_user_idx ON public.user_addresses (user_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_addresses_one_default_idx
  ON public.user_addresses (user_id) WHERE is_default AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.saved_places (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  place_id    uuid,
  label       text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
  name        text NOT NULL,
  lat         double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng         double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS saved_places_user_idx ON public.saved_places (user_id) WHERE deleted_at IS NULL;

-- Partner ownership of a listing is a claim, verified out-of-band. It is used by RLS and
-- dispatch; it never grants platform-wide visibility (no admin interface exists).
CREATE TABLE IF NOT EXISTS public.partner_claims (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('driver','restaurant','grocery','property')),
  listing_id   text NOT NULL,
  state        text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','verified','rejected')),
  evidence_path text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  verified_at  timestamptz,
  UNIQUE (user_id, role, listing_id)
);
CREATE INDEX IF NOT EXISTS partner_claims_listing_idx ON public.partner_claims (listing_id, state);

CREATE TABLE IF NOT EXISTS public.drivers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone           text NOT NULL,
  email           text NOT NULL,
  photograph_path text,
  verification    text NOT NULL DEFAULT 'unverified' CHECK (verification IN ('unverified','pending','verified','rejected')),
  online          boolean NOT NULL DEFAULT false,
  active_task     text CHECK (active_task IN ('passenger_ride','food_delivery','grocery_delivery','parcel_delivery')),
  active_task_id  uuid,
  rating          numeric(3,2),
  rating_count    integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT drivers_online_requires_verification CHECK (online = false OR verification = 'verified')
);
CREATE INDEX IF NOT EXISTS drivers_available_idx ON public.drivers (online, verification) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.driver_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id      uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  document_type  text NOT NULL CHECK (document_type IN ('photograph','licence','registration','insurance','permit','other')),
  storage_path   text NOT NULL,
  document_number text,
  expires_on     date,
  state          text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','verified','rejected')),
  reviewed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS driver_documents_driver_idx ON public.driver_documents (driver_id, state);

CREATE TABLE IF NOT EXISTS public.driver_vehicles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id      uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  vehicle_class  text NOT NULL CHECK (vehicle_class IN ('hatchback','sedan','suv','premium','shared_taxi','tourist_taxi','two_wheeler')),
  registration   text NOT NULL,
  make           text,
  model          text,
  seats          integer NOT NULL DEFAULT 4 CHECK (seats BETWEEN 1 AND 12),
  permit_path    text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, registration)
);

CREATE TABLE IF NOT EXISTS public.driver_services (
  driver_id   uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  service     text NOT NULL CHECK (service IN ('passenger_ride','food_delivery','grocery_delivery','parcel_delivery')),
  enabled     boolean NOT NULL DEFAULT false,
  eligible    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (driver_id, service)
);

CREATE TABLE IF NOT EXISTS public.driver_availability (
  driver_id   uuid PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
  online      boolean NOT NULL DEFAULT false,
  since       timestamptz NOT NULL DEFAULT now(),
  service_modes text[] NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.driver_locations (
  id          bigserial PRIMARY KEY,
  driver_id   uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  lat         double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng         double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy_m  double precision,
  heading     double precision,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS driver_locations_recent_idx ON public.driver_locations (driver_id, recorded_at DESC);

-- Configurable dispatch rules. A driver carrying a passenger must never receive an
-- incompatible delivery assignment; the assignment function reads these rules.
CREATE TABLE IF NOT EXISTS public.dispatch_rules (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.dispatch_rules (key, value, description) VALUES
  ('exclusive_active_task', 'true'::jsonb, 'A driver with an active task cannot be offered another job.'),
  ('passenger_ride_blocks_delivery', 'true'::jsonb, 'Passenger rides block food, grocery and parcel assignments.'),
  ('require_verified', 'true'::jsonb, 'Only verified drivers may be dispatched.'),
  ('require_service_enabled', 'true'::jsonb, 'The driver must have enabled and be eligible for the job service.'),
  ('max_concurrent_jobs', '1'::jsonb, 'Maximum concurrent active jobs per driver.')
ON CONFLICT (key) DO NOTHING;

-- Registration / password-recovery OTP records. Codes are stored hashed; the demo adapter
-- is explicitly labelled and never claims to be real email verification.
CREATE TABLE IF NOT EXISTS public.registration_otps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL,
  first_name     text NOT NULL,
  last_name      text NOT NULL,
  -- Supabase Auth owns password hashing. We store only the unconfirmed auth user id;
  -- password material is never written to the public schema.
  auth_user_id   uuid,
  code_hash      text NOT NULL,
  demo_mode      boolean NOT NULL DEFAULT false,
  attempts       integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  expires_at     timestamptz NOT NULL,
  resend_after   timestamptz NOT NULL,
  verified_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS registration_otps_email_idx ON public.registration_otps (email, created_at DESC);

CREATE TABLE IF NOT EXISTS public.password_resets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  email       text NOT NULL,
  code_hash   text NOT NULL,
  demo_mode   boolean NOT NULL DEFAULT false,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Rate limiting buckets (edge functions increment atomically through an RPC).
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key         text PRIMARY KEY,
  hits        integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
