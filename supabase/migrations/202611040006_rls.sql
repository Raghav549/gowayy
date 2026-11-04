-- Row Level Security. Every table is protected. Catalog data is publicly readable;
-- account data is owner-only; booking/order/payment writes go exclusively through
-- SECURITY DEFINER RPCs so status is always server-authoritative.

CREATE OR REPLACE FUNCTION public.gowayy_uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.gowayy_has_role(p_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = p_role
  );
$$;

CREATE OR REPLACE FUNCTION public.gowayy_is_partner_for(p_listing_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_claims c
    WHERE c.user_id = auth.uid() AND c.listing_id = p_listing_id AND c.state = 'verified'
  );
$$;

CREATE OR REPLACE FUNCTION public.gowayy_is_driver_of(p_driver_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = p_driver_id AND d.user_id = auth.uid());
$$;

-- Definer helpers break policy <-> policy recursion (e.g. ride_bookings <-> ride_assignments).
CREATE OR REPLACE FUNCTION public.gowayy_owns_booking(p_booking_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ride_bookings b WHERE b.id = p_booking_id AND b.user_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.hotel_bookings b WHERE b.id = p_booking_id AND b.user_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.experience_bookings b WHERE b.id = p_booking_id AND b.user_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.parcel_bookings b WHERE b.id = p_booking_id AND b.user_id = auth.uid()
  );
$$;

-- Enable RLS on every base table (never on views).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- Public, read-only discovery catalogue.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'destinations','destination_images','destination_attractions','destination_routes',
    'image_sources','places','vehicle_classes','taxi_stands','shared_taxi_routes',
    'shared_taxi_departures','properties','property_rooms','room_availability',
    'restaurants','restaurant_menus','food_products','grocery_stores','grocery_products',
    'grocery_inventory','tour_packages','tour_activities','coupons','promotions',
    'reviews','booking_status_transitions','order_status_transitions','dispatch_rules'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_public_read', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t || '_public_read', t);
    END IF;
  END LOOP;
END $$;

-- Owner-scoped account tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_addresses','saved_places','journeys','ride_bookings','hotel_bookings',
    'experience_bookings','parcel_bookings','food_orders','grocery_orders','payments',
    'notifications','support_tickets','partner_claims','drivers'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_read', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid())', t || '_owner_read', t);
    END IF;
  END LOOP;
END $$;

-- Additional partner visibility: a verified partner can read orders/bookings for their
-- own listing only. No policy grants platform-wide visibility (there is no admin role).
DO $$
DECLARE spec text[];
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'food_orders:restaurant_id','grocery_orders:store_id','hotel_bookings:property_id'
  ] LOOP
    spec := string_to_array(s, ':');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', spec[1] || '_partner_read', spec[1]);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.gowayy_is_partner_for(%I::text))',
                   spec[1] || '_partner_read', spec[1], spec[2]);
  END LOOP;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS ride_bookings_driver_read ON public.ride_bookings;
  CREATE POLICY ride_bookings_driver_read ON public.ride_bookings FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.ride_assignments a
                   JOIN public.drivers d ON d.id = a.driver_id
                   WHERE a.booking_id = ride_bookings.id AND d.user_id = auth.uid() AND a.state = 'accepted'));
END $$;

-- profile / role / user-data policies
CREATE OR REPLACE FUNCTION public.gowayy_owns_payment(p_payment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.payments p WHERE p.id = p_payment_id AND p.user_id = auth.uid());
$$;

DROP POLICY IF EXISTS profiles_owner_read ON public.profiles;
CREATE POLICY profiles_owner_read ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transactions','refunds'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.gowayy_owns_payment(payment_id))', t || '_owner_read', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS user_roles_owner_read ON public.user_roles;
CREATE POLICY user_roles_owner_read ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_addresses_write ON public.user_addresses;
CREATE POLICY user_addresses_write ON public.user_addresses FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS saved_places_write ON public.saved_places;
CREATE POLICY saved_places_write ON public.saved_places FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS journeys_write ON public.journeys;
CREATE POLICY journeys_write ON public.journeys FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS journey_services_owner ON public.journey_services;
CREATE POLICY journey_services_owner ON public.journey_services FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journeys j WHERE j.id = journey_id AND j.user_id = auth.uid()));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['driver_documents','driver_vehicles','driver_services','driver_availability','driver_locations'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_driver_access', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.gowayy_is_driver_of(driver_id)) WITH CHECK (public.gowayy_is_driver_of(driver_id))',
                   t || '_driver_access', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS drivers_owner_write ON public.drivers;
CREATE POLICY drivers_owner_write ON public.drivers FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS support_messages_owner ON public.support_ticket_messages;
CREATE POLICY support_messages_owner ON public.support_ticket_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid()));
DROP POLICY IF EXISTS support_tickets_insert ON public.support_tickets;
CREATE POLICY support_tickets_insert ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS food_order_items_read ON public.food_order_items;
CREATE POLICY food_order_items_read ON public.food_order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.food_orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
DROP POLICY IF EXISTS grocery_order_items_read ON public.grocery_order_items;
CREATE POLICY grocery_order_items_read ON public.grocery_order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.grocery_orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
DROP POLICY IF EXISTS ride_fares_read ON public.ride_fares;
CREATE POLICY ride_fares_read ON public.ride_fares FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ride_bookings b WHERE b.id = booking_id AND b.user_id = auth.uid()));
DROP POLICY IF EXISTS ride_tracking_read ON public.ride_tracking;
CREATE POLICY ride_tracking_read ON public.ride_tracking FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ride_bookings b WHERE b.id = booking_id AND b.user_id = auth.uid()));
DROP POLICY IF EXISTS ride_assignments_read ON public.ride_assignments;
CREATE POLICY ride_assignments_read ON public.ride_assignments FOR SELECT TO authenticated
  USING (public.gowayy_is_driver_of(driver_id) OR public.gowayy_owns_booking(booking_id));
DROP POLICY IF EXISTS partner_claims_owner_insert ON public.partner_claims;
CREATE POLICY partner_claims_owner_insert ON public.partner_claims FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND state = 'pending');

-- Unified views expose only what the underlying policies allow.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.customer_bookings, public.customer_orders TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profiles, public.user_addresses, public.saved_places,
  public.journeys, public.support_tickets, public.partner_claims, public.drivers,
  public.driver_documents, public.driver_vehicles, public.driver_services,
  public.driver_availability, public.driver_locations TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- updated_at triggers for every table that has the column.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN pg_tables t ON t.tablename = c.table_name AND t.schemaname = 'public'
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'gowayy_touch_' || r.table_name, r.table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.gowayy_touch()',
                   'gowayy_touch_' || r.table_name, r.table_name);
  END LOOP;
END $$;

-- PostGIS spatial columns / GiST indexes (Supabase only).
SELECT public.gowayy_attach_geo();

-- Realtime: publication exists on Supabase; guarded for local PostgreSQL verification.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE
    public.ride_bookings, public.hotel_bookings, public.experience_bookings,
    public.food_orders, public.grocery_orders, public.notifications,
    public.ride_tracking, public.ride_assignments, public.driver_locations;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'supabase_realtime publication not present (%); realtime tables must be added by the Supabase deploy step', SQLERRM;
END $$;
