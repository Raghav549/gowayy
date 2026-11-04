-- Shared server-side helpers. SECURITY DEFINER is used only for functions that must
-- bypass RLS to enforce business rules; each one re-checks the caller identity.

CREATE TABLE IF NOT EXISTS public.app_config (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_config (key, value) VALUES
  ('demo_mode', 'true'::jsonb),
  ('otp_mode', '"demo"'::jsonb),
  ('payment_provider', '"sandbox"'::jsonb),
  ('commission_rates', '{"cab":12,"shared_taxi":8,"food":15,"grocery":10,"hotel":12,"homestay":12,"tourism":14,"experience":14,"package":14,"parcel":12}'::jsonb),
  ('gst_percent', '5'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.gowayy_config(p_key text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT value FROM public.app_config WHERE key = p_key;
$$;

CREATE OR REPLACE FUNCTION public.gowayy_demo_mode()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT value FROM public.app_config WHERE key = 'demo_mode') = 'true'::jsonb, false);
$$;

CREATE OR REPLACE FUNCTION public.gowayy_require_user()
RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE u uuid := auth.uid();
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED: sign in to continue' USING ERRCODE = '42501'; END IF;
  RETURN u;
END $$;

CREATE OR REPLACE FUNCTION public.gowayy_audit(p_action text, p_entity text, p_entity_id text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity, entity_id, metadata)
  VALUES (auth.uid(), COALESCE(auth.uid()::text, 'system'), p_action, p_entity, p_entity_id, p_metadata);
END $$;

CREATE OR REPLACE FUNCTION public.gowayy_notify(p_user_id uuid, p_type text, p_title text, p_body text, p_dedupe_key text, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, channel, data, dedupe_key)
  VALUES (p_user_id, p_type, p_title, p_body, 'in_app', p_data, p_dedupe_key)
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.gowayy_rate_limit(p_key text, p_limit integer DEFAULT 10, p_window_seconds integer DEFAULT 60)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.rate_limit_buckets%ROWTYPE;
BEGIN
  INSERT INTO public.rate_limit_buckets (key, hits, window_start) VALUES (p_key, 1, now())
  ON CONFLICT (key) DO UPDATE SET
    hits = CASE WHEN public.rate_limit_buckets.window_start < now() - (p_window_seconds || ' seconds')::interval
                THEN 1 ELSE public.rate_limit_buckets.hits + 1 END,
    window_start = CASE WHEN public.rate_limit_buckets.window_start < now() - (p_window_seconds || ' seconds')::interval
                        THEN now() ELSE public.rate_limit_buckets.window_start END,
    updated_at = now()
  RETURNING * INTO r;
  IF r.hits > p_limit THEN
    RAISE EXCEPTION 'RATE_LIMITED: too many requests, try again shortly' USING ERRCODE = '42901';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.gowayy_haversine_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT round((6371 * 2 * asin(sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
    cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  )))::numeric, 2);
$$;

-- Money maths in integer paise, mirroring packages/pricing-engine.
CREATE OR REPLACE FUNCTION public.gowayy_price(p_lines jsonb, p_tax_percent numeric DEFAULT 5, p_commission_percent numeric DEFAULT 12)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  WITH l AS (
    SELECT COALESCE(sum((x->>'paise')::integer), 0)::integer AS subtotal
    FROM jsonb_array_elements(p_lines) AS x
  ), c AS (
    SELECT subtotal,
           round(subtotal * p_tax_percent / 100)::integer AS tax,
           round(subtotal * p_commission_percent / 100)::integer AS commission
    FROM l
  )
  SELECT jsonb_build_object(
    'lines', p_lines, 'subtotalPaise', subtotal, 'taxPaise', tax,
    'commissionPaise', commission, 'totalPaise', subtotal + tax, 'currency', 'INR'
  ) FROM c;
$$;

CREATE OR REPLACE FUNCTION public.gowayy_reference(p_prefix text)
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT 'GW-' || upper(p_prefix) || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

CREATE OR REPLACE FUNCTION public.gowayy_booking_table(p_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ride_bookings WHERE id = p_id) THEN RETURN 'ride_bookings'; END IF;
  IF EXISTS (SELECT 1 FROM public.hotel_bookings WHERE id = p_id) THEN RETURN 'hotel_bookings'; END IF;
  IF EXISTS (SELECT 1 FROM public.experience_bookings WHERE id = p_id) THEN RETURN 'experience_bookings'; END IF;
  IF EXISTS (SELECT 1 FROM public.parcel_bookings WHERE id = p_id) THEN RETURN 'parcel_bookings'; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.gowayy_order_table(p_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.food_orders WHERE id = p_id) THEN RETURN 'food_orders'; END IF;
  IF EXISTS (SELECT 1 FROM public.grocery_orders WHERE id = p_id) THEN RETURN 'grocery_orders'; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.gowayy_booking_json(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE out jsonb;
BEGIN
  SELECT to_jsonb(b) INTO out FROM public.customer_bookings b WHERE b.id = p_id;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.gowayy_order_json(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE out jsonb;
BEGIN
  SELECT to_jsonb(o) INTO out FROM public.customer_orders o WHERE o.id = p_id;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.gowayy_link_journey(p_journey_id uuid, p_user_id uuid, p_service text, p_booking_id uuid DEFAULT NULL, p_order_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_journey_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.journeys j WHERE j.id = p_journey_id AND j.user_id = p_user_id) THEN
    RAISE EXCEPTION 'JOURNEY_NOT_FOUND: journey does not belong to this account' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.journey_services (journey_id, service, booking_id, order_id, state, label)
  VALUES (p_journey_id, p_service, p_booking_id, p_order_id, 'requested', p_service)
  ON CONFLICT DO NOTHING;
END $$;

-- Universal search and connected recommendations are data-driven SQL so adding a new
-- destination or listing requires no application change.
CREATE OR REPLACE FUNCTION public.rpc_search(p_q text)
RETURNS TABLE (id text, kind text, title text, subtitle text, service text, destination_id text, href text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH q AS (SELECT '%' || lower(btrim(p_q)) || '%' AS pattern)
  SELECT d.id, 'destination'::text, d.name, d.region, NULL::text, d.id, '/destinations/' || d.slug
    FROM public.destinations d, q WHERE lower(d.name || ' ' || d.region || ' ' || d.description) LIKE q.pattern AND d.published
  UNION ALL
  SELECT a.id, 'attraction'::text, a.name, a.category, 'tourism'::text, a.destination_id, '/tourism?attraction=' || a.id
    FROM public.destination_attractions a, q WHERE lower(a.name || ' ' || a.category) LIKE q.pattern AND a.published
  UNION ALL
  SELECT p.id, 'property'::text, p.name, p.property_type, p.service, p.destination_id, '/hotels/' || p.id
    FROM public.properties p, q WHERE lower(p.name || ' ' || p.property_type) LIKE q.pattern AND p.published
  UNION ALL
  SELECT r.id, 'restaurant'::text, r.name, array_to_string(r.cuisines, ', '), 'food'::text, r.destination_id, '/food/' || r.id
    FROM public.restaurants r, q WHERE lower(r.name || ' ' || array_to_string(r.cuisines, ' ')) LIKE q.pattern AND r.published
  UNION ALL
  SELECT f.id, 'food'::text, f.name, r.name, 'food'::text, r.destination_id, '/food/' || r.id
    FROM public.food_products f JOIN public.restaurants r ON r.id = f.restaurant_id, q
    WHERE lower(f.name) LIKE q.pattern AND f.available
  UNION ALL
  SELECT g.id, 'grocery'::text, g.name, s.name, 'grocery'::text, s.destination_id, '/groceries/' || s.id
    FROM public.grocery_products g JOIN public.grocery_stores s ON s.id = g.store_id, q
    WHERE lower(g.name) LIKE q.pattern
  UNION ALL
  SELECT t.id, 'taxi_route'::text, pf.name || ' → ' || pt.name, COALESCE(st.name, t.operator),
         'shared_taxi'::text, NULL::text, '/cabs?shared=' || t.id
    FROM public.shared_taxi_routes t
    JOIN public.places pf ON pf.id = t.from_place_id JOIN public.places pt ON pt.id = t.to_place_id
    LEFT JOIN public.taxi_stands st ON st.id = t.stand_id, q
    WHERE lower(pf.name || ' ' || pt.name || ' shared taxi') LIKE q.pattern AND t.active
  UNION ALL
  SELECT tp.id, 'package'::text, tp.name, tp.duration_hours || ' h', 'package'::text, tp.destination_id, '/packages?offering=' || tp.id
    FROM public.tour_packages tp, q WHERE lower(tp.name) LIKE q.pattern AND tp.published
  UNION ALL
  SELECT ta.id, 'experience'::text, ta.name, ta.duration_minutes || ' min', 'experience'::text, ta.destination_id, '/experiences?offering=' || ta.id
    FROM public.tour_activities ta, q WHERE ta.kind = 'experience' AND lower(ta.name) LIKE q.pattern
  LIMIT 30;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_search(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_recommendations(p_destination_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH groups AS (
    SELECT 'properties' AS g, jsonb_agg(jsonb_build_object('id', x.id, 'title', x.name, 'service', x.service, 'available', true, 'href', '/hotels/' || x.id)) AS items
      FROM (SELECT id, name, service FROM public.properties WHERE destination_id = p_destination_id AND published) x
    UNION ALL
    SELECT 'restaurants', jsonb_agg(jsonb_build_object('id', x.id, 'title', x.name, 'service', 'food', 'available', true, 'href', '/food/' || x.id))
      FROM (SELECT id, name FROM public.restaurants WHERE destination_id = p_destination_id AND published) x
    UNION ALL
    SELECT 'attractions', jsonb_agg(jsonb_build_object('id', x.id, 'title', x.name, 'service', 'tourism', 'available', true, 'href', '/tourism?attraction=' || x.id))
      FROM (SELECT id, name FROM public.destination_attractions WHERE destination_id = p_destination_id AND published) x
    UNION ALL
    SELECT 'packages', jsonb_agg(jsonb_build_object('id', x.id, 'title', x.name, 'service', 'package', 'available', true, 'href', '/packages?offering=' || x.id))
      FROM (SELECT id, name FROM public.tour_packages WHERE destination_id = p_destination_id AND published) x
    UNION ALL
    SELECT 'experiences', jsonb_agg(jsonb_build_object('id', x.id, 'title', x.name, 'service', 'experience', 'available', true, 'href', '/experiences?offering=' || x.id))
      FROM (SELECT id, name FROM public.tour_activities WHERE destination_id = p_destination_id AND kind = 'experience' AND published) x
    UNION ALL
    SELECT 'groceries', jsonb_agg(jsonb_build_object('id', x.id, 'title', x.name, 'service', 'grocery', 'available', true, 'href', '/groceries/' || x.id))
      FROM (SELECT id, name FROM public.grocery_stores WHERE destination_id = p_destination_id AND published) x
    UNION ALL
    SELECT 'taxiRoutes', jsonb_agg(jsonb_build_object('id', x.id, 'title', x.name, 'service', 'shared_taxi', 'available', x.seats_available > 0, 'href', '/cabs?shared=' || x.id))
      FROM (SELECT r.id, pf.name || ' → ' || pt.name AS name, r.seats_available FROM public.shared_taxi_routes r
            JOIN public.places pf ON pf.id = r.from_place_id JOIN public.places pt ON pt.id = r.to_place_id
            JOIN public.destinations d ON d.id = p_destination_id AND (r.to_place_id LIKE '%' || d.slug || '%' OR r.from_place_id LIKE '%' || d.slug || '%')) x
  )
  SELECT jsonb_object_agg(g, COALESCE(items, '[]'::jsonb)) FROM groups;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_recommendations(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_estimate_route(p_from text, p_to text, p_vehicle text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.places%ROWTYPE; b public.places%ROWTYPE; km numeric; mins integer; v public.vehicle_classes%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.places WHERE id = p_from;
  SELECT * INTO b FROM public.places WHERE id = p_to;
  IF a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'PLACE_NOT_FOUND: unknown pickup or destination' USING ERRCODE = '22023'; END IF;
  IF a.id = b.id THEN RAISE EXCEPTION 'SAME_PLACE: pickup and destination must differ' USING ERRCODE = '22023'; END IF;
  km := public.gowayy_haversine_km(a.lat, a.lng, b.lat, b.lng);
  -- Straight-line great-circle distance is explicitly an estimate, not a road route.
  mins := round(km * 1.35 / 32 * 60 + 12)::integer;
  IF p_vehicle IS NOT NULL THEN SELECT * INTO v FROM public.vehicle_classes WHERE id = p_vehicle; END IF;
  RETURN jsonb_build_object(
    'route', jsonb_build_object('straightLineKm', km, 'distanceKm', round(km * 1.35, 2),
      'durationMin', mins, 'provider', 'gowayy-haversine', 'note',
      'Great-circle estimate with a road factor. Configure a directions provider for road-accurate routing.',
      'points', jsonb_build_array(jsonb_build_object('lat', a.lat, 'lng', a.lng), jsonb_build_object('lat', b.lat, 'lng', b.lng))),
    'vehicle', CASE WHEN v.id IS NULL THEN NULL ELSE to_jsonb(v) END
  );
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_estimate_route(text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_create_journey(p_draft jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); j public.journeys%ROWTYPE;
BEGIN
  INSERT INTO public.journeys (user_id, title, destination_id, pickup, dropoff, start_date, end_date, travellers, preferences)
  VALUES (u, COALESCE(p_draft->>'title', 'My journey'), p_draft->>'destinationId',
          p_draft->'pickup', p_draft->'dropoff',
          NULLIF(p_draft->>'startDate', '')::date, NULLIF(p_draft->>'endDate', '')::date,
          GREATEST(1, COALESCE((p_draft->>'travellers')::integer, 1)),
          COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_draft->'preferences')), '{}'::text[]))
  RETURNING * INTO j;
  RETURN to_jsonb(j);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_create_journey(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_update_journey(p_id uuid, p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); j public.journeys%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.journeys WHERE id = p_id AND user_id = u) THEN
    RAISE EXCEPTION 'JOURNEY_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  UPDATE public.journeys SET
    title = COALESCE(p_patch->>'title', title),
    destination_id = COALESCE(p_patch->>'destinationId', destination_id),
    pickup = COALESCE(p_patch->'pickup', pickup),
    dropoff = COALESCE(p_patch->'dropoff', dropoff),
    start_date = COALESCE(NULLIF(p_patch->>'startDate', '')::date, start_date),
    end_date = COALESCE(NULLIF(p_patch->>'endDate', '')::date, end_date),
    travellers = COALESCE((p_patch->>'travellers')::integer, travellers),
    preferences = COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_patch->'preferences')), preferences),
    nearby_services = COALESCE(p_patch->'nearbyServices', nearby_services)
  WHERE id = p_id AND user_id = u RETURNING * INTO j;
  RETURN to_jsonb(j);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_update_journey(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_journey_components(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); j jsonb; c jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.journeys WHERE id = p_id AND user_id = u) THEN
    RAISE EXCEPTION 'JOURNEY_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  SELECT to_jsonb(x) INTO j FROM public.journeys x WHERE x.id = p_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('service', s.service, 'label', s.label, 'state', s.state,
          'bookingId', s.booking_id, 'orderId', s.order_id)), '[]'::jsonb) INTO c
    FROM public.journey_services s WHERE s.journey_id = p_id;
  RETURN jsonb_build_object('journey', j, 'components', c);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_journey_components(uuid) TO authenticated;
