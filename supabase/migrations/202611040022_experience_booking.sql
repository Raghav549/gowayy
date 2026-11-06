-- Real host-owned local experiences, schedules and server-validated capacity.
ALTER TABLE public.partner_tours ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE public.partner_tours ADD COLUMN IF NOT EXISTS meeting_point text NOT NULL DEFAULT '';
ALTER TABLE public.partner_tours ADD COLUMN IF NOT EXISTS requirements text NOT NULL DEFAULT '';
ALTER TABLE public.partner_tours ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'experience';
ALTER TABLE public.partner_tours DROP CONSTRAINT IF EXISTS partner_tours_kind_check;
ALTER TABLE public.partner_tours ADD CONSTRAINT partner_tours_kind_check CHECK (kind IN ('experience', 'package'));
ALTER TABLE public.experience_bookings ADD COLUMN IF NOT EXISTS slot_id uuid;
ALTER TABLE public.experience_bookings ADD COLUMN IF NOT EXISTS guest_answers jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.experience_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id text NOT NULL REFERENCES public.partner_tours(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, starts_at),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS experience_slots_schedule_idx ON public.experience_slots (offering_id, starts_at) WHERE active;
ALTER TABLE public.experience_bookings ADD CONSTRAINT experience_bookings_slot_fk FOREIGN KEY (slot_id) REFERENCES public.experience_slots(id) ON DELETE RESTRICT;

-- Append reservation fields without changing the established booking-read contract.
CREATE OR REPLACE VIEW public.customer_bookings WITH (security_invoker = true) AS
SELECT b.id, b.reference, b.user_id, b.journey_id, b.service, b.status, b.listing_id,
       b.title, b.details, b.price, b.total_paise, b.payment_id, b.created_at, b.updated_at,
       b.source_table, COALESCE(h.history, '[]'::jsonb) AS status_history,
       b.guests, b.visit_date, b.slot_id
FROM (
  SELECT id, reference, user_id, journey_id, service, status, NULL::text AS listing_id,
         title, details, price, total_paise, payment_id, created_at, updated_at, 'ride_bookings'::text AS source_table,
         NULL::integer AS guests, NULL::date AS visit_date, NULL::uuid AS slot_id
  FROM public.ride_bookings
  UNION ALL
  SELECT id, reference, user_id, journey_id, service, status, property_id AS listing_id,
         title, details, price, total_paise, payment_id, created_at, updated_at, 'hotel_bookings'::text,
         NULL::integer AS guests, NULL::date AS visit_date, NULL::uuid AS slot_id
  FROM public.hotel_bookings
  UNION ALL
  SELECT id, reference, user_id, journey_id, service, status, offering_id AS listing_id,
         title, details, price, total_paise, payment_id, created_at, updated_at, 'experience_bookings'::text,
         travellers AS guests, visit_date, slot_id
  FROM public.experience_bookings
  UNION ALL
  SELECT id, reference, user_id, journey_id, service, status, NULL::text,
         title, details, price, total_paise, payment_id, created_at, updated_at, 'parcel_bookings'::text,
         NULL::integer AS guests, NULL::date AS visit_date, NULL::uuid AS slot_id
  FROM public.parcel_bookings
) b
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('status', e.to_status, 'at', e.created_at, 'by', e.actor)
                   ORDER BY e.created_at) AS history
  FROM public.booking_events e WHERE e.booking_id = b.id
) h ON true;

CREATE UNIQUE INDEX IF NOT EXISTS experience_one_active_booking_per_guest_idx
  ON public.experience_bookings (user_id, slot_id) WHERE slot_id IS NOT NULL AND status IN ('requested','confirmed');
ALTER TABLE public.experience_slots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.gowayy_verified_experience_host(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.partner_claims c WHERE c.user_id = p_user AND c.role = 'tour_operator' AND c.state = 'verified');
$$;

CREATE OR REPLACE FUNCTION public.gowayy_experience_offering_json(t public.partner_tours)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', t.id, 'kind', t.kind, 'name', t.name, 'description', t.description, 'destinationId', t.destination_id,
    'destinationName', (SELECT d.name FROM public.destinations d WHERE d.id = t.destination_id),
    'pricePaise', t.price_paise, 'durationHours', t.duration_hours, 'durationMinutes', round(t.duration_hours * 60)::integer,
    'capacity', t.capacity, 'meetingPoint', t.meeting_point, 'requirements', t.requirements,
    'host', jsonb_build_object('id', t.user_id, 'name', COALESCE(
      NULLIF((SELECT pp.business_name FROM public.partner_profiles pp WHERE pp.user_id = t.user_id), ''),
      NULLIF(trim((SELECT p.first_name || ' ' || p.last_name FROM public.profiles p WHERE p.id = t.user_id)), ''))),
    'active', t.active, 'createdAt', t.created_at)
$$;

CREATE OR REPLACE FUNCTION public.rpc_experience_offerings(p_destination_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('items', COALESCE(jsonb_agg(public.gowayy_experience_offering_json(t) ORDER BY t.created_at DESC), '[]'::jsonb))
  FROM public.partner_tours t
  WHERE t.active AND public.gowayy_verified_experience_host(t.user_id)
    AND (NULLIF(p_destination_id, '') IS NULL OR t.destination_id = p_destination_id)
$$;
GRANT EXECUTE ON FUNCTION public.rpc_experience_offerings(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_experience_slots(p_offering_id text, p_date date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_offering public.partner_tours%ROWTYPE; BEGIN
  SELECT * INTO v_offering FROM public.partner_tours t WHERE t.id = p_offering_id AND t.active AND public.gowayy_verified_experience_host(t.user_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'OFFERING_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'DATE_REQUIRED' USING ERRCODE = '22023'; END IF;
  RETURN jsonb_build_object(
    'offering', public.gowayy_experience_offering_json(v_offering),
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'offeringId', s.offering_id, 'startsAt', s.starts_at, 'endsAt', s.ends_at,
      'capacity', s.capacity, 'booked', COALESCE((SELECT sum(b.travellers) FROM public.experience_bookings b
        WHERE b.slot_id = s.id AND b.status IN ('requested','confirmed','completed')), 0),
      'available', s.capacity - COALESCE((SELECT sum(b.travellers) FROM public.experience_bookings b
        WHERE b.slot_id = s.id AND b.status IN ('requested','confirmed','completed')), 0)
    ) ORDER BY s.starts_at) FROM public.experience_slots s
      WHERE s.offering_id = p_offering_id AND s.active AND s.starts_at > now()
        AND (s.starts_at AT TIME ZONE 'Asia/Kolkata')::date = p_date), '[]'::jsonb));
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_experience_slots(text, date) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_experience_quote(p_slot_id uuid, p_guests integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_slot public.experience_slots%ROWTYPE; v_offering public.partner_tours%ROWTYPE;
  v_booked integer; v_price jsonb;
BEGIN
  IF p_guests IS NULL OR p_guests < 1 OR p_guests > 20 THEN RAISE EXCEPTION 'INVALID_GUEST_COUNT' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_slot FROM public.experience_slots s WHERE s.id = p_slot_id AND s.active AND s.starts_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'SLOT_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_offering FROM public.partner_tours t WHERE t.id = v_slot.offering_id AND t.active AND public.gowayy_verified_experience_host(t.user_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'OFFERING_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(sum(b.travellers), 0) INTO v_booked FROM public.experience_bookings b WHERE b.slot_id = p_slot_id AND b.status IN ('requested','confirmed','completed');
  IF v_booked + p_guests > v_slot.capacity THEN RAISE EXCEPTION 'SLOT_UNAVAILABLE: only % place(s) remain', greatest(0, v_slot.capacity - v_booked) USING ERRCODE = '23514'; END IF;
  v_price := public.gowayy_price(jsonb_build_array(jsonb_build_object('label', p_guests || ' guest(s) · ' || v_offering.name, 'paise', v_offering.price_paise * p_guests)),
    COALESCE((public.gowayy_config('gst_percent'))::text::numeric, 5), public.gowayy_commission_rate(v_offering.kind));
  RETURN jsonb_build_object('offering', public.gowayy_experience_offering_json(v_offering),
    'slot', jsonb_build_object('id', v_slot.id, 'offeringId', v_slot.offering_id, 'startsAt', v_slot.starts_at, 'endsAt', v_slot.ends_at,
      'capacity', v_slot.capacity, 'booked', v_booked, 'available', v_slot.capacity - v_booked),
    'guests', p_guests, 'service', v_offering.kind, 'price', v_price);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_experience_quote(uuid, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_partner_experience_slots(p_offering_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := public.gowayy_require_user(); BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.partner_tours t WHERE t.id = p_offering_id AND t.user_id = v_user) THEN RAISE EXCEPTION 'OFFERING_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', s.id, 'offeringId', s.offering_id, 'startsAt', s.starts_at, 'endsAt', s.ends_at,
    'capacity', s.capacity, 'active', s.active,
    'booked', COALESCE((SELECT sum(b.travellers) FROM public.experience_bookings b WHERE b.slot_id = s.id AND b.status IN ('requested','confirmed','completed')), 0)
  ) ORDER BY s.starts_at DESC) FROM public.experience_slots s WHERE s.offering_id = p_offering_id), '[]'::jsonb));
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_partner_experience_slots(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_partner_experience_slot_add(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.gowayy_require_user(); v_offering public.partner_tours%ROWTYPE;
  v_start timestamptz := NULLIF(p_payload->>'startAt', '')::timestamptz; v_capacity integer := (p_payload->>'capacity')::integer;
  v_slot public.experience_slots%ROWTYPE;
BEGIN
  SELECT * INTO v_offering FROM public.partner_tours t WHERE t.id = p_payload->>'offeringId' AND t.user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'OFFERING_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  IF v_start IS NULL OR v_start <= now() THEN RAISE EXCEPTION 'INVALID_SLOT_TIME: choose a future start time' USING ERRCODE = '22023'; END IF;
  IF v_capacity IS NULL OR v_capacity < 1 OR v_capacity > v_offering.capacity THEN RAISE EXCEPTION 'INVALID_SLOT_CAPACITY: capacity must be between 1 and %', v_offering.capacity USING ERRCODE = '22023'; END IF;
  INSERT INTO public.experience_slots (offering_id, starts_at, ends_at, capacity)
  VALUES (v_offering.id, v_start, v_start + (v_offering.duration_hours::double precision * interval '1 hour'), v_capacity)
  ON CONFLICT (offering_id, starts_at) DO UPDATE SET ends_at = EXCLUDED.ends_at, capacity = EXCLUDED.capacity, active = true, updated_at = now()
    WHERE EXCLUDED.capacity >= COALESCE((SELECT sum(b.travellers) FROM public.experience_bookings b
      WHERE b.slot_id = experience_slots.id AND b.status IN ('requested','confirmed','completed')), 0)
  RETURNING * INTO v_slot;
  IF v_slot.id IS NULL THEN RAISE EXCEPTION 'INVALID_SLOT_CAPACITY: capacity cannot be lower than the guests already booked' USING ERRCODE = '23514'; END IF;
  PERFORM public.gowayy_audit('partner.experience.slot.saved', 'experience_slots', v_slot.id::text, jsonb_build_object('offeringId', v_offering.id));
  RETURN jsonb_build_object('slot', to_jsonb(v_slot));
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_partner_experience_slot_add(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_partner_experience_slot_delete(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := public.gowayy_require_user(); BEGIN
  IF EXISTS (SELECT 1 FROM public.experience_bookings b WHERE b.slot_id = p_id AND b.status IN ('requested','confirmed')) THEN RAISE EXCEPTION 'SLOT_HAS_BOOKINGS: cancel or complete its bookings first' USING ERRCODE = '23514'; END IF;
  UPDATE public.experience_slots s SET active = false, updated_at = now() WHERE s.id = p_id
    AND EXISTS (SELECT 1 FROM public.partner_tours t WHERE t.id = s.offering_id AND t.user_id = v_user);
  IF NOT FOUND THEN RAISE EXCEPTION 'SLOT_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('deactivated', true);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_partner_experience_slot_delete(uuid) TO authenticated;

-- Keep the existing booking operation and idempotency wrapper, but make real
-- experiences consume a selected host slot under a row lock.
CREATE OR REPLACE FUNCTION public.gowayy_book_tourism(p_user uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_offering_id text := p->>'offeringId'; service text := COALESCE(p->>'service', 'tourism');
  name text; base integer := 0; dest text; guests integer := GREATEST(1, COALESCE((p->>'travellers')::integer, 1));
  price jsonb; v_id uuid; ref text; jid uuid; v_slot_id uuid := NULLIF(p->>'slotId', '')::uuid;
  v_slot public.experience_slots%ROWTYPE; v_quote jsonb; v_host uuid; v_kind text;
BEGIN
  IF guests > 20 THEN RAISE EXCEPTION 'INVALID_GUEST_COUNT' USING ERRCODE = '22023'; END IF;
  IF service = 'experience' OR v_slot_id IS NOT NULL OR
    (service = 'package' AND EXISTS (SELECT 1 FROM public.partner_tours t WHERE t.id = v_offering_id)) THEN
    IF v_slot_id IS NULL THEN RAISE EXCEPTION 'SLOT_REQUIRED: choose a real available time' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_slot FROM public.experience_slots s WHERE s.id = v_slot_id AND s.offering_id = v_offering_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SLOT_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.experience_bookings b WHERE b.slot_id = v_slot_id AND b.user_id = p_user AND b.status IN ('requested','confirmed')) THEN
      RAISE EXCEPTION 'BOOKING_ALREADY_EXISTS: you already have an active booking for this slot' USING ERRCODE = '23505';
    END IF;
    v_quote := public.rpc_experience_quote(v_slot_id, guests);
    SELECT t.name, t.destination_id, t.user_id, t.kind INTO name, dest, v_host, v_kind FROM public.partner_tours t WHERE t.id = v_offering_id;
    IF v_kind IS NULL OR v_kind <> service THEN RAISE EXCEPTION 'OFFERING_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    price := v_quote->'price'; jid := NULLIF(p->>'journeyId', '')::uuid; ref := public.gowayy_reference('EXP');
    INSERT INTO public.experience_bookings (reference, user_id, journey_id, service, offering_id, destination_id,
      status, visit_date, travellers, title, details, price, total_paise, slot_id, guest_answers)
    VALUES (ref, p_user, jid, service, v_offering_id, dest, 'requested', (v_slot.starts_at AT TIME ZONE 'Asia/Kolkata')::date,
      guests, name, jsonb_build_object('service', service, 'slotId', v_slot_id, 'startsAt', v_slot.starts_at, 'endsAt', v_slot.ends_at,
        'meetingPoint', v_quote->'offering'->>'meetingPoint', 'requirements', v_quote->'offering'->>'requirements',
        'answers', COALESCE(p->'answers', '{}'::jsonb)),
      price, (price->>'totalPaise')::integer, v_slot_id, COALESCE(p->'answers', '{}'::jsonb)) RETURNING id INTO v_id;
    PERFORM public.gowayy_link_journey(jid, p_user, service, v_id);
    INSERT INTO public.booking_events (booking_id, booking_table, service, to_status, actor, actor_id)
    VALUES (v_id, 'experience_bookings', service, 'requested', 'customer', p_user);
    PERFORM public.gowayy_notify(p_user, 'booking.requested', 'Experience request sent', ref || ' · ' || name, 'booking:' || v_id || ':requested');
    PERFORM public.gowayy_notify(v_host, 'booking.experience.requested', 'New experience booking', ref || ' · ' || guests || ' guest(s)', 'host-booking:' || v_id || ':requested');
    PERFORM public.gowayy_audit('booking.create', 'experience_bookings', v_id::text, jsonb_build_object('service', service, 'slotId', v_slot_id));
    RETURN v_id;
  END IF;

  SELECT tp.name, tp.price_paise, tp.destination_id INTO name, base, dest FROM public.tour_packages tp WHERE tp.id = v_offering_id AND tp.published;
  IF name IS NULL THEN
    SELECT ta.name, ta.price_paise, ta.destination_id INTO name, base, dest FROM public.tour_activities ta WHERE ta.id = v_offering_id AND ta.published;
  END IF;
  IF name IS NULL THEN
    SELECT da.name, 0, da.destination_id INTO name, base, dest FROM public.destination_attractions da WHERE da.id = v_offering_id AND da.published;
  END IF;
  IF name IS NULL THEN RAISE EXCEPTION 'OFFERING_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  price := public.gowayy_price(jsonb_build_array(jsonb_build_object('label', guests || ' guest(s) · ' || name, 'paise', base * guests)),
    COALESCE((public.gowayy_config('gst_percent'))::text::numeric, 5), public.gowayy_commission_rate(service));
  jid := NULLIF(p->>'journeyId', '')::uuid; ref := public.gowayy_reference('TOUR');
  INSERT INTO public.experience_bookings (reference, user_id, journey_id, service, offering_id, destination_id,
    status, visit_date, travellers, title, details, price, total_paise)
  VALUES (ref, p_user, jid, service, v_offering_id, dest, 'requested', NULLIF(p->>'visitDate', '')::date,
    guests, name, jsonb_build_object('service', service, 'visitDate', p->>'visitDate', 'guests', guests), price, (price->>'totalPaise')::integer)
  RETURNING id INTO v_id;
  PERFORM public.gowayy_link_journey(jid, p_user, service, v_id);
  INSERT INTO public.booking_events (booking_id, booking_table, service, to_status, actor, actor_id)
  VALUES (v_id, 'experience_bookings', service, 'requested', 'customer', p_user);
  PERFORM public.gowayy_notify(p_user, 'booking.requested', 'Experience request sent', ref || ' · ' || name, 'booking:' || v_id || ':requested');
  PERFORM public.gowayy_audit('booking.create', 'experience_bookings', v_id::text, jsonb_build_object('service', service));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_tour_add(p_user uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id text := 'tur_' || gen_random_uuid()::text; BEGIN
  IF p_user IS DISTINCT FROM public.gowayy_require_user() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user AND role = 'tour_operator') THEN RAISE EXCEPTION 'ROLE_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF char_length(btrim(COALESCE(p_payload->>'name', ''))) < 2 OR COALESCE((p_payload->>'pricePaise')::integer, -1) < 0
    OR COALESCE((p_payload->>'durationHours')::numeric, 0) <= 0 OR COALESCE((p_payload->>'capacity')::integer, 0) < 1
    OR COALESCE(p_payload->>'kind', 'experience') NOT IN ('experience', 'package') THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.destinations d WHERE d.id = p_payload->>'destinationId' AND d.published) THEN RAISE EXCEPTION 'DESTINATION_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.partner_tours (id, user_id, destination_id, name, kind, description, meeting_point, requirements, price_paise, duration_hours, capacity)
  VALUES (v_id, p_user, p_payload->>'destinationId', left(btrim(p_payload->>'name'), 100), COALESCE(p_payload->>'kind', 'experience'),
    left(COALESCE(p_payload->>'description', ''), 2000), left(COALESCE(p_payload->>'meetingPoint', ''), 300), left(COALESCE(p_payload->>'requirements', ''), 1000),
    (p_payload->>'pricePaise')::integer, (p_payload->>'durationHours')::numeric, (p_payload->>'capacity')::integer);
  RETURN jsonb_build_object('tour', (SELECT row_to_json(t)::jsonb FROM (SELECT * FROM public.partner_tours WHERE id = v_id) t));
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_tour_update(p_user uuid, p_id text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_user IS DISTINCT FROM public.gowayy_require_user() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  UPDATE public.partner_tours SET name = left(COALESCE(NULLIF(p_payload->>'name', ''), name), 100),
    description = left(COALESCE(p_payload->>'description', description), 2000), meeting_point = left(COALESCE(p_payload->>'meetingPoint', meeting_point), 300),
    requirements = left(COALESCE(p_payload->>'requirements', requirements), 1000),
    price_paise = COALESCE((p_payload->>'pricePaise')::integer, price_paise), duration_hours = COALESCE((p_payload->>'durationHours')::numeric, duration_hours),
    capacity = COALESCE((p_payload->>'capacity')::integer, capacity), active = COALESCE((p_payload->>'active')::boolean, active), updated_at = now()
  WHERE id = p_id AND user_id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'OFFERING_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('tour', (SELECT row_to_json(t)::jsonb FROM (SELECT * FROM public.partner_tours WHERE id = p_id) t));
END $$;


-- Partner reads and fulfilment use record ownership/assignment, never a broad role.
CREATE OR REPLACE FUNCTION public.gowayy_booking_actor(p_table text, p_id uuid, p_user uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;
  IF p_table = 'ride_bookings' AND EXISTS (
    SELECT 1 FROM public.ride_assignments a JOIN public.drivers d ON d.id = a.driver_id
    WHERE a.booking_id = p_id AND a.state = 'accepted' AND d.user_id = p_user AND d.deleted_at IS NULL
  ) THEN RETURN 'driver'; END IF;
  IF p_table = 'parcel_bookings' AND EXISTS (
    SELECT 1 FROM public.drivers d WHERE d.user_id = p_user AND d.active_task_id = p_id AND d.deleted_at IS NULL
  ) THEN RETURN 'driver'; END IF;
  IF p_table = 'hotel_bookings' AND EXISTS (
    SELECT 1 FROM public.hotel_bookings b JOIN public.partner_claims c ON c.listing_id = b.property_id
    WHERE b.id = p_id AND c.user_id = p_user AND c.role = 'property' AND c.state = 'verified'
  ) THEN RETURN 'partner'; END IF;
  IF p_table = 'experience_bookings' AND EXISTS (
    SELECT 1 FROM public.experience_bookings b JOIN public.partner_tours t ON t.id = b.offering_id
    WHERE b.id = p_id AND t.user_id = p_user
  ) THEN RETURN 'partner'; END IF;
  RETURN NULL;
END $$;

DROP POLICY IF EXISTS experience_bookings_partner_read ON public.experience_bookings;
CREATE POLICY experience_bookings_partner_read ON public.experience_bookings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.partner_tours t WHERE t.id = offering_id AND t.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.rpc_transition_booking(p_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); tbl text := public.gowayy_booking_table(p_id);
  old_status text; v_actor text; owner uuid; listing text; service text; ok boolean;
BEGIN
  IF tbl IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  EXECUTE format('SELECT status, user_id, service, COALESCE(' ||
    CASE WHEN tbl = 'hotel_bookings' THEN 'property_id' WHEN tbl = 'experience_bookings' THEN 'offering_id' ELSE 'NULL::text' END ||
    ') FROM public.%I WHERE id = $1', tbl) INTO old_status, owner, service, listing USING p_id;
  v_actor := public.gowayy_booking_actor(tbl, p_id, u);
  IF owner = u AND v_actor IS NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.booking_status_transitions WHERE from_status = old_status AND to_status = p_status) INTO ok;
    IF NOT ok THEN RAISE EXCEPTION 'INVALID_TRANSITION: % → % is not permitted for customer', old_status, p_status USING ERRCODE = '23514'; END IF;
    IF p_status <> 'cancelled' THEN RAISE EXCEPTION 'FORBIDDEN: customers cannot advance fulfilment' USING ERRCODE = '42501'; END IF;
    v_actor := 'customer';
  END IF;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'FORBIDDEN: not your assigned booking' USING ERRCODE = '42501'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.booking_status_transitions
    WHERE from_status = old_status AND to_status = p_status AND actor = v_actor) INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'INVALID_TRANSITION: % → % is not permitted for %', old_status, p_status, v_actor USING ERRCODE = '23514'; END IF;
  EXECUTE format('UPDATE public.%I SET status = $1, updated_at = now() WHERE id = $2', tbl) USING p_status, p_id;
  INSERT INTO public.booking_events (booking_id, booking_table, service, from_status, to_status, actor, actor_id, note)
  VALUES (p_id, tbl, service, old_status, p_status, v_actor, u, p_note);
  PERFORM public.gowayy_notify(owner, 'booking.' || p_status, 'Booking ' || p_status,
    'Your ' || service || ' booking is now ' || p_status || '.', 'booking:' || p_id || ':' || p_status);
  PERFORM public.gowayy_audit('booking.transition', tbl, p_id::text, jsonb_build_object('from', old_status, 'to', p_status));
  RETURN public.gowayy_booking_json(p_id);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_transition_order(p_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); tbl text := public.gowayy_order_table(p_id);
  old_status text; v_actor text; owner uuid; ok boolean;
BEGIN
  IF tbl IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  EXECUTE format('SELECT status, user_id FROM public.%I WHERE id = $1', tbl) INTO old_status, owner USING p_id;
  IF public.gowayy_can_fulfil_order(tbl, p_id, u) THEN v_actor := 'partner';
  ELSIF tbl IN ('food_orders','grocery_orders') AND EXISTS (
    SELECT 1 FROM public.drivers d WHERE d.user_id = u AND d.active_task_id = p_id AND d.deleted_at IS NULL
  ) THEN v_actor := 'driver'; END IF;
  IF owner = u AND v_actor IS NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.order_status_transitions WHERE from_status = old_status AND to_status = p_status) INTO ok;
    IF NOT ok THEN RAISE EXCEPTION 'INVALID_TRANSITION: % → % is not permitted for customer', old_status, p_status USING ERRCODE = '23514'; END IF;
    IF p_status <> 'cancelled' THEN RAISE EXCEPTION 'FORBIDDEN: customers cannot advance fulfilment' USING ERRCODE = '42501'; END IF;
    v_actor := 'customer';
  END IF;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'FORBIDDEN: not your assigned order' USING ERRCODE = '42501'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.order_status_transitions
    WHERE from_status = old_status AND to_status = p_status AND actor = v_actor) INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'INVALID_TRANSITION: % → % is not permitted for %', old_status, p_status, v_actor USING ERRCODE = '23514'; END IF;
  IF p_status = 'delivered' AND tbl = 'marketplace_orders' AND NOT EXISTS (
    SELECT 1 FROM public.marketplace_orders WHERE id = p_id AND delivery_verified_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'DELIVERY_CODE_REQUIRED' USING ERRCODE = '23514'; END IF;
  EXECUTE format('UPDATE public.%I SET status = $1, updated_at = now() WHERE id = $2', tbl) USING p_status, p_id;
  INSERT INTO public.order_events (order_id, order_table, from_status, to_status, actor, actor_id)
  VALUES (p_id, tbl, old_status, p_status, v_actor, u);
  PERFORM public.gowayy_notify(owner, 'order.' || p_status, 'Order ' || p_status,
    'Your order is now ' || p_status || '.', 'order:' || p_id || ':' || p_status);
  PERFORM public.gowayy_audit('order.transition', tbl, p_id::text, jsonb_build_object('from', old_status, 'to', p_status));
  RETURN public.gowayy_order_json(p_id);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_inbox(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); BEGIN
  IF p_user IS DISTINCT FROM u THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'bookings', COALESCE((SELECT jsonb_agg(public.gowayy_booking_json(x.id) ORDER BY x.created_at DESC) FROM (
      SELECT b.id, b.created_at FROM public.ride_bookings b
      WHERE b.status IN ('requested','awaiting_payment','confirmed','assigned','in_progress')
        AND public.gowayy_booking_actor('ride_bookings', b.id, u) IS NOT NULL
      UNION ALL
      SELECT b.id, b.created_at FROM public.hotel_bookings b
      WHERE b.status IN ('requested','awaiting_payment','confirmed','assigned','in_progress')
        AND public.gowayy_booking_actor('hotel_bookings', b.id, u) IS NOT NULL
      UNION ALL
      SELECT b.id, b.created_at FROM public.experience_bookings b
      WHERE b.status IN ('requested','awaiting_payment','confirmed','assigned','in_progress')
        AND public.gowayy_booking_actor('experience_bookings', b.id, u) IS NOT NULL
      UNION ALL
      SELECT b.id, b.created_at FROM public.parcel_bookings b
      WHERE b.status IN ('requested','awaiting_payment','confirmed','assigned','in_progress')
        AND public.gowayy_booking_actor('parcel_bookings', b.id, u) IS NOT NULL
    ) x), '[]'::jsonb),
    'orders', COALESCE((SELECT jsonb_agg(public.gowayy_order_json(x.id) ORDER BY x.created_at DESC) FROM (
      SELECT o.id, o.created_at FROM public.food_orders o
      WHERE o.status NOT IN ('delivered','cancelled','refunded') AND (
        public.gowayy_can_fulfil_order('food_orders', o.id, u)
        OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = u AND d.active_task_id = o.id AND d.deleted_at IS NULL))
      UNION ALL
      SELECT o.id, o.created_at FROM public.grocery_orders o
      WHERE o.status NOT IN ('delivered','cancelled','refunded') AND (
        public.gowayy_can_fulfil_order('grocery_orders', o.id, u)
        OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = u AND d.active_task_id = o.id AND d.deleted_at IS NULL))
      UNION ALL
      SELECT o.id, o.created_at FROM public.marketplace_orders o
      WHERE o.status NOT IN ('delivered','cancelled','refunded') AND public.gowayy_can_fulfil_order('marketplace_orders', o.id, u)
    ) x), '[]'::jsonb),
    'notifications', COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC) FROM (
      SELECT * FROM public.notifications WHERE user_id = u ORDER BY created_at DESC LIMIT 50
    ) n), '[]'::jsonb)
  );
END $$;


-- Separate per-payment settlement ledger entries from Partner payout requests.
CREATE TABLE IF NOT EXISTS public.partner_payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_paise integer NOT NULL CHECK (amount_paise > 0),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','paid','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS payout_request_id uuid REFERENCES public.partner_payout_requests(id) ON DELETE RESTRICT;
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.settlements(id) ON DELETE RESTRICT;
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS refund_id uuid REFERENCES public.refunds(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS settlements_payout_request_idx ON public.settlements (payout_request_id);
CREATE UNIQUE INDEX IF NOT EXISTS settlements_refund_reversal_once_idx ON public.settlements (reversal_of, refund_id)
  WHERE reversal_of IS NOT NULL AND refund_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.gowayy_complete_refund(p_refund_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_refund public.refunds%ROWTYPE; v_payment public.payments%ROWTYPE; v_total integer; v_full boolean;
  v_settlement public.settlements%ROWTYPE; v_ratio numeric; v_gross integer; v_commission integer;
BEGIN
  SELECT * INTO v_refund FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND OR v_refund.status = 'succeeded' THEN RETURN; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = v_refund.payment_id FOR UPDATE;
  UPDATE public.refunds SET status = 'succeeded', updated_at = now() WHERE id = p_refund_id;
  SELECT COALESCE(sum(amount_paise), 0) INTO v_total FROM public.refunds WHERE payment_id = v_payment.id AND status = 'succeeded';
  v_full := v_total >= v_payment.amount_paise;
  UPDATE public.payments SET status = CASE WHEN v_full THEN 'refunded' ELSE 'partially_refunded' END, updated_at = now() WHERE id = v_payment.id;
  IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE payment_id = v_payment.id AND note = 'refund:' || p_refund_id::text) THEN
    INSERT INTO public.transactions (payment_id, type, amount_paise, note) VALUES (v_payment.id, 'refund', -v_refund.amount_paise, 'refund:' || p_refund_id::text);
  END IF;
  v_ratio := CASE WHEN v_payment.amount_paise > 0 THEN LEAST(1, v_refund.amount_paise::numeric / v_payment.amount_paise) ELSE 1 END;
  FOR v_settlement IN SELECT * FROM public.settlements WHERE payment_id = v_payment.id AND reversal_of IS NULL LOOP
    IF v_settlement.payout_request_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.partner_payout_requests pr WHERE pr.id = v_settlement.payout_request_id AND pr.status = 'requested'
    ) THEN
      UPDATE public.partner_payout_requests SET status = 'cancelled', updated_at = now() WHERE id = v_settlement.payout_request_id;
      UPDATE public.settlements SET payout_request_id = NULL WHERE payout_request_id = v_settlement.payout_request_id;
      PERFORM public.gowayy_audit('partner.payout.cancelled_for_refund', 'partner_payout_requests', v_settlement.payout_request_id::text,
        jsonb_build_object('refundId', p_refund_id));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.settlements s WHERE s.reversal_of = v_settlement.id AND s.refund_id = p_refund_id) THEN
      v_gross := round(v_settlement.gross_paise * v_ratio)::integer;
      v_commission := round(v_settlement.commission_paise * v_ratio)::integer;
      INSERT INTO public.settlements (partner_id, payment_id, gross_paise, commission_paise, net_paise, state, reversal_of, refund_id)
      VALUES (v_settlement.partner_id, v_payment.id, -v_gross, -v_commission, -(v_gross - v_commission), 'pending', v_settlement.id, p_refund_id);
    END IF;
  END LOOP;
  IF v_full AND v_payment.order_table IS NOT NULL THEN
    EXECUTE format('UPDATE public.%I SET status = ''refunded'', updated_at = now() WHERE id = $1', v_payment.order_table) USING v_payment.order_id;
  ELSIF v_full AND v_payment.booking_table IS NOT NULL THEN
    EXECUTE format('UPDATE public.%I SET status = ''refunded'', updated_at = now() WHERE id = $1', v_payment.booking_table) USING v_payment.booking_id;
  END IF;
  PERFORM public.gowayy_notify(v_payment.user_id, 'payment.refunded', 'Refund confirmed',
    'INR ' || round(v_refund.amount_paise / 100.0, 2) || ' has been refunded by the payment provider.', 'refund:' || p_refund_id::text);
END $$;
REVOKE ALL ON FUNCTION public.gowayy_complete_refund(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_partner_earnings(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); v_rows jsonb; v_gross bigint; v_net bigint; v_settled bigint; v_pending bigint; v_requested bigint;
BEGIN
  IF p_user IS DISTINCT FROM u THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ref', COALESCE(
      (SELECT b.reference FROM public.ride_bookings b WHERE b.id = p.booking_id),
      (SELECT b.reference FROM public.hotel_bookings b WHERE b.id = p.booking_id),
      (SELECT b.reference FROM public.experience_bookings b WHERE b.id = p.booking_id),
      (SELECT b.reference FROM public.parcel_bookings b WHERE b.id = p.booking_id),
      (SELECT o.reference FROM public.food_orders o WHERE o.id = p.order_id),
      (SELECT o.reference FROM public.grocery_orders o WHERE o.id = p.order_id),
      (SELECT o.reference FROM public.marketplace_orders o WHERE o.id = p.order_id), 'Payment'),
    'service', COALESCE(
      (SELECT b.service FROM public.ride_bookings b WHERE b.id = p.booking_id),
      (SELECT b.service FROM public.hotel_bookings b WHERE b.id = p.booking_id),
      (SELECT b.service FROM public.experience_bookings b WHERE b.id = p.booking_id),
      (SELECT b.service FROM public.parcel_bookings b WHERE b.id = p.booking_id),
      CASE p.order_table WHEN 'food_orders' THEN 'food' WHEN 'grocery_orders' THEN 'grocery' WHEN 'marketplace_orders' THEN 'marketplace' END, 'unknown'),
    'grossPaise', s.gross_paise, 'commissionPaise', s.commission_paise, 'netPaise', s.net_paise,
    'reversal', s.reversal_of IS NOT NULL, 'at', s.created_at) ORDER BY s.created_at DESC), '[]'::jsonb)
  INTO v_rows FROM public.settlements s JOIN public.payments p ON p.id = s.payment_id WHERE s.partner_id = u;
  SELECT COALESCE(sum(s.gross_paise), 0), COALESCE(sum(s.net_paise), 0),
    COALESCE(sum(s.net_paise) FILTER (WHERE s.state = 'paid' OR pr.status = 'paid'), 0),
    COALESCE(sum(s.net_paise) FILTER (WHERE s.state = 'pending' AND s.payout_request_id IS NULL), 0)
  INTO v_gross, v_net, v_settled, v_pending
  FROM public.settlements s LEFT JOIN public.partner_payout_requests pr ON pr.id = s.payout_request_id WHERE s.partner_id = u;
  SELECT COALESCE(sum(amount_paise), 0) INTO v_requested FROM public.partner_payout_requests WHERE partner_id = u AND status = 'requested';
  RETURN jsonb_build_object('commissionPercent', NULL, 'commissionLabel', 'Varies by service', 'rows', v_rows,
    'totalGrossPaise', v_gross, 'totalNetPaise', v_net, 'settledPaise', v_settled,
    'pendingPayoutPaise', greatest(0, v_pending), 'requestedPayoutPaise', v_requested);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_settlements()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); BEGIN
  RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', r.id, 'amountPaise', r.amount_paise, 'status', r.status, 'createdAt', r.created_at) ORDER BY r.created_at DESC)
    FROM public.partner_payout_requests r WHERE r.partner_id = u), '[]'::jsonb));
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_partner_settlements() TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_settlement_request(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); v_profile uuid; v_amount bigint; v_id uuid;
BEGIN
  IF p_user IS DISTINCT FROM u THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  -- Serialize requests per Partner so two clicks cannot link the same ledger rows twice.
  SELECT id INTO v_profile FROM public.profiles WHERE id = u FOR UPDATE;
  SELECT COALESCE(sum(net_paise), 0) INTO v_amount FROM public.settlements
    WHERE partner_id = u AND state = 'pending' AND payout_request_id IS NULL;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'NOTHING_TO_SETTLE' USING ERRCODE = '23514'; END IF;
  INSERT INTO public.partner_payout_requests (partner_id, amount_paise) VALUES (u, v_amount) RETURNING id INTO v_id;
  UPDATE public.settlements SET payout_request_id = v_id WHERE partner_id = u AND state = 'pending' AND payout_request_id IS NULL;
  PERFORM public.gowayy_audit('partner.payout.requested', 'partner_payout_requests', v_id::text, jsonb_build_object('amountPaise', v_amount));
  RETURN jsonb_build_object('settlement', (SELECT jsonb_build_object('id', id, 'amountPaise', amount_paise, 'status', status, 'createdAt', created_at)
    FROM public.partner_payout_requests WHERE id = v_id));
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_overview(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); v_inbox jsonb; BEGIN
  IF p_user IS DISTINCT FROM u THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  v_inbox := public.rpc_partner_inbox(u);
  RETURN jsonb_build_object(
    'roles', COALESCE((SELECT jsonb_agg(role) FROM public.user_roles WHERE user_id = u), '[]'::jsonb),
    'counts', jsonb_build_object('bookings', jsonb_array_length(v_inbox->'bookings'), 'orders', jsonb_array_length(v_inbox->'orders'),
      'openRequests', jsonb_array_length(v_inbox->'bookings') + jsonb_array_length(v_inbox->'orders')),
    'earnings', public.rpc_partner_earnings(u));
END $$;
