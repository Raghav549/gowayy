-- Destination discovery and marketplace catalogue. All records are data-driven: new
-- destinations, attractions, properties or stores are rows, never application code.

CREATE TABLE IF NOT EXISTS public.image_sources (
  id            text PRIMARY KEY,
  place         text NOT NULL,
  depicts       text NOT NULL,
  source_url    text NOT NULL,
  original_file_url text,
  author        text,
  license       text NOT NULL DEFAULT 'UNVERIFIED',
  license_url   text,
  displayable   boolean NOT NULL DEFAULT false,
  verification  text NOT NULL,
  download_date date NOT NULL DEFAULT CURRENT_DATE,
  local_path    text,
  alt           text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.image_sources IS 'Provenance and licensing manifest. displayable=false means the photograph is never shown in the app.';

CREATE TABLE IF NOT EXISTS public.destinations (
  id              text PRIMARY KEY,
  slug            text NOT NULL UNIQUE,
  name            text NOT NULL,
  region          text NOT NULL,
  state           text NOT NULL DEFAULT 'West Bengal',
  country         text NOT NULL DEFAULT 'India',
  lat             double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng             double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  coordinate_accuracy text NOT NULL DEFAULT 'approximate' CHECK (coordinate_accuracy IN ('published','approximate')),
  elevation_m     integer,
  elevation_verified boolean NOT NULL DEFAULT false,
  description     text NOT NULL,
  best_season     text,
  estimated_visit_hours integer,
  hidden_gem      boolean NOT NULL DEFAULT false,
  activities      text[] NOT NULL DEFAULT '{}',
  accessibility   text NOT NULL DEFAULT '',
  safety          text NOT NULL DEFAULT '',
  weather_note    text NOT NULL DEFAULT 'Live weather requires a configured provider.',
  sources         jsonb NOT NULL DEFAULT '[]'::jsonb,
  info_status     text NOT NULL DEFAULT 'community-reference' CHECK (info_status IN ('published-reference','community-reference')),
  published       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS destinations_slug_idx ON public.destinations (slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS destinations_hidden_gem_idx ON public.destinations (hidden_gem) WHERE published;

CREATE TABLE IF NOT EXISTS public.destination_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id text NOT NULL REFERENCES public.destinations(id) ON DELETE CASCADE,
  image_source_id text REFERENCES public.image_sources(id),
  status        text NOT NULL DEFAULT 'unavailable' CHECK (status IN ('verified','unavailable')),
  asset_path    text,
  thumb_path    text,
  alt           text NOT NULL,
  credit        text,
  license       text,
  source_url    text,
  sort_order    integer NOT NULL DEFAULT 0,
  CHECK (status = 'unavailable' OR (asset_path IS NOT NULL AND license IS NOT NULL)),
  UNIQUE (destination_id, asset_path)
);
CREATE INDEX IF NOT EXISTS destination_images_dest_idx ON public.destination_images (destination_id, sort_order);

CREATE TABLE IF NOT EXISTS public.destination_attractions (
  id            text PRIMARY KEY,
  destination_id text NOT NULL REFERENCES public.destinations(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  category      text NOT NULL DEFAULT 'viewpoint',
  lat           double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng           double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  typical_visit_minutes integer,
  image_source_id text REFERENCES public.image_sources(id),
  image_status  text NOT NULL DEFAULT 'unavailable' CHECK (image_status IN ('verified','unavailable')),
  info_status   text NOT NULL DEFAULT 'community-reference',
  published     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS destination_attractions_dest_idx ON public.destination_attractions (destination_id) WHERE published;

CREATE TABLE IF NOT EXISTS public.destination_routes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id text NOT NULL REFERENCES public.destinations(id) ON DELETE CASCADE,
  from_place_id text,
  to_place_id   text,
  mode          text NOT NULL CHECK (mode IN ('road','rail','air','trek','shared_taxi')),
  distance_km   numeric(8,2),
  duration_min  integer,
  lat           double precision CHECK (lat BETWEEN -90 AND 90),
  lng           double precision CHECK (lng BETWEEN -180 AND 180),
  note          text NOT NULL DEFAULT '',
  source        text
);
CREATE INDEX IF NOT EXISTS destination_routes_dest_idx ON public.destination_routes (destination_id);

CREATE TABLE IF NOT EXISTS public.places (
  id        text PRIMARY KEY,
  name      text NOT NULL,
  address   text,
  locality  text,
  kind      text NOT NULL DEFAULT 'address' CHECK (kind IN ('airport','stand','landmark','address','destination','business')),
  lat       double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng       double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS places_name_idx ON public.places USING gin (to_tsvector('simple', name));

CREATE TABLE IF NOT EXISTS public.vehicle_classes (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  seats          integer NOT NULL CHECK (seats BETWEEN 1 AND 12),
  base_fare_paise integer NOT NULL CHECK (base_fare_paise >= 0),
  per_km_paise   integer NOT NULL CHECK (per_km_paise >= 0),
  per_min_paise  integer NOT NULL DEFAULT 0 CHECK (per_min_paise >= 0),
  min_fare_paise integer NOT NULL DEFAULT 0,
  luggage        text,
  tags           text[] NOT NULL DEFAULT '{}',
  active         boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.taxi_stands (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  destination_id text REFERENCES public.destinations(id),
  lat         double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng         double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  operator    text,
  permit_note text NOT NULL DEFAULT 'Operating permissions must be confirmed with the local operator.'
);

CREATE TABLE IF NOT EXISTS public.shared_taxi_routes (
  id             text PRIMARY KEY,
  from_place_id  text NOT NULL REFERENCES public.places(id),
  to_place_id    text NOT NULL REFERENCES public.places(id),
  stand_id       text REFERENCES public.taxi_stands(id),
  operator       text NOT NULL,
  fare_paise     integer NOT NULL CHECK (fare_paise >= 0),
  seats_total    integer NOT NULL CHECK (seats_total BETWEEN 1 AND 20),
  seats_available integer NOT NULL CHECK (seats_available >= 0),
  departure_time time,
  frequency      text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (seats_available <= seats_total),
  CHECK (from_place_id <> to_place_id)
);
CREATE INDEX IF NOT EXISTS shared_taxi_routes_from_idx ON public.shared_taxi_routes (from_place_id, active);

CREATE TABLE IF NOT EXISTS public.shared_taxi_departures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id    text NOT NULL REFERENCES public.shared_taxi_routes(id) ON DELETE CASCADE,
  departs_at  timestamptz NOT NULL,
  seats_total integer NOT NULL,
  seats_booked integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','departed','cancelled')),
  CHECK (seats_booked <= seats_total)
);
CREATE INDEX IF NOT EXISTS shared_taxi_departures_time_idx ON public.shared_taxi_departures (route_id, departs_at);

CREATE TABLE IF NOT EXISTS public.properties (
  id             text PRIMARY KEY,
  destination_id text NOT NULL REFERENCES public.destinations(id),
  name           text NOT NULL,
  property_type  text NOT NULL CHECK (property_type IN ('hotel','resort','homestay','lodge','guesthouse','hostel','camp')),
  service        text NOT NULL CHECK (service IN ('hotel','homestay')),
  description    text NOT NULL DEFAULT '',
  lat            double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng            double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  amenities      text[] NOT NULL DEFAULT '{}',
  house_rules    text NOT NULL DEFAULT '',
  cancellation   text NOT NULL DEFAULT '',
  data_class     text NOT NULL DEFAULT 'demo-listing',
  image_status   text NOT NULL DEFAULT 'unavailable' CHECK (image_status IN ('verified','unavailable')),
  published      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX IF NOT EXISTS properties_dest_idx ON public.properties (destination_id, property_type) WHERE published;

CREATE TABLE IF NOT EXISTS public.property_rooms (
  id            text PRIMARY KEY,
  property_id   text NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name          text NOT NULL,
  capacity      integer NOT NULL CHECK (capacity > 0),
  beds          integer NOT NULL DEFAULT 1,
  base_price_paise integer NOT NULL CHECK (base_price_paise >= 0),
  tax_percent   numeric(5,2) NOT NULL DEFAULT 12 CHECK (tax_percent >= 0 AND tax_percent < 100),
  amenities     text[] NOT NULL DEFAULT '{}',
  total_units   integer NOT NULL CHECK (total_units > 0),
  active        boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS property_rooms_property_idx ON public.property_rooms (property_id);

CREATE TABLE IF NOT EXISTS public.room_availability (
  room_id     text NOT NULL REFERENCES public.property_rooms(id) ON DELETE CASCADE,
  day         date NOT NULL,
  units_available integer NOT NULL CHECK (units_available >= 0),
  price_paise integer NOT NULL CHECK (price_paise >= 0),
  blocked     boolean NOT NULL DEFAULT false,
  PRIMARY KEY (room_id, day)
);
CREATE INDEX IF NOT EXISTS room_availability_day_idx ON public.room_availability (day, units_available);

CREATE TABLE IF NOT EXISTS public.restaurants (
  id            text PRIMARY KEY,
  destination_id text NOT NULL REFERENCES public.destinations(id),
  name          text NOT NULL,
  cuisines      text[] NOT NULL DEFAULT '{}',
  description   text NOT NULL DEFAULT '',
  lat           double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng           double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  prep_minutes  integer NOT NULL DEFAULT 30 CHECK (prep_minutes > 0),
  data_class    text NOT NULL DEFAULT 'demo-listing',
  image_status  text NOT NULL DEFAULT 'unavailable' CHECK (image_status IN ('verified','unavailable')),
  published     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS restaurants_dest_idx ON public.restaurants (destination_id) WHERE published;

CREATE TABLE IF NOT EXISTS public.restaurant_menus (
  id           text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  category     text NOT NULL DEFAULT 'main',
  active       boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.food_products (
  id           text PRIMARY KEY,
  menu_id      text NOT NULL REFERENCES public.restaurant_menus(id) ON DELETE CASCADE,
  restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  price_paise  integer NOT NULL CHECK (price_paise >= 0),
  vegetarian   boolean NOT NULL DEFAULT true,
  available    boolean NOT NULL DEFAULT true,
  customizations jsonb NOT NULL DEFAULT '[]'::jsonb,
  addons       jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_status text NOT NULL DEFAULT 'unavailable'
);
CREATE INDEX IF NOT EXISTS food_products_restaurant_idx ON public.food_products (restaurant_id, available);

CREATE TABLE IF NOT EXISTS public.grocery_stores (
  id            text PRIMARY KEY,
  destination_id text NOT NULL REFERENCES public.destinations(id),
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  lat           double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng           double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  delivery_radius_km numeric(6,2) NOT NULL DEFAULT 8 CHECK (delivery_radius_km > 0),
  delivery_coverage text[] NOT NULL DEFAULT '{}',
  delivery_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_class    text NOT NULL DEFAULT 'demo-listing',
  published     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS grocery_stores_dest_idx ON public.grocery_stores (destination_id) WHERE published;

CREATE TABLE IF NOT EXISTS public.grocery_products (
  id           text PRIMARY KEY,
  store_id     text NOT NULL REFERENCES public.grocery_stores(id) ON DELETE CASCADE,
  name         text NOT NULL,
  category     text NOT NULL CHECK (category IN ('fruits','vegetables','dairy','bakery','snacks','beverages','household','personal-care','packaged-foods','local-products','other')),
  variant      text NOT NULL DEFAULT 'standard',
  unit         text NOT NULL DEFAULT 'piece',
  price_paise  integer NOT NULL CHECK (price_paise >= 0),
  image_status text NOT NULL DEFAULT 'unavailable'
);
CREATE INDEX IF NOT EXISTS grocery_products_store_idx ON public.grocery_products (store_id, category);

CREATE TABLE IF NOT EXISTS public.grocery_inventory (
  store_id    text NOT NULL REFERENCES public.grocery_stores(id) ON DELETE CASCADE,
  product_id  text NOT NULL REFERENCES public.grocery_products(id) ON DELETE CASCADE,
  stock       integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.tour_packages (
  id            text PRIMARY KEY,
  destination_id text NOT NULL REFERENCES public.destinations(id),
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  duration_hours integer NOT NULL CHECK (duration_hours > 0),
  price_paise   integer NOT NULL CHECK (price_paise >= 0),
  capacity      integer NOT NULL DEFAULT 12 CHECK (capacity > 0),
  lat           double precision CHECK (lat BETWEEN -90 AND 90),
  lng           double precision CHECK (lng BETWEEN -180 AND 180),
  data_class    text NOT NULL DEFAULT 'demo-listing',
  published     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tour_packages_dest_idx ON public.tour_packages (destination_id) WHERE published;

CREATE TABLE IF NOT EXISTS public.tour_activities (
  id            text PRIMARY KEY,
  destination_id text NOT NULL REFERENCES public.destinations(id),
  package_id    text REFERENCES public.tour_packages(id) ON DELETE SET NULL,
  name          text NOT NULL,
  kind          text NOT NULL DEFAULT 'sightseeing' CHECK (kind IN ('sightseeing','experience','activity')),
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  price_paise   integer NOT NULL DEFAULT 0 CHECK (price_paise >= 0),
  lat           double precision CHECK (lat BETWEEN -90 AND 90),
  lng           double precision CHECK (lng BETWEEN -180 AND 180),
  description   text NOT NULL DEFAULT '',
  data_class    text NOT NULL DEFAULT 'demo-listing',
  published     boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS tour_activities_dest_idx ON public.tour_activities (destination_id, kind);

CREATE TABLE IF NOT EXISTS public.coupons (
  code            text PRIMARY KEY,
  kind            text NOT NULL CHECK (kind IN ('percent','flat')),
  value           integer NOT NULL CHECK (value > 0),
  min_subtotal_paise integer NOT NULL DEFAULT 0,
  max_discount_paise integer,
  active          boolean NOT NULL DEFAULT true,
  starts_at       timestamptz,
  ends_at         timestamptz
);

CREATE TABLE IF NOT EXISTS public.promotions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL,
  service     text,
  active      boolean NOT NULL DEFAULT false,
  starts_at   timestamptz,
  ends_at     timestamptz
);
