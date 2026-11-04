-- Connected journeys, bookings, orders and server-authoritative state machines.

CREATE TABLE IF NOT EXISTS public.journeys (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title          text NOT NULL DEFAULT 'My journey',
  destination_id text REFERENCES public.destinations(id),
  pickup         jsonb,
  dropoff        jsonb,
  start_date     date,
  end_date       date,
  travellers     integer NOT NULL DEFAULT 1 CHECK (travellers BETWEEN 1 AND 20),
  preferences    text[] NOT NULL DEFAULT '{}',
  nearby_services jsonb NOT NULL DEFAULT '{}'::jsonb,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS journeys_user_idx ON public.journeys (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.journey_services (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id   uuid NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  service      text NOT NULL,
  booking_id   uuid,
  order_id     uuid,
  state        text NOT NULL DEFAULT 'not_booked' CHECK (state IN ('not_booked','requested','confirmed','cancelled','completed')),
  label        text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (booking_id IS NOT NULL OR order_id IS NOT NULL OR state = 'not_booked')
);
CREATE INDEX IF NOT EXISTS journey_services_journey_idx ON public.journey_services (journey_id, service);

-- Allowed transitions are data, not client logic. RPC functions validate against these tables
-- so a client can never jump straight to "completed" or forge a confirmation.
CREATE TABLE IF NOT EXISTS public.booking_status_transitions (
  from_status text NOT NULL,
  to_status   text NOT NULL,
  actor       text NOT NULL CHECK (actor IN ('customer','partner','driver','system')),
  PRIMARY KEY (from_status, to_status, actor)
);
INSERT INTO public.booking_status_transitions (from_status, to_status, actor) VALUES
  ('requested','confirmed','partner'), ('requested','cancelled','customer'), ('requested','cancelled','partner'),
  ('confirmed','assigned','partner'), ('confirmed','cancelled','customer'), ('confirmed','cancelled','partner'),
  ('assigned','in_progress','driver'), ('assigned','cancelled','customer'),
  ('in_progress','completed','driver'), ('in_progress','completed','partner'),
  ('completed','refunded','system'), ('cancelled','refunded','system'),
  ('confirmed','refunded','system'), ('assigned','refunded','system')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.order_status_transitions (
  from_status text NOT NULL,
  to_status   text NOT NULL,
  actor       text NOT NULL CHECK (actor IN ('customer','partner','driver','system')),
  PRIMARY KEY (from_status, to_status, actor)
);
INSERT INTO public.order_status_transitions (from_status, to_status, actor) VALUES
  ('created','accepted','partner'), ('created','cancelled','customer'), ('created','cancelled','partner'),
  ('accepted','preparing','partner'), ('preparing','packed','partner'),
  ('packed','out_for_delivery','driver'), ('out_for_delivery','delivered','driver'),
  ('accepted','cancelled','partner'), ('delivered','refunded','system'), ('cancelled','refunded','system')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ride_bookings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     text NOT NULL UNIQUE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  journey_id    uuid REFERENCES public.journeys(id) ON DELETE SET NULL,
  service       text NOT NULL DEFAULT 'cab' CHECK (service IN ('cab','shared_taxi')),
  status        text NOT NULL DEFAULT 'requested',
  from_place_id text,
  to_place_id   text,
  from_text     text,
  to_text       text,
  lat           double precision CHECK (lat BETWEEN -90 AND 90),
  lng           double precision CHECK (lng BETWEEN -180 AND 180),
  distance_km   numeric(8,2),
  duration_min  integer,
  vehicle_class text,
  trip_type     text NOT NULL DEFAULT 'one_way' CHECK (trip_type IN ('one_way','round_trip')),
  scheduled_for timestamptz,
  shared_route_id text REFERENCES public.shared_taxi_routes(id),
  seats         integer NOT NULL DEFAULT 1 CHECK (seats > 0),
  title         text NOT NULL,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  price         jsonb NOT NULL,
  total_paise   integer NOT NULL CHECK (total_paise >= 0),
  payment_id    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ride_bookings_user_idx ON public.ride_bookings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ride_bookings_status_idx ON public.ride_bookings (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ride_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid NOT NULL UNIQUE REFERENCES public.ride_bookings(id) ON DELETE CASCADE,
  driver_id     uuid NOT NULL REFERENCES public.drivers(id),
  state         text NOT NULL DEFAULT 'offered' CHECK (state IN ('offered','accepted','rejected','expired')),
  offered_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  expires_at    timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ride_assignments_driver_idx ON public.ride_assignments (driver_id, state);

CREATE TABLE IF NOT EXISTS public.ride_tracking (
  id          bigserial PRIMARY KEY,
  booking_id  uuid NOT NULL REFERENCES public.ride_bookings(id) ON DELETE CASCADE,
  driver_id   uuid REFERENCES public.drivers(id),
  lat         double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng         double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  event       text NOT NULL DEFAULT 'position',
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ride_tracking_booking_idx ON public.ride_tracking (booking_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.ride_fares (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     uuid NOT NULL UNIQUE REFERENCES public.ride_bookings(id) ON DELETE CASCADE,
  vehicle_class  text,
  lines          jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal_paise integer NOT NULL CHECK (subtotal_paise >= 0),
  tax_paise      integer NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  commission_paise integer NOT NULL DEFAULT 0 CHECK (commission_paise >= 0),
  total_paise    integer NOT NULL CHECK (total_paise >= 0),
  currency       text NOT NULL DEFAULT 'INR',
  provider       text NOT NULL DEFAULT 'gowayy-pricing-engine',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hotel_bookings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     text NOT NULL UNIQUE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  journey_id    uuid REFERENCES public.journeys(id) ON DELETE SET NULL,
  service       text NOT NULL DEFAULT 'hotel' CHECK (service IN ('hotel','homestay','lodge','guesthouse')),
  property_id   text NOT NULL REFERENCES public.properties(id),
  room_id       text NOT NULL REFERENCES public.property_rooms(id),
  status        text NOT NULL DEFAULT 'requested',
  check_in      date NOT NULL,
  check_out     date NOT NULL,
  adults        integer NOT NULL DEFAULT 1 CHECK (adults > 0),
  children      integer NOT NULL DEFAULT 0 CHECK (children >= 0),
  rooms         integer NOT NULL DEFAULT 1 CHECK (rooms > 0),
  guest_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  lat           double precision CHECK (lat BETWEEN -90 AND 90),
  lng           double precision CHECK (lng BETWEEN -180 AND 180),
  title         text NOT NULL,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  price         jsonb NOT NULL,
  total_paise   integer NOT NULL CHECK (total_paise >= 0),
  payment_id    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);
CREATE INDEX IF NOT EXISTS hotel_bookings_user_idx ON public.hotel_bookings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS hotel_bookings_property_dates_idx ON public.hotel_bookings (property_id, check_in, check_out) WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS public.experience_bookings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     text NOT NULL UNIQUE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  journey_id    uuid REFERENCES public.journeys(id) ON DELETE SET NULL,
  service       text NOT NULL CHECK (service IN ('tourism','experience','package')),
  offering_id   text NOT NULL,
  destination_id text REFERENCES public.destinations(id),
  status        text NOT NULL DEFAULT 'requested',
  visit_date    date,
  travellers    integer NOT NULL DEFAULT 1 CHECK (travellers > 0),
  title         text NOT NULL,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  price         jsonb NOT NULL,
  total_paise   integer NOT NULL CHECK (total_paise >= 0),
  payment_id    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experience_bookings_user_idx ON public.experience_bookings (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.parcel_bookings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     text NOT NULL UNIQUE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  journey_id    uuid REFERENCES public.journeys(id) ON DELETE SET NULL,
  service       text NOT NULL DEFAULT 'parcel',
  status        text NOT NULL DEFAULT 'requested',
  pickup_address text NOT NULL,
  drop_address  text NOT NULL,
  lat           double precision CHECK (lat BETWEEN -90 AND 90),
  lng           double precision CHECK (lng BETWEEN -180 AND 180),
  weight_kg     numeric(6,2) NOT NULL CHECK (weight_kg > 0),
  title         text NOT NULL,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  price         jsonb NOT NULL,
  total_paise   integer NOT NULL CHECK (total_paise >= 0),
  payment_id    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS parcel_bookings_user_idx ON public.parcel_bookings (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.food_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     text NOT NULL UNIQUE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  journey_id    uuid REFERENCES public.journeys(id) ON DELETE SET NULL,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id),
  status        text NOT NULL DEFAULT 'created',
  delivery_address text NOT NULL,
  instructions  text NOT NULL DEFAULT '',
  lat           double precision CHECK (lat BETWEEN -90 AND 90),
  lng           double precision CHECK (lng BETWEEN -180 AND 180),
  coupon        text,
  price         jsonb NOT NULL,
  total_paise   integer NOT NULL CHECK (total_paise >= 0),
  payment_id    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_orders_user_idx ON public.food_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS food_orders_restaurant_idx ON public.food_orders (restaurant_id, status);

CREATE TABLE IF NOT EXISTS public.food_order_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.food_orders(id) ON DELETE CASCADE,
  product_id  text NOT NULL,
  name        text NOT NULL,
  quantity    integer NOT NULL CHECK (quantity > 0),
  unit_price_paise integer NOT NULL CHECK (unit_price_paise >= 0),
  options     jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS food_order_items_order_idx ON public.food_order_items (order_id);

CREATE TABLE IF NOT EXISTS public.grocery_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     text NOT NULL UNIQUE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  journey_id    uuid REFERENCES public.journeys(id) ON DELETE SET NULL,
  store_id      text NOT NULL REFERENCES public.grocery_stores(id),
  status        text NOT NULL DEFAULT 'created',
  delivery_address text NOT NULL,
  instructions  text NOT NULL DEFAULT '',
  slot          text,
  substitution  text NOT NULL DEFAULT 'ask' CHECK (substitution IN ('ask','allow','none')),
  lat           double precision CHECK (lat BETWEEN -90 AND 90),
  lng           double precision CHECK (lng BETWEEN -180 AND 180),
  coupon        text,
  price         jsonb NOT NULL,
  total_paise   integer NOT NULL CHECK (total_paise >= 0),
  payment_id    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grocery_orders_user_idx ON public.grocery_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS grocery_orders_store_idx ON public.grocery_orders (store_id, status);

CREATE TABLE IF NOT EXISTS public.grocery_order_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.grocery_orders(id) ON DELETE CASCADE,
  product_id  text NOT NULL,
  name        text NOT NULL,
  quantity    integer NOT NULL CHECK (quantity > 0),
  unit_price_paise integer NOT NULL CHECK (unit_price_paise >= 0),
  options     jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS grocery_order_items_order_idx ON public.grocery_order_items (order_id);

-- One audit row per status change. Booking status is derived from these rows, never
-- from a client-supplied value.
CREATE TABLE IF NOT EXISTS public.booking_events (
  id          bigserial PRIMARY KEY,
  booking_id  uuid NOT NULL,
  booking_table text NOT NULL CHECK (booking_table IN ('ride_bookings','hotel_bookings','experience_bookings','parcel_bookings')),
  service     text NOT NULL,
  from_status text,
  to_status   text NOT NULL,
  actor       text NOT NULL,
  actor_id    uuid,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_events_booking_idx ON public.booking_events (booking_id, created_at);

CREATE TABLE IF NOT EXISTS public.order_events (
  id          bigserial PRIMARY KEY,
  order_id    uuid NOT NULL,
  order_table text NOT NULL CHECK (order_table IN ('food_orders','grocery_orders')),
  from_status text,
  to_status   text NOT NULL,
  actor       text NOT NULL,
  actor_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON public.order_events (order_id, created_at);

-- Idempotency keys are unique per user+operation. Replaying a request returns the first
-- result instead of creating a duplicate booking or charge.
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key         text NOT NULL,
  user_id     uuid NOT NULL,
  operation   text NOT NULL,
  result_type text NOT NULL,
  result_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, user_id, operation)
);

-- Unified read views for the shared booking/order history. security_invoker keeps the
-- underlying RLS policies in force for anonymous and authenticated callers.
CREATE OR REPLACE VIEW public.customer_bookings WITH (security_invoker = true) AS
SELECT b.*, COALESCE(h.history, '[]'::jsonb) AS status_history
FROM (
  SELECT id, reference, user_id, journey_id, service, status, NULL::text AS listing_id,
         title, details, price, total_paise, payment_id, created_at, updated_at, 'ride_bookings'::text AS source_table
  FROM public.ride_bookings
  UNION ALL
  SELECT id, reference, user_id, journey_id, service, status, property_id AS listing_id,
         title, details, price, total_paise, payment_id, created_at, updated_at, 'hotel_bookings'::text
  FROM public.hotel_bookings
  UNION ALL
  SELECT id, reference, user_id, journey_id, service, status, offering_id AS listing_id,
         title, details, price, total_paise, payment_id, created_at, updated_at, 'experience_bookings'::text
  FROM public.experience_bookings
  UNION ALL
  SELECT id, reference, user_id, journey_id, service, status, NULL::text,
         title, details, price, total_paise, payment_id, created_at, updated_at, 'parcel_bookings'::text
  FROM public.parcel_bookings
) b
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('status', e.to_status, 'at', e.created_at, 'by', e.actor)
                   ORDER BY e.created_at) AS history
  FROM public.booking_events e WHERE e.booking_id = b.id
) h ON true;

CREATE OR REPLACE VIEW public.customer_orders WITH (security_invoker = true) AS
SELECT o.*, COALESCE(i.items, '[]'::jsonb) AS items
FROM (
  SELECT id, reference, user_id, journey_id, 'food'::text AS service, status,
         restaurant_id AS listing_id, delivery_address, instructions, NULL::text AS slot,
         NULL::text AS substitution, coupon, price, total_paise, payment_id, created_at, updated_at,
         'food_orders'::text AS source_table
  FROM public.food_orders
  UNION ALL
  SELECT id, reference, user_id, journey_id, 'grocery'::text, status,
         store_id, delivery_address, instructions, slot, substitution, coupon,
         price, total_paise, payment_id, created_at, updated_at, 'grocery_orders'::text
  FROM public.grocery_orders
) o
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('id', x.product_id, 'name', x.name, 'quantity', x.quantity,
                                      'unitPricePaise', x.unit_price_paise, 'options', x.options)) AS items
  FROM (
    SELECT product_id, name, quantity, unit_price_paise, options FROM public.food_order_items WHERE order_id = o.id
    UNION ALL
    SELECT product_id, name, quantity, unit_price_paise, options FROM public.grocery_order_items WHERE order_id = o.id
  ) x
) i ON true;
