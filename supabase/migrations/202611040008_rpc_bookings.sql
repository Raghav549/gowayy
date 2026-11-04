-- Server-authoritative booking + order creation and state transitions.
-- Prices, availability and status are computed here; the client only submits intent.

CREATE OR REPLACE FUNCTION public.gowayy_coupon_discount(p_code text, p_subtotal integer)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.coupons%ROWTYPE; d integer := 0;
BEGIN
  IF p_code IS NULL OR btrim(p_code) = '' THEN RETURN 0; END IF;
  SELECT * INTO c FROM public.coupons WHERE upper(code) = upper(btrim(p_code));
  IF c.code IS NULL OR NOT c.active OR p_subtotal < c.min_subtotal_paise THEN RETURN 0; END IF;
  IF c.starts_at IS NOT NULL AND c.starts_at > now() THEN RETURN 0; END IF;
  IF c.ends_at IS NOT NULL AND c.ends_at < now() THEN RETURN 0; END IF;
  d := CASE WHEN c.kind = 'percent' THEN round(p_subtotal * c.value / 100.0)::integer ELSE c.value END;
  IF c.max_discount_paise IS NOT NULL THEN d := LEAST(d, c.max_discount_paise); END IF;
  RETURN LEAST(d, p_subtotal);
END $$;

CREATE OR REPLACE FUNCTION public.gowayy_commission_rate(p_service text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((public.gowayy_config('commission_rates')->>p_service)::numeric, 12);
$$;

-- ---------------------------------------------------------------------------
-- Cab / airport transfer / outstation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gowayy_book_cab(p_user uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.places%ROWTYPE; b public.places%ROWTYPE; v public.vehicle_classes%ROWTYPE;
  km numeric; mins integer; multiplier integer := 1; lines jsonb; price jsonb;
  subtotal integer; v_id uuid; ref text; jid uuid; tt text;
BEGIN
  SELECT * INTO a FROM public.places WHERE id = p->>'fromPlaceId';
  SELECT * INTO b FROM public.places WHERE id = p->>'toPlaceId';
  SELECT * INTO v FROM public.vehicle_classes WHERE id = p->>'vehicleId' AND active;
  IF a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'PLACE_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF a.id = b.id THEN RAISE EXCEPTION 'SAME_PLACE' USING ERRCODE = '22023'; END IF;
  IF v.id IS NULL THEN RAISE EXCEPTION 'VEHICLE_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  tt := COALESCE(p->>'tripType', 'one_way');
  IF tt = 'round_trip' THEN multiplier := 2; END IF;
  km := public.gowayy_haversine_km(a.lat, a.lng, b.lat, b.lng);
  mins := round(km * 1.35 / 32 * 60 + 12)::integer;
  lines := jsonb_build_array(
    jsonb_build_object('label', 'Base fare', 'paise', v.base_fare_paise * multiplier),
    jsonb_build_object('label', 'Distance (' || km || ' km)', 'paise', round(km * 1.35 * v.per_km_paise * multiplier)::integer),
    jsonb_build_object('label', 'Estimated time (' || mins || ' min)', 'paise', mins * v.per_min_paise * multiplier));
  SELECT COALESCE(sum((x->>'paise')::integer), 0) INTO subtotal FROM jsonb_array_elements(lines) x;
  IF subtotal < v.min_fare_paise THEN
    lines := lines || jsonb_build_array(jsonb_build_object('label', 'Minimum fare adjustment', 'paise', v.min_fare_paise - subtotal));
  END IF;
  price := public.gowayy_price(lines, COALESCE((public.gowayy_config('gst_percent'))::text::numeric, 5), public.gowayy_commission_rate('cab'));
  jid := NULLIF(p->>'journeyId', '')::uuid;
  ref := public.gowayy_reference('CAB');
  INSERT INTO public.ride_bookings (reference, user_id, journey_id, service, status, from_place_id, to_place_id,
    from_text, to_text, lat, lng, distance_km, duration_min, vehicle_class, trip_type, scheduled_for,
    title, details, price, total_paise)
  VALUES (ref, p_user, jid, 'cab', 'requested', a.id, b.id, a.name, b.name, a.lat, a.lng, km * 1.35, mins,
    v.id, tt, NULLIF(p->>'scheduledFor', '')::timestamptz, a.name || ' → ' || b.name,
    jsonb_build_object('vehicle', v.name, 'tripType', tt, 'estimate', 'haversine'), price, (price->>'totalPaise')::integer)
  RETURNING id INTO v_id;
  INSERT INTO public.ride_fares (booking_id, vehicle_class, lines, subtotal_paise, tax_paise, commission_paise, total_paise)
  VALUES (v_id, v.id, lines, (price->>'subtotalPaise')::integer, (price->>'taxPaise')::integer,
          (price->>'commissionPaise')::integer, (price->>'totalPaise')::integer);
  PERFORM public.gowayy_link_journey(jid, p_user, 'cab', v_id);
  INSERT INTO public.booking_events (booking_id, booking_table, service, to_status, actor, actor_id, note)
  VALUES (v_id, 'ride_bookings', 'cab', 'requested', 'customer', p_user, 'Booking requested');
  PERFORM public.gowayy_notify(p_user, 'booking.requested', 'Ride requested', ref || ': ' || a.name || ' → ' || b.name, 'booking:' || v_id || ':requested');
  PERFORM public.gowayy_audit('booking.create', 'ride_bookings', v_id::text, jsonb_build_object('service', 'cab'));
  RETURN v_id;
END $$;

-- ---------------------------------------------------------------------------
-- Shared taxi: operator-defined route, locked seat inventory
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gowayy_book_shared_taxi(p_user uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.shared_taxi_routes%ROWTYPE; seats integer; price jsonb; v_id uuid; ref text; jid uuid;
BEGIN
  seats := GREATEST(1, COALESCE((p->>'seats')::integer, 1));
  SELECT * INTO r FROM public.shared_taxi_routes WHERE id = p->>'routeId' AND active FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'ROUTE_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF r.seats_available < seats THEN RAISE EXCEPTION 'SEATS_UNAVAILABLE: no seats available on this departure' USING ERRCODE = '23514'; END IF;
  UPDATE public.shared_taxi_routes SET seats_available = seats_available - seats, updated_at = now() WHERE id = r.id;
  price := public.gowayy_price(jsonb_build_array(jsonb_build_object('label', 'Operator fare × ' || seats || ' seat(s)', 'paise', r.fare_paise * seats)), 0, public.gowayy_commission_rate('shared_taxi'));
  jid := NULLIF(p->>'journeyId', '')::uuid; ref := public.gowayy_reference('SHR');
  INSERT INTO public.ride_bookings (reference, user_id, journey_id, service, status, from_place_id, to_place_id,
    from_text, to_text, shared_route_id, seats, title, details, price, total_paise)
  VALUES (ref, p_user, jid, 'shared_taxi', 'requested', r.from_place_id, r.to_place_id,
    r.from_place_id, r.to_place_id, r.id, seats, 'Shared taxi · ' || r.operator,
    jsonb_build_object('stand', r.stand_id, 'operator', r.operator, 'permitNote', 'Local operating permissions apply.'),
    price, (price->>'totalPaise')::integer)
  RETURNING id INTO v_id;
  PERFORM public.gowayy_link_journey(jid, p_user, 'shared_taxi', v_id);
  INSERT INTO public.booking_events (booking_id, booking_table, service, to_status, actor, actor_id)
  VALUES (v_id, 'ride_bookings', 'shared_taxi', 'requested', 'customer', p_user);
  PERFORM public.gowayy_notify(p_user, 'booking.requested', 'Shared taxi seats reserved', ref || ' · ' || seats || ' seat(s)', 'booking:' || v_id || ':requested');
  PERFORM public.gowayy_audit('booking.create', 'ride_bookings', v_id::text, jsonb_build_object('service', 'shared_taxi'));
  RETURN v_id;
END $$;

-- ---------------------------------------------------------------------------
-- Hotel / homestay: real room_availability rows are locked for every night
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gowayy_book_stay(p_user uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  prop public.properties%ROWTYPE; room public.property_rooms%ROWTYPE;
  ci date := (p->>'checkIn')::date; co date := (p->>'checkOut')::date;
  rooms integer := GREATEST(1, COALESCE((p->>'rooms')::integer, 1));
  d date; nights integer; av public.room_availability%ROWTYPE; nightly integer;
  price jsonb; v_id uuid; ref text; jid uuid;
BEGIN
  IF ci IS NULL OR co IS NULL OR co <= ci THEN RAISE EXCEPTION 'INVALID_DATES' USING ERRCODE = '22023'; END IF;
  SELECT * INTO prop FROM public.properties WHERE id = p->>'propertyId' AND published;
  SELECT * INTO room FROM public.property_rooms WHERE id = p->>'roomId' AND property_id = prop.id AND active;
  IF prop.id IS NULL OR room.id IS NULL THEN RAISE EXCEPTION 'PROPERTY_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  nights := co - ci;
  nightly := room.base_price_paise;
  FOR d IN SELECT generate_series(ci, co - 1, interval '1 day')::date LOOP
    SELECT * INTO av FROM public.room_availability WHERE room_id = room.id AND day = d FOR UPDATE;
    IF NOT FOUND OR av.blocked OR av.units_available < rooms THEN
      RAISE EXCEPTION 'ROOM_UNAVAILABLE: no confirmed availability for %', d USING ERRCODE = '23514';
    END IF;
    nightly := GREATEST(nightly, av.price_paise);
    UPDATE public.room_availability SET units_available = units_available - rooms WHERE room_id = room.id AND day = d;
  END LOOP;
  price := public.gowayy_price(jsonb_build_array(jsonb_build_object('label', rooms || ' room(s) × ' || nights || ' night(s)', 'paise', nightly * nights * rooms)),
    room.tax_percent, public.gowayy_commission_rate('hotel'));
  jid := NULLIF(p->>'journeyId', '')::uuid; ref := public.gowayy_reference('STAY');
  INSERT INTO public.hotel_bookings (reference, user_id, journey_id, service, property_id, room_id, status,
    check_in, check_out, adults, children, rooms, guest_details, lat, lng, title, details, price, total_paise)
  VALUES (ref, p_user, jid, prop.service, prop.id, room.id, 'requested', ci, co,
    GREATEST(1, COALESCE((p->>'adults')::integer, 1)), GREATEST(0, COALESCE((p->>'children')::integer, 0)), rooms,
    COALESCE(p->'guestDetails', '{}'::jsonb), prop.lat, prop.lng, prop.name,
    jsonb_build_object('room', room.name, 'nights', nights, 'cancellation', prop.cancellation),
    price, (price->>'totalPaise')::integer)
  RETURNING id INTO v_id;
  PERFORM public.gowayy_link_journey(jid, p_user, prop.service, v_id);
  INSERT INTO public.booking_events (booking_id, booking_table, service, to_status, actor, actor_id)
  VALUES (v_id, 'hotel_bookings', prop.service, 'requested', 'customer', p_user);
  PERFORM public.gowayy_notify(p_user, 'booking.requested', 'Stay request sent', ref || ' · ' || prop.name, 'booking:' || v_id || ':requested');
  PERFORM public.gowayy_audit('booking.create', 'hotel_bookings', v_id::text, jsonb_build_object('propertyId', prop.id));
  RETURN v_id;
END $$;

-- ---------------------------------------------------------------------------
-- Tourism / experience / package
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gowayy_book_tourism(p_user uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  offering_id text := p->>'offeringId'; service text := COALESCE(p->>'service', 'tourism');
  name text; base integer := 0; dest text; guests integer := GREATEST(1, COALESCE((p->>'travellers')::integer, 1));
  price jsonb; v_id uuid; ref text; jid uuid;
BEGIN
  SELECT tp.name, tp.price_paise, tp.destination_id INTO name, base, dest FROM public.tour_packages tp WHERE tp.id = offering_id AND tp.published;
  IF name IS NULL THEN
    SELECT ta.name, ta.price_paise, ta.destination_id INTO name, base, dest FROM public.tour_activities ta WHERE ta.id = offering_id AND ta.published;
  END IF;
  IF name IS NULL THEN
    SELECT da.name, 0, da.destination_id INTO name, base, dest FROM public.destination_attractions da WHERE da.id = offering_id AND da.published;
  END IF;
  IF name IS NULL THEN RAISE EXCEPTION 'OFFERING_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  price := public.gowayy_price(jsonb_build_array(jsonb_build_object('label', guests || ' guest(s) · ' || name, 'paise', base * guests)),
    COALESCE((public.gowayy_config('gst_percent'))::text::numeric, 5), public.gowayy_commission_rate(service));
  jid := NULLIF(p->>'journeyId', '')::uuid; ref := public.gowayy_reference('TOUR');
  INSERT INTO public.experience_bookings (reference, user_id, journey_id, service, offering_id, destination_id,
    status, visit_date, travellers, title, details, price, total_paise)
  VALUES (ref, p_user, jid, service, offering_id, dest, 'requested', NULLIF(p->>'visitDate', '')::date,
    guests, name, jsonb_build_object('service', service), price, (price->>'totalPaise')::integer)
  RETURNING id INTO v_id;
  PERFORM public.gowayy_link_journey(jid, p_user, service, v_id);
  INSERT INTO public.booking_events (booking_id, booking_table, service, to_status, actor, actor_id)
  VALUES (v_id, 'experience_bookings', service, 'requested', 'customer', p_user);
  PERFORM public.gowayy_notify(p_user, 'booking.requested', 'Experience request sent', ref || ' · ' || name, 'booking:' || v_id || ':requested');
  PERFORM public.gowayy_audit('booking.create', 'experience_bookings', v_id::text, jsonb_build_object('service', service));
  RETURN v_id;
END $$;

-- ---------------------------------------------------------------------------
-- Parcel delivery
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gowayy_book_parcel(p_user uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.places%ROWTYPE; b public.places%ROWTYPE; km numeric; weight numeric;
  lines jsonb; price jsonb; v_id uuid; ref text; jid uuid;
BEGIN
  SELECT * INTO a FROM public.places WHERE id = p->>'fromPlaceId';
  SELECT * INTO b FROM public.places WHERE id = p->>'toPlaceId';
  IF a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'PLACE_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  weight := COALESCE((p->>'weightKg')::numeric, 1);
  IF weight <= 0 OR weight > 50 THEN RAISE EXCEPTION 'INVALID_WEIGHT' USING ERRCODE = '22023'; END IF;
  km := public.gowayy_haversine_km(a.lat, a.lng, b.lat, b.lng) * 1.35;
  lines := jsonb_build_array(
    jsonb_build_object('label', 'Pickup base', 'paise', 6000),
    jsonb_build_object('label', 'Distance (' || round(km, 1) || ' km)', 'paise', round(km * 1400)::integer),
    jsonb_build_object('label', 'Weight surcharge', 'paise', round(GREATEST(0, weight - 1) * 1200)::integer));
  price := public.gowayy_price(lines, COALESCE((public.gowayy_config('gst_percent'))::text::numeric, 5), public.gowayy_commission_rate('parcel'));
  jid := NULLIF(p->>'journeyId', '')::uuid; ref := public.gowayy_reference('PRC');
  INSERT INTO public.parcel_bookings (reference, user_id, journey_id, status, pickup_address, drop_address,
    lat, lng, weight_kg, title, details, price, total_paise)
  VALUES (ref, p_user, jid, 'requested', a.name, b.name, a.lat, a.lng, weight,
    'Parcel · ' || a.name || ' → ' || b.name, COALESCE(p->'details', '{}'::jsonb), price, (price->>'totalPaise')::integer)
  RETURNING id INTO v_id;
  PERFORM public.gowayy_link_journey(jid, p_user, 'parcel', v_id);
  INSERT INTO public.booking_events (booking_id, booking_table, service, to_status, actor, actor_id)
  VALUES (v_id, 'parcel_bookings', 'parcel', 'requested', 'customer', p_user);
  PERFORM public.gowayy_notify(p_user, 'booking.requested', 'Parcel request sent', ref, 'booking:' || v_id || ':requested');
  PERFORM public.gowayy_audit('booking.create', 'parcel_bookings', v_id::text, '{}'::jsonb);
  RETURN v_id;
END $$;

-- ---------------------------------------------------------------------------
-- Public entry point with idempotency
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_create_booking(p_service text, p_payload jsonb, p_idem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); existing uuid; out uuid;
BEGIN
  IF p_idem IS NULL OR char_length(p_idem) < 8 THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;
  PERFORM public.gowayy_rate_limit('booking:' || u::text, 30, 60);
  SELECT result_id INTO existing FROM public.idempotency_keys
    WHERE key = p_idem AND user_id = u AND operation = 'booking:' || p_service;
  IF FOUND THEN RETURN public.gowayy_booking_json(existing); END IF;
  out := CASE p_service
    WHEN 'cab' THEN public.gowayy_book_cab(u, p_payload)
    WHEN 'shared_taxi' THEN public.gowayy_book_shared_taxi(u, p_payload)
    WHEN 'hotel' THEN public.gowayy_book_stay(u, p_payload)
    WHEN 'homestay' THEN public.gowayy_book_stay(u, p_payload)
    WHEN 'tourism' THEN public.gowayy_book_tourism(u, p_payload)
    WHEN 'experience' THEN public.gowayy_book_tourism(u, p_payload)
    WHEN 'package' THEN public.gowayy_book_tourism(u, p_payload)
    WHEN 'parcel' THEN public.gowayy_book_parcel(u, p_payload)
    ELSE NULL END;
  IF out IS NULL THEN RAISE EXCEPTION 'UNSUPPORTED_SERVICE: %', p_service USING ERRCODE = '22023'; END IF;
  INSERT INTO public.idempotency_keys (key, user_id, operation, result_type, result_id)
  VALUES (p_idem, u, 'booking:' || p_service, 'booking', out);
  RETURN public.gowayy_booking_json(out);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_create_booking(text, jsonb, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Food and grocery orders
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gowayy_place_food_order(p_user uuid, p jsonb, p_idem text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r public.restaurants%ROWTYPE; item jsonb; prod public.food_products%ROWTYPE;
  lines jsonb := '[]'::jsonb; subtotal integer := 0; discount integer; price jsonb;
  v_id uuid; ref text; jid uuid; addr text := btrim(COALESCE(p->>'deliveryAddress', ''));
BEGIN
  IF addr = '' THEN RAISE EXCEPTION 'DELIVERY_ADDRESS_REQUIRED' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM public.restaurants WHERE id = p->>'restaurantId' AND published;
  IF r.id IS NULL THEN RAISE EXCEPTION 'RESTAURANT_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF p->'items' IS NULL OR jsonb_array_length(p->'items') = 0 THEN RAISE EXCEPTION 'EMPTY_CART' USING ERRCODE = '22023'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
    SELECT * INTO prod FROM public.food_products
      WHERE id = item->>'productId' AND restaurant_id = r.id AND available;
    IF prod.id IS NULL THEN RAISE EXCEPTION 'PRODUCT_UNAVAILABLE: %', item->>'productId' USING ERRCODE = '23514'; END IF;
    lines := lines || jsonb_build_array(jsonb_build_object('label',
      (item->>'quantity')::integer || ' × ' || prod.name,
      'paise', (item->>'quantity')::integer * prod.unit_price_paise));
    subtotal := subtotal + (item->>'quantity')::integer * prod.unit_price_paise;
  END LOOP;
  lines := lines || jsonb_build_array(jsonb_build_object('label', 'Delivery fee', 'paise', 3500));
  subtotal := subtotal + 3500;
  discount := public.gowayy_coupon_discount(p->>'coupon', subtotal);
  IF discount > 0 THEN
    lines := lines || jsonb_build_array(jsonb_build_object('label', 'Coupon discount', 'paise', -discount));
  END IF;
  price := public.gowayy_price(lines, COALESCE((public.gowayy_config('gst_percent'))::text::numeric, 5), public.gowayy_commission_rate('food'));
  jid := NULLIF(p->>'journeyId', '')::uuid; ref := public.gowayy_reference('FOOD');
  INSERT INTO public.food_orders (reference, user_id, journey_id, restaurant_id, status, delivery_address,
    instructions, coupon, price, total_paise)
  VALUES (ref, p_user, jid, r.id, 'created', addr, COALESCE(p->>'instructions', ''),
    NULLIF(p->>'coupon', ''), price, (price->>'totalPaise')::integer)
  RETURNING id INTO v_id;
  FOR item IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
    SELECT * INTO prod FROM public.food_products WHERE id = item->>'productId';
    INSERT INTO public.food_order_items (order_id, product_id, name, quantity, unit_price_paise, options)
    VALUES (v_id, prod.id, prod.name, (item->>'quantity')::integer, prod.unit_price_paise,
      COALESCE(item->'options', '[]'::jsonb));
  END LOOP;
  PERFORM public.gowayy_link_journey(jid, p_user, 'food', NULL, v_id);
  INSERT INTO public.order_events (order_id, order_table, to_status, actor, actor_id)
  VALUES (v_id, 'food_orders', 'created', 'customer', p_user);
  PERFORM public.gowayy_notify(p_user, 'order.created', 'Order sent to restaurant', ref || ' · ' || r.name, 'order:' || v_id || ':created');
  PERFORM public.gowayy_audit('order.create', 'food_orders', v_id::text, jsonb_build_object('idempotencyKey', p_idem));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.gowayy_place_grocery_order(p_user uuid, p jsonb, p_idem text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.grocery_stores%ROWTYPE; item jsonb; prod public.grocery_products%ROWTYPE;
  inv public.grocery_inventory%ROWTYPE; lines jsonb := '[]'::jsonb; subtotal integer := 0;
  discount integer; price jsonb; v_id uuid; ref text; jid uuid;
  addr text := btrim(COALESCE(p->>'deliveryAddress', ''));
BEGIN
  IF addr = '' THEN RAISE EXCEPTION 'DELIVERY_ADDRESS_REQUIRED' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM public.grocery_stores WHERE id = p->>'storeId' AND published;
  IF s.id IS NULL THEN RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF p->'items' IS NULL OR jsonb_array_length(p->'items') = 0 THEN RAISE EXCEPTION 'EMPTY_CART' USING ERRCODE = '22023'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
    SELECT * INTO prod FROM public.grocery_products WHERE id = item->>'productId' AND store_id = s.id;
    IF prod.id IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    SELECT * INTO inv FROM public.grocery_inventory WHERE store_id = s.id AND product_id = prod.id FOR UPDATE;
    IF NOT FOUND OR inv.stock < (item->>'quantity')::integer THEN
      RAISE EXCEPTION 'OUT_OF_STOCK: insufficient stock for %', prod.name USING ERRCODE = '23514';
    END IF;
    UPDATE public.grocery_inventory SET stock = stock - (item->>'quantity')::integer, updated_at = now()
      WHERE store_id = s.id AND product_id = prod.id;
    lines := lines || jsonb_build_array(jsonb_build_object('label',
      (item->>'quantity')::integer || ' × ' || prod.name,
      'paise', (item->>'quantity')::integer * prod.price_paise));
    subtotal := subtotal + (item->>'quantity')::integer * prod.price_paise;
  END LOOP;
  lines := lines || jsonb_build_array(jsonb_build_object('label', 'Delivery fee', 'paise', 2500));
  subtotal := subtotal + 2500;
  discount := public.gowayy_coupon_discount(p->>'coupon', subtotal);
  IF discount > 0 THEN lines := lines || jsonb_build_array(jsonb_build_object('label', 'Coupon discount', 'paise', -discount)); END IF;
  price := public.gowayy_price(lines, COALESCE((public.gowayy_config('gst_percent'))::text::numeric, 5), public.gowayy_commission_rate('grocery'));
  jid := NULLIF(p->>'journeyId', '')::uuid; ref := public.gowayy_reference('GROC');
  INSERT INTO public.grocery_orders (reference, user_id, journey_id, store_id, status, delivery_address,
    instructions, slot, substitution, coupon, price, total_paise)
  VALUES (ref, p_user, jid, s.id, 'created', addr, COALESCE(p->>'instructions', ''),
    p->>'slot', COALESCE(p->>'substitution', 'ask'), NULLIF(p->>'coupon', ''),
    price, (price->>'totalPaise')::integer)
  RETURNING id INTO v_id;
  FOR item IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
    SELECT * INTO prod FROM public.grocery_products WHERE id = item->>'productId';
    INSERT INTO public.grocery_order_items (order_id, product_id, name, quantity, unit_price_paise)
    VALUES (v_id, prod.id, prod.name, (item->>'quantity')::integer, prod.price_paise);
  END LOOP;
  PERFORM public.gowayy_link_journey(jid, p_user, 'grocery', NULL, v_id);
  INSERT INTO public.order_events (order_id, order_table, to_status, actor, actor_id)
  VALUES (v_id, 'grocery_orders', 'created', 'customer', p_user);
  PERFORM public.gowayy_notify(p_user, 'order.created', 'Grocery order placed', ref || ' · ' || s.name, 'order:' || v_id || ':created');
  PERFORM public.gowayy_audit('order.create', 'grocery_orders', v_id::text, jsonb_build_object('idempotencyKey', p_idem));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_place_order(p_service text, p_payload jsonb, p_idem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); existing uuid; out uuid;
BEGIN
  IF p_idem IS NULL OR char_length(p_idem) < 8 THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023'; END IF;
  PERFORM public.gowayy_rate_limit('order:' || u::text, 30, 60);
  SELECT result_id INTO existing FROM public.idempotency_keys
    WHERE key = p_idem AND user_id = u AND operation = 'order:' || p_service;
  IF FOUND THEN RETURN public.gowayy_order_json(existing); END IF;
  out := CASE p_service
    WHEN 'food' THEN public.gowayy_place_food_order(u, p_payload, p_idem)
    WHEN 'grocery' THEN public.gowayy_place_grocery_order(u, p_payload, p_idem)
    ELSE NULL END;
  IF out IS NULL THEN RAISE EXCEPTION 'UNSUPPORTED_SERVICE: %', p_service USING ERRCODE = '22023'; END IF;
  INSERT INTO public.idempotency_keys (key, user_id, operation, result_type, result_id)
  VALUES (p_idem, u, 'order:' || p_service, 'order', out);
  RETURN public.gowayy_order_json(out);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_place_order(text, jsonb, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- State transitions
-- ---------------------------------------------------------------------------
INSERT INTO public.booking_status_transitions (from_status, to_status, actor) VALUES
  ('requested','confirmed','system'), ('confirmed','assigned','system'), ('requested','failed','system')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.rpc_transition_booking(p_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); tbl text := public.gowayy_booking_table(p_id);
  old_status text; v_actor text := 'customer'; owner uuid; listing text; service text; ok boolean;
BEGIN
  IF tbl IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  EXECUTE format('SELECT status, user_id, service, COALESCE(' ||
    CASE WHEN tbl = 'hotel_bookings' THEN 'property_id' WHEN tbl = 'experience_bookings' THEN 'offering_id' ELSE 'NULL::text' END ||
    ') FROM public.%I WHERE id = $1', tbl) INTO old_status, owner, service, listing USING p_id;
  IF public.gowayy_has_role('driver') THEN v_actor := 'driver';
  ELSIF public.gowayy_has_role('restaurant') OR public.gowayy_has_role('property') OR public.gowayy_has_role('grocery')
        OR public.gowayy_is_partner_for(listing) THEN v_actor := 'partner';
  END IF;
  IF owner <> u AND v_actor = 'customer' THEN RAISE EXCEPTION 'FORBIDDEN: not your booking' USING ERRCODE = '42501'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.booking_status_transitions
                 WHERE from_status = old_status AND to_status = p_status AND actor = v_actor) INTO ok;
  IF NOT ok THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: % → % is not permitted for %', old_status, p_status, v_actor USING ERRCODE = '23514';
  END IF;
  EXECUTE format('UPDATE public.%I SET status = $1, updated_at = now() WHERE id = $2', tbl) USING p_status, p_id;
  INSERT INTO public.booking_events (booking_id, booking_table, service, from_status, to_status, actor, actor_id, note)
  VALUES (p_id, tbl, service, old_status, p_status, v_actor, u, p_note);
  PERFORM public.gowayy_notify(owner, 'booking.' || p_status, 'Booking ' || p_status,
    'Your ' || service || ' booking is now ' || p_status || '.', 'booking:' || p_id || ':' || p_status);
  PERFORM public.gowayy_audit('booking.transition', tbl, p_v_id::text, jsonb_build_object('from', old_status, 'to', p_status));
  RETURN public.gowayy_booking_json(p_id);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_transition_booking(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_transition_order(p_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); tbl text := public.gowayy_order_table(p_id);
  old_status text; v_actor text := 'customer'; owner uuid; listing text; ok boolean;
BEGIN
  IF tbl IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  EXECUTE format('SELECT status, user_id, ' || CASE WHEN tbl = 'food_orders' THEN 'restaurant_id' ELSE 'store_id' END ||
                 ' FROM public.%I WHERE id = $1', tbl) INTO old_status, owner, listing USING p_id;
  IF public.gowayy_has_role('driver') THEN v_actor := 'driver';
  ELSIF public.gowayy_is_partner_for(listing) THEN v_actor := 'partner'; END IF;
  IF owner <> u AND v_actor = 'customer' THEN RAISE EXCEPTION 'FORBIDDEN: not your order' USING ERRCODE = '42501'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.order_status_transitions
                 WHERE from_status = old_status AND to_status = p_status AND actor = v_actor) INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'INVALID_TRANSITION: % → % is not permitted for %', old_status, p_status, v_actor USING ERRCODE = '23514'; END IF;
  EXECUTE format('UPDATE public.%I SET status = $1, updated_at = now() WHERE id = $2', tbl) USING p_status, p_id;
  INSERT INTO public.order_events (order_id, order_table, from_status, to_status, actor, actor_id)
  VALUES (p_id, tbl, old_status, p_status, v_actor, u);
  PERFORM public.gowayy_notify(owner, 'order.' || p_status, 'Order ' || p_status,
    'Your order is now ' || p_status || '.', 'order:' || p_id || ':' || p_status);
  PERFORM public.gowayy_audit('order.transition', tbl, p_v_id::text, jsonb_build_object('from', old_status, 'to', p_status));
  RETURN public.gowayy_order_json(p_id);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_transition_order(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_review_booking(p_id uuid, p_rating integer, p_comment text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); tbl text := public.gowayy_booking_table(p_id); st text; owner uuid; listing text;
BEGIN
  IF tbl IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_RATING' USING ERRCODE = '22023'; END IF;
  EXECUTE format('SELECT status, user_id, ' || CASE WHEN tbl = 'hotel_bookings' THEN 'property_id' WHEN tbl = 'experience_bookings' THEN 'offering_id' ELSE 'NULL::text' END ||
                 ' FROM public.%I WHERE id = $1', tbl) INTO st, owner, listing USING p_id;
  IF owner <> u THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF st <> 'completed' THEN RAISE EXCEPTION 'REVIEW_REQUIRES_COMPLETED_BOOKING' USING ERRCODE = '23514'; END IF;
  INSERT INTO public.reviews (user_id, booking_id, listing_id, rating, comment, source)
  VALUES (u, p_id, listing, p_rating, left(COALESCE(p_comment, ''), 1000), 'verified-booking')
  ON CONFLICT (booking_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment;
  RETURN jsonb_build_object('bookingId', p_id, 'rating', p_rating, 'source', 'verified-booking');
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_review_booking(uuid, integer, text) TO authenticated;
