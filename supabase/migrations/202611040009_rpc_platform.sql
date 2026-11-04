-- Payments, cancellation/refunds, notifications, partner mode, dispatch and the
-- clearly labelled development OTP adapter.

INSERT INTO public.order_status_transitions (from_status, to_status, actor) VALUES
  ('created','accepted','system') ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Payment initiation. Nothing is marked paid here: only a verified webhook can do that.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_init_payment(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); idem text := p_payload->>'idempotencyKey';
  bid uuid := NULLIF(p_payload->>'bookingId', '')::uuid; oid uuid := NULLIF(p_payload->>'orderId', '')::uuid;
  bt text; ot text; amount integer; method text; existing public.payments%ROWTYPE; out public.payments%ROWTYPE;
BEGIN
  IF idem IS NULL OR char_length(idem) < 8 THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023'; END IF;
  SELECT * INTO existing FROM public.payments WHERE user_id = u AND idempotency_key = idem;
  IF FOUND THEN RETURN to_jsonb(existing); END IF;
  IF bid IS NOT NULL THEN
    bt := public.gowayy_booking_table(bid);
    IF bt IS NULL OR NOT public.gowayy_owns_booking(bid) THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = '42501'; END IF;
    EXECUTE format('SELECT total_paise FROM public.%I WHERE id = $1', bt) INTO amount USING bid;
  ELSIF oid IS NOT NULL THEN
    ot := public.gowayy_order_table(oid);
    IF ot IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = '42501'; END IF;
    EXECUTE format('SELECT total_paise FROM public.%I WHERE id = $1 AND user_id = $2', ot) INTO amount USING oid, u;
    IF amount IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  ELSE
    RAISE EXCEPTION 'PAYMENT_TARGET_REQUIRED' USING ERRCODE = '22023';
  END IF;
  method := COALESCE(p_payload->>'method', 'upi');
  IF method NOT IN ('upi','upi_intent','gateway','cash') THEN RAISE EXCEPTION 'INVALID_METHOD' USING ERRCODE = '22023'; END IF;
  IF (p_payload->>'amountPaise')::integer IS NOT NULL AND (p_payload->>'amountPaise')::integer <> amount THEN
    RAISE EXCEPTION 'AMOUNT_MISMATCH: server price is authoritative' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.payments (user_id, booking_id, booking_table, order_id, order_table, method,
    status, amount_paise, provider, idempotency_key)
  VALUES (u, bid, bt, oid, ot, method, 'requires_action', amount,
    COALESCE(public.gowayy_config('payment_provider') #>> '{}', 'sandbox'), idem)
  RETURNING * INTO out;
  IF bid IS NOT NULL THEN EXECUTE format('UPDATE public.%I SET payment_id = $1 WHERE id = $2', bt) USING out.id, bid; END IF;
  IF oid IS NOT NULL THEN EXECUTE format('UPDATE public.%I SET payment_id = $1 WHERE id = $2', ot) USING out.id, oid; END IF;
  PERFORM public.gowayy_audit('payment.init', 'payments', out.id::text, jsonb_build_object('amountPaise', amount, 'method', method));
  RETURN to_jsonb(out);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_init_payment(jsonb) TO authenticated;

-- Only the verified webhook edge function (service role) may call this.
CREATE OR REPLACE FUNCTION public.rpc_webhook_capture(p_event_id text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  p public.payments%ROWTYPE; pid uuid := NULLIF(p_payload->>'paymentId', '')::uuid;
  pref text := p_payload->>'providerReference'; bt text; ot text; owner uuid; service text; rate numeric;
  commission integer; partner uuid; duplicate boolean := false;
BEGIN
  IF p_event_id IS NULL OR char_length(p_event_id) < 4 THEN RAISE EXCEPTION 'EVENT_ID_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF COALESCE((p_payload->>'signatureVerified')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'SIGNATURE_NOT_VERIFIED' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.webhook_events (event_id, provider, payload, signature_verified)
  VALUES (p_event_id, COALESCE(p_payload->>'provider', 'sandbox'), p_payload, true)
  ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO p FROM public.payments WHERE provider_reference = p_event_id;
    RETURN jsonb_build_object('duplicate', true, 'payment', to_jsonb(p));
  END IF;
  IF pid IS NOT NULL THEN SELECT * INTO p FROM public.payments WHERE id = pid FOR UPDATE;
  ELSE SELECT * INTO p FROM public.payments WHERE provider_reference = pref FOR UPDATE; END IF;
  IF p.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF p.status = 'captured' THEN duplicate := true;
  ELSE
    UPDATE public.payments SET status = 'captured', provider_reference = COALESCE(pref, p_event_id), updated_at = now() WHERE id = p.id;
    INSERT INTO public.transactions (payment_id, type, amount_paise, note)
    VALUES (p.id, 'charge', p.amount_paise, 'webhook:' || p_event_id);
    bt := p.booking_table; ot := p.order_table;
    IF bt IS NOT NULL THEN
      EXECUTE format('SELECT user_id, service FROM public.%I WHERE id = $1', bt) INTO owner, service USING p.booking_id;
    ELSIF ot IS NOT NULL THEN
      service := CASE WHEN ot = 'food_orders' THEN 'food' ELSE 'grocery' END;
      EXECUTE format('SELECT user_id FROM public.%I WHERE id = $1', ot) INTO owner USING p.order_id;
    END IF;
    IF service IS NOT NULL THEN
      rate := public.gowayy_commission_rate(service);
      commission := round(p.amount_paise * rate / 100)::integer;
      INSERT INTO public.commissions (payment_id, service, rate_percent, amount_paise) VALUES (p.id, service, rate, commission);
      SELECT c.user_id INTO partner FROM public.partner_claims c
        WHERE c.state = 'verified' AND c.listing_id IN (
          SELECT property_id FROM public.hotel_bookings WHERE id = p.booking_id
          UNION ALL SELECT offering_id FROM public.experience_bookings WHERE id = p.booking_id
          UNION ALL SELECT restaurant_id FROM public.food_orders WHERE id = p.order_id
          UNION ALL SELECT store_id FROM public.grocery_orders WHERE id = p.order_id)
        LIMIT 1;
      IF partner IS NOT NULL THEN
        INSERT INTO public.settlements (partner_id, payment_id, gross_paise, commission_paise, net_paise)
        VALUES (partner, p.id, p.amount_paise, commission, p.amount_paise - commission);
      END IF;
    END IF;
    IF bt IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET status = CASE WHEN status = ''requested'' THEN ''confirmed'' ELSE status END, updated_at = now() WHERE id = $1', bt) USING p.booking_id;
      INSERT INTO public.booking_events (booking_id, booking_table, service, from_status, to_status, actor, note)
      VALUES (p.booking_id, bt, COALESCE(service, 'booking'), 'requested', 'confirmed', 'system', 'Payment captured by verified webhook');
    ELSIF ot IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET status = CASE WHEN status = ''created'' THEN ''accepted'' ELSE status END, updated_at = now() WHERE id = $1', ot) USING p.order_id;
      INSERT INTO public.order_events (order_id, order_table, from_status, to_status, actor)
      VALUES (p.order_id, ot, 'created', 'accepted', 'system');
    END IF;
    PERFORM public.gowayy_notify(p.user_id, 'payment.captured', 'Payment received',
      'Your payment of INR ' || round(p.amount_paise / 100.0, 2) || ' was confirmed.', 'payment:' || p.id || ':captured');
  END IF;
  SELECT * INTO p FROM public.payments WHERE id = p.id;
  RETURN jsonb_build_object('duplicate', duplicate, 'payment', to_jsonb(p));
END $$;
REVOKE ALL ON FUNCTION public.rpc_webhook_capture(text, jsonb) FROM PUBLIC, anon, authenticated;

-- Sandbox-only shortcut, explicitly gated on demo_mode. Production must use the webhook.
CREATE OR REPLACE FUNCTION public.rpc_capture_sandbox_payment(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); p public.payments%ROWTYPE; result jsonb;
BEGIN
  IF NOT public.gowayy_demo_mode() THEN
    RAISE EXCEPTION 'SANDBOX_DISABLED: configure a payment gateway and use the verified webhook' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM public.payments WHERE id = p_id AND user_id = u;
  IF p.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  result := public.rpc_webhook_capture('sandbox-' || gen_random_uuid()::text,
    jsonb_build_object('paymentId', p_id, 'signatureVerified', true, 'providerReference', 'sandbox-' || p_id::text));
  RETURN jsonb_build_object('payment', result->'payment', 'sandbox', true,
    'note', 'DEMO MODE: no real payment was processed. Production requires a verified gateway webhook.');
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_capture_sandbox_payment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_refund_payment(p_id uuid, p_full boolean DEFAULT true, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); p public.payments%ROWTYPE; amt integer; bt text; ot text; owner uuid;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = p_id AND user_id = u FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  IF p.status NOT IN ('captured','partially_refunded') THEN RAISE EXCEPTION 'PAYMENT_NOT_REFUNDABLE' USING ERRCODE = '23514'; END IF;
  amt := CASE WHEN p_full THEN p.amount_paise ELSE round(p.amount_paise / 2.0)::integer END;
  IF EXISTS (SELECT 1 FROM public.refunds WHERE payment_id = p.id AND amount_paise = amt) THEN
    RETURN jsonb_build_object('payment', to_jsonb(p), 'refundPaise', 0, 'duplicate', true);
  END IF;
  INSERT INTO public.refunds (payment_id, amount_paise, reason, provider_reference)
  VALUES (p.id, amt, left(COALESCE(p_reason, ''), 200), 'sandbox-refund-' || gen_random_uuid()::text);
  INSERT INTO public.transactions (payment_id, type, amount_paise, note)
  VALUES (p.id, 'refund', -amt, 'refund:' || p.id::text || ':' || amt::text);
  UPDATE public.payments SET status = CASE WHEN amt >= p.amount_paise THEN 'refunded' ELSE 'partially_refunded' END, updated_at = now() WHERE id = p.id;
  IF p.booking_table IS NOT NULL THEN
    EXECUTE format('UPDATE public.%I SET status = CASE WHEN status = ''cancelled'' THEN ''cancelled'' ELSE ''refunded'' END, updated_at = now() WHERE id = $1', p.booking_table) USING p.booking_id;
    INSERT INTO public.booking_events (booking_id, booking_table, service, to_status, actor, note)
    VALUES (p.booking_id, p.booking_table, 'booking', 'refunded', 'system', 'Refund ' || amt || ' paise');
  ELSIF p.order_table IS NOT NULL THEN
    EXECUTE format('UPDATE public.%I SET status = CASE WHEN status = ''cancelled'' THEN ''cancelled'' ELSE ''refunded'' END, updated_at = now() WHERE id = $1', p.order_table) USING p.order_id;
  END IF;
  PERFORM public.gowayy_notify(u, 'payment.refunded', 'Refund issued',
    'INR ' || round(amt / 100.0, 2) || ' has been refunded.', 'payment:' || p.id || ':refund:' || amt);
  PERFORM public.gowayy_audit('payment.refund', 'payments', p.id::text, jsonb_build_object('amountPaise', amt, 'reason', p_reason));
  SELECT * INTO p FROM public.payments WHERE id = p.id;
  RETURN jsonb_build_object('payment', to_jsonb(p), 'refundPaise', amt);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_refund_payment(uuid, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Cancellation restores real inventory and refunds captured payments.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cancel_booking(p_id uuid, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); tbl text := public.gowayy_booking_table(p_id);
  st text; owner uuid; d date; prop public.hotel_bookings%ROWTYPE; ride public.ride_bookings%ROWTYPE;
  pay public.payments%ROWTYPE;
BEGIN
  IF tbl IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  EXECUTE format('SELECT status, user_id FROM public.%I WHERE id = $1 FOR UPDATE', tbl) INTO st, owner USING p_id;
  IF owner <> u THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF st IN ('completed','cancelled','refunded') THEN RAISE EXCEPTION 'BOOKING_NOT_CANCELLABLE' USING ERRCODE = '23514'; END IF;
  IF tbl = 'hotel_bookings' THEN
    SELECT * INTO prop FROM public.hotel_bookings WHERE id = p_id;
    FOR d IN SELECT generate_series(prop.check_in, prop.check_out - 1, interval '1 day')::date LOOP
      UPDATE public.room_availability SET units_available = units_available + prop.rooms
        WHERE room_id = prop.room_id AND day = d;
    END LOOP;
  ELSIF tbl = 'ride_bookings' THEN
    SELECT * INTO ride FROM public.ride_bookings WHERE id = p_id;
    IF ride.shared_route_id IS NOT NULL THEN
      UPDATE public.shared_taxi_routes SET seats_available = LEAST(seats_total, seats_available + ride.seats), updated_at = now()
        WHERE id = ride.shared_route_id;
    END IF;
  END IF;
  EXECUTE format('UPDATE public.%I SET status = ''cancelled'', updated_at = now() WHERE id = $1', tbl) USING p_id;
  INSERT INTO public.booking_events (booking_id, booking_table, service, from_status, to_status, actor, actor_id, note)
  VALUES (p_id, tbl, 'booking', st, 'cancelled', 'customer', u, p_reason);
  UPDATE public.journey_services SET state = 'cancelled', updated_at = now() WHERE booking_id = p_id;
  SELECT * INTO pay FROM public.payments WHERE booking_id = p_id AND status = 'captured';
  IF FOUND THEN PERFORM public.rpc_refund_payment(pay.id, true, COALESCE(p_reason, 'Booking cancelled')); END IF;
  PERFORM public.gowayy_notify(u, 'booking.cancelled', 'Booking cancelled', 'Your booking has been cancelled.', 'booking:' || p_id || ':cancelled');
  PERFORM public.gowayy_audit('booking.cancel', tbl, p_id::text, jsonb_build_object('reason', p_reason));
  RETURN public.gowayy_booking_json(p_id);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_booking(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_cancel_order(p_id uuid, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); tbl text := public.gowayy_order_table(p_id);
  st text; owner uuid; pay public.payments%ROWTYPE;
BEGIN
  IF tbl IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  EXECUTE format('SELECT status, user_id FROM public.%I WHERE id = $1 FOR UPDATE', tbl) INTO st, owner USING p_id;
  IF owner <> u THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF st IN ('delivered','cancelled','refunded') THEN RAISE EXCEPTION 'ORDER_NOT_CANCELLABLE' USING ERRCODE = '23514'; END IF;
  IF tbl = 'grocery_orders' THEN
    UPDATE public.grocery_inventory i SET stock = i.stock + oi.quantity, updated_at = now()
    FROM public.grocery_order_items oi JOIN public.grocery_orders o ON o.id = oi.order_id
    WHERE oi.order_id = p_id AND i.product_id = oi.product_id AND i.store_id = o.store_id;
  END IF;
  EXECUTE format('UPDATE public.%I SET status = ''cancelled'', updated_at = now() WHERE id = $1', tbl) USING p_id;
  INSERT INTO public.order_events (order_id, order_table, from_status, to_status, actor, actor_id)
  VALUES (p_id, tbl, st, 'cancelled', 'customer', u);
  UPDATE public.journey_services SET state = 'cancelled', updated_at = now() WHERE order_id = p_id;
  SELECT * INTO pay FROM public.payments WHERE order_id = p_id AND status = 'captured';
  IF FOUND THEN PERFORM public.rpc_refund_payment(pay.id, true, COALESCE(p_reason, 'Order cancelled')); END IF;
  PERFORM public.gowayy_notify(u, 'order.cancelled', 'Order cancelled', 'Your order has been cancelled.', 'order:' || p_id || ':cancelled');
  RETURN public.gowayy_order_json(p_id);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_order(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_notifications_read(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user();
BEGIN
  UPDATE public.notifications SET read_at = now() WHERE id = p_id AND user_id = u AND read_at IS NULL;
  RETURN jsonb_build_object('read', true, 'id', p_id);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_notifications_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_notifications_read_all()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); n integer;
BEGIN
  UPDATE public.notifications SET read_at = now() WHERE user_id = u AND read_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('read', true, 'updated', n);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_notifications_read_all() TO authenticated;

-- ---------------------------------------------------------------------------
-- Development OTP adapter. Never claims to send real email; production uses a
-- configured email provider through the auth-otp-send edge function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gowayy_hash_code(p_code text, p_salt text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256((p_code || ':' || p_salt)::bytea), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.rpc_register(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE rid uuid; code text; v_email text := lower(btrim(COALESCE(p_payload->>'email', '')));
  demo boolean := public.gowayy_demo_mode(); expires timestamptz := now() + interval '10 minutes';
BEGIN
  PERFORM public.gowayy_rate_limit('otp:' || v_email, 5, 600);
  IF EXISTS (SELECT 1 FROM public.profiles p JOIN auth.users au ON au.id = p.id WHERE lower(au.email) = v_email AND p.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'EMAIL_EXISTS' USING ERRCODE = '23505';
  END IF;
  code := lpad(floor(random() * 1000000)::integer::text, 6, '0');
  INSERT INTO public.registration_otps (email, first_name, last_name, auth_user_id, code_hash, demo_mode, expires_at, resend_after)
  VALUES (v_email, COALESCE(p_payload->>'firstName', ''), COALESCE(p_payload->>'lastName', ''),
          NULLIF(p_payload->>'authUserId', '')::uuid, '', demo, expires, now() + interval '30 seconds')
  RETURNING id INTO rid;
  UPDATE public.registration_otps SET code_hash = public.gowayy_hash_code(code, rid::text) WHERE id = rid;
  PERFORM public.gowayy_audit('auth.register', 'registration_otps', rid::text, jsonb_build_object('demoMode', demo));
  RETURN jsonb_build_object(
    'registrationId', rid, 'otpRequired', true, 'expiresAt', expires, 'resendAfterSeconds', 30,
    'demoMode', demo, 'demoOtp', CASE WHEN demo THEN code ELSE NULL END,
    'demoNotice', CASE WHEN demo
      THEN 'DEMO OTP ADAPTER — no email was sent. This is not real email verification. Configure an email provider for production.'
      ELSE 'A verification code was sent by the configured email provider.' END,
    'mode', COALESCE(public.gowayy_config('otp_mode') #>> '{}', 'demo'));
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_register(jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_resend_otp(p_registration_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.registration_otps%ROWTYPE; code text; demo boolean := public.gowayy_demo_mode();
BEGIN
  SELECT * INTO r FROM public.registration_otps WHERE id = p_registration_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'REGISTRATION_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF r.resend_after > now() THEN RAISE EXCEPTION 'RESEND_TOO_SOON' USING ERRCODE = '42901'; END IF;
  PERFORM public.gowayy_rate_limit('otp-resend:' || r.email, 3, 600);
  code := lpad(floor(random() * 1000000)::integer::text, 6, '0');
  UPDATE public.registration_otps SET code_hash = public.gowayy_hash_code(code, r.id::text),
    expires_at = now() + interval '10 minutes', resend_after = now() + interval '30 seconds', attempts = 0
    WHERE id = r.id;
  RETURN jsonb_build_object('registrationId', r.id, 'otpRequired', true, 'expiresAt', now() + interval '10 minutes',
    'resendAfterSeconds', 30, 'email', r.email, 'demoMode', demo, 'demoOtp', CASE WHEN demo THEN code ELSE NULL END,
    'demoNotice', CASE WHEN demo THEN 'DEMO OTP ADAPTER — no email was sent.' ELSE 'Check your email.' END);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_resend_otp(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_verify_otp(p_registration_id uuid, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.registration_otps%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.registration_otps WHERE id = p_registration_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'REGISTRATION_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  PERFORM public.gowayy_rate_limit('otp-verify:' || r.id::text, 8, 600);
  IF r.verified_at IS NOT NULL THEN
    RETURN jsonb_build_object('verified', true, 'registrationId', r.id, 'authUserId', r.auth_user_id,
      'email', r.email, 'firstName', r.first_name, 'lastName', r.last_name);
  END IF;
  IF r.expires_at < now() THEN
    RETURN jsonb_build_object('verified', false, 'error', 'OTP_EXPIRED', 'message', 'This code has expired. Request a new one.', 'attemptsRemaining', 0);
  END IF;
  IF r.code_hash <> public.gowayy_hash_code(COALESCE(p_code, ''), r.id::text) THEN
    UPDATE public.registration_otps SET attempts = attempts + 1 WHERE id = r.id;
    RETURN jsonb_build_object('verified', false, 'error', 'INCORRECT_OTP', 'message', 'That code is incorrect.',
      'attemptsRemaining', GREATEST(0, 9 - r.attempts));
  END IF;
  UPDATE public.registration_otps SET verified_at = now() WHERE id = r.id;
  PERFORM public.gowayy_audit('auth.otp.verify', 'registration_otps', r.id::text, jsonb_build_object('demoMode', r.demo_mode));
  RETURN jsonb_build_object('verified', true, 'registrationId', r.id, 'authUserId', r.auth_user_id,
    'email', r.email, 'firstName', r.first_name, 'lastName', r.last_name);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_verify_otp(uuid, text) TO anon, authenticated;

-- Called by the edge function with the service-role key after Supabase Auth confirms
-- the user. Never exposed to anonymous or authenticated clients.
CREATE OR REPLACE FUNCTION public.rpc_finalize_registration(p_registration_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.registration_otps%ROWTYPE; uid uuid;
BEGIN
  SELECT * INTO r FROM public.registration_otps WHERE id = p_registration_id FOR UPDATE;
  IF r.id IS NULL OR r.verified_at IS NULL OR r.auth_user_id IS NULL THEN
    RAISE EXCEPTION 'REGISTRATION_NOT_VERIFIED' USING ERRCODE = '42501';
  END IF;
  uid := r.auth_user_id;
  INSERT INTO public.profiles (id, first_name, last_name) VALUES (uid, r.first_name, r.last_name)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'customer') ON CONFLICT DO NOTHING;
  PERFORM public.gowayy_notify(uid, 'welcome', 'Welcome to GOWAYY', 'Your account is ready. Start a connected journey.', 'welcome:' || uid::text);
  PERFORM public.gowayy_audit('auth.finalize', 'profiles', uid::text, '{}'::jsonb);
  RETURN jsonb_build_object('userId', uid, 'firstName', r.first_name, 'lastName', r.last_name);
END $$;
REVOKE ALL ON FUNCTION public.rpc_finalize_registration(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_forgot_password(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_email text := lower(btrim(COALESCE(p_email, ''))); rid uuid; code text;
  uid uuid; demo boolean := public.gowayy_demo_mode();
BEGIN
  PERFORM public.gowayy_rate_limit('forgot:' || v_email, 5, 600);
  SELECT au.id INTO uid FROM auth.users au WHERE lower(au.email) = v_email;
  code := lpad(floor(random() * 1000000)::integer::text, 6, '0');
  INSERT INTO public.password_resets (user_id, email, code_hash, demo_mode, expires_at)
  VALUES (uid, v_email, '', demo, now() + interval '15 minutes') RETURNING id INTO rid;
  UPDATE public.password_resets SET code_hash = public.gowayy_hash_code(code, rid::text) WHERE id = rid;
  RETURN jsonb_build_object('accepted', true, 'resetId', rid, 'demoCode', CASE WHEN demo THEN code ELSE NULL END,
    'demoNotice', CASE WHEN demo THEN 'DEMO RESET ADAPTER — no email was sent.' ELSE 'A reset code was sent to your email.' END);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_forgot_password(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_verify_reset(p_reset_id uuid, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.password_resets%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.password_resets WHERE id = p_reset_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'RESET_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  PERFORM public.gowayy_rate_limit('reset:' || r.id::text, 8, 900);
  IF r.used_at IS NOT NULL OR r.expires_at < now() THEN RAISE EXCEPTION 'RESET_EXPIRED' USING ERRCODE = '23514'; END IF;
  IF r.code_hash <> public.gowayy_hash_code(COALESCE(p_code, ''), r.id::text) THEN
    RAISE EXCEPTION 'INCORRECT_RESET_CODE' USING ERRCODE = '23514';
  END IF;
  UPDATE public.password_resets SET used_at = now() WHERE id = r.id;
  RETURN jsonb_build_object('verified', true, 'authUserId', r.user_id, 'email', r.email);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_verify_reset(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_delete_account()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user();
BEGIN
  UPDATE public.profiles SET deleted_at = now(), first_name = 'Deleted', last_name = 'Account', phone = NULL WHERE id = u;
  UPDATE public.journeys SET active = false WHERE user_id = u;
  PERFORM public.gowayy_audit('account.delete', 'profiles', u::text, '{}'::jsonb);
  RETURN jsonb_build_object('deleted', true, 'note', 'Profile anonymised. The edge function deletes the Supabase Auth user.');
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_delete_account() TO authenticated;

-- ---------------------------------------------------------------------------
-- Partner mode (role-specific sections; no admin role or admin table exists).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_claim_partner(p_role text, p_listing_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); ok boolean; state text;
BEGIN
  IF p_role NOT IN ('restaurant','grocery','property') THEN RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM (
      SELECT id FROM public.restaurants WHERE p_role = 'restaurant'
      UNION ALL SELECT id FROM public.grocery_stores WHERE p_role = 'grocery'
      UNION ALL SELECT id FROM public.properties WHERE p_role = 'property'
    ) x WHERE x.id = p_listing_id) INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'LISTING_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  state := CASE WHEN public.gowayy_demo_mode() THEN 'verified' ELSE 'pending' END;
  INSERT INTO public.partner_claims (user_id, role, listing_id, state, verified_at)
  VALUES (u, p_role, p_listing_id, state, CASE WHEN state = 'verified' THEN now() ELSE NULL END)
  ON CONFLICT (user_id, role, listing_id) DO UPDATE SET state = EXCLUDED.state, verified_at = EXCLUDED.verified_at;
  INSERT INTO public.user_roles (user_id, role) VALUES (u, p_role) ON CONFLICT DO NOTHING;
  PERFORM public.gowayy_audit('partner.claim', 'partner_claims', p_listing_id,
    jsonb_build_object('role', p_role, 'demoAutoVerified', public.gowayy_demo_mode()));
  RETURN jsonb_build_object('role', p_role, 'listingId', p_listing_id, 'state', state,
    'demoNotice', CASE WHEN state = 'verified' THEN 'DEMO: claim auto-verified for local testing. Production requires document verification.' ELSE 'Verification pending.' END);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_claim_partner(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_register_driver(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); d public.drivers%ROWTYPE; doc jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.drivers WHERE user_id = u AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'DRIVER_EXISTS' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.drivers (user_id, phone, email, photograph_path, verification)
  VALUES (u, p_payload->>'phone', COALESCE(p_payload->>'email', ''), p_payload->>'photographPath', 'pending')
  RETURNING * INTO d;
  FOR doc IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'documents', '[]'::jsonb)) LOOP
    INSERT INTO public.driver_documents (driver_id, document_type, storage_path, document_number, state)
    VALUES (d.id, COALESCE(doc->>'type', 'other'), COALESCE(doc->>'path', ''), doc->>'number', 'pending');
  END LOOP;
  IF p_payload->'vehicle' IS NOT NULL THEN
    INSERT INTO public.driver_vehicles (driver_id, vehicle_class, registration, make, model, seats, permit_path)
    VALUES (d.id, COALESCE(p_payload->'vehicle'->>'class', 'hatchback'),
      COALESCE(p_payload->'vehicle'->>'registration', ''), p_payload->'vehicle'->>'make',
      p_payload->'vehicle'->>'model', GREATEST(1, COALESCE((p_payload->'vehicle'->>'seats')::integer, 4)),
      p_payload->'vehicle'->>'permitPath');
  END IF;
  INSERT INTO public.driver_services (driver_id, service, eligible)
  VALUES (d.id, 'passenger_ride', true), (d.id, 'food_delivery', true),
         (d.id, 'grocery_delivery', true), (d.id, 'parcel_delivery', true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.driver_availability (driver_id, online) VALUES (d.id, false) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (u, 'driver') ON CONFLICT DO NOTHING;
  PERFORM public.gowayy_audit('driver.register', 'drivers', d.id::text, '{}'::jsonb);
  RETURN to_jsonb(d);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_register_driver(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_update_driver(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); d public.drivers%ROWTYPE; svc jsonb;
BEGIN
  SELECT * INTO d FROM public.drivers WHERE user_id = u FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'DRIVER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF (p_payload->>'online')::boolean IS TRUE AND d.verification <> 'verified' THEN
    RAISE EXCEPTION 'NOT_VERIFIED: documents must be verified before going online' USING ERRCODE = '42501';
  END IF;
  UPDATE public.drivers SET online = COALESCE((p_payload->>'online')::boolean, online), updated_at = now() WHERE id = d.id;
  UPDATE public.driver_availability SET online = COALESCE((p_payload->>'online')::boolean, online),
    service_modes = ARRAY(SELECT s.service FROM public.driver_services s WHERE s.driver_id = d.id AND s.enabled), updated_at = now()
    WHERE driver_id = d.id;
  FOR svc IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'services', '[]'::jsonb)) LOOP
    UPDATE public.driver_services SET enabled = COALESCE((svc->>'enabled')::boolean, false)
      WHERE driver_id = d.id AND service = svc->>'service' AND eligible;
  END LOOP;
  SELECT * INTO d FROM public.drivers WHERE id = d.id;
  RETURN to_jsonb(d);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_update_driver(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_verify_driver_demo()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); d public.drivers%ROWTYPE;
BEGIN
  IF NOT public.gowayy_demo_mode() THEN RAISE EXCEPTION 'DEMO_DISABLED' USING ERRCODE = '42501'; END IF;
  UPDATE public.drivers SET verification = 'verified', updated_at = now() WHERE user_id = u RETURNING * INTO d;
  IF d.id IS NULL THEN RAISE EXCEPTION 'DRIVER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  UPDATE public.driver_documents SET state = 'verified', reviewed_at = now()
    WHERE driver_id = d.id;
  PERFORM public.gowayy_audit('driver.demo-verify', 'drivers', d.id::text, '{}'::jsonb);
  RETURN jsonb_build_object('driver', to_jsonb(d),
    'demoNotice', 'DEMO VERIFICATION: no documents were checked. Production requires real verification.');
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_verify_driver_demo() TO authenticated;

-- Configurable dispatch: jobs are only offered when the driver is verified, online,
-- eligible for that service, and has no active incompatible task.
CREATE OR REPLACE FUNCTION public.rpc_dispatch_jobs()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); d public.drivers%ROWTYPE; jobs jsonb := '[]'::jsonb; exclusive boolean;
BEGIN
  SELECT * INTO d FROM public.drivers WHERE user_id = u AND deleted_at IS NULL;
  IF d.id IS NULL THEN RETURN jsonb_build_object('items', '[]'::jsonb, 'driver', NULL, 'reason', 'NO_DRIVER_PROFILE'); END IF;
  exclusive := COALESCE((public.gowayy_config('dispatch_exclusive'))::text::boolean, true);
  IF NOT d.online OR d.verification <> 'verified' OR (exclusive AND d.active_task IS NOT NULL) THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'driver', to_jsonb(d), 'reason', 'NOT_AVAILABLE');
  END IF;
  SELECT COALESCE(jsonb_agg(j), '[]'::jsonb) INTO jobs FROM (
    SELECT jsonb_build_object('id', b.id, 'type', 'passenger_ride', 'service', 'cab', 'title', b.title,
      'reference', b.reference, 'amountPaise', b.total_paise) j
      FROM public.ride_bookings b
      WHERE b.status IN ('confirmed','assigned') AND b.service = 'cab'
        AND EXISTS (SELECT 1 FROM public.driver_services s WHERE s.driver_id = d.id AND s.service = 'passenger_ride' AND s.enabled AND s.eligible)
        AND NOT EXISTS (SELECT 1 FROM public.ride_assignments a WHERE a.booking_id = b.id AND a.state = 'accepted')
    UNION ALL
    SELECT jsonb_build_object('id', o.id, 'type', 'food_delivery', 'service', 'food', 'title', o.reference,
      'amountPaise', o.total_paise)
      FROM public.food_orders o
      WHERE o.status IN ('accepted','preparing','packed')
        AND EXISTS (SELECT 1 FROM public.driver_services s WHERE s.driver_id = d.id AND s.service = 'food_delivery' AND s.enabled AND s.eligible)
    UNION ALL
    SELECT jsonb_build_object('id', o.id, 'type', 'grocery_delivery', 'service', 'grocery', 'title', o.reference,
      'amountPaise', o.total_paise)
      FROM public.grocery_orders o
      WHERE o.status IN ('accepted','preparing','packed')
        AND EXISTS (SELECT 1 FROM public.driver_services s WHERE s.driver_id = d.id AND s.service = 'grocery_delivery' AND s.enabled AND s.eligible)
    UNION ALL
    SELECT jsonb_build_object('id', b.id, 'type', 'parcel_delivery', 'service', 'parcel', 'title', b.title,
      'amountPaise', b.total_paise)
      FROM public.parcel_bookings b
      WHERE b.status = 'confirmed'
        AND EXISTS (SELECT 1 FROM public.driver_services s WHERE s.driver_id = d.id AND s.service = 'parcel_delivery' AND s.enabled AND s.eligible)
  ) x;
  RETURN jsonb_build_object('items', jobs, 'driver', to_jsonb(d), 'rules',
    (SELECT jsonb_object_agg(key, value) FROM public.dispatch_rules));
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_dispatch_jobs() TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_accept_job(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); d public.drivers%ROWTYPE; tbl text; service text;
  job_type text; st text; owner uuid; v_eligible boolean;
BEGIN
  SELECT * INTO d FROM public.drivers WHERE user_id = u AND deleted_at IS NULL FOR UPDATE;
  IF d.id IS NULL OR d.verification <> 'verified' OR NOT d.online THEN
    RAISE EXCEPTION 'DRIVER_NOT_ELIGIBLE' USING ERRCODE = '42501';
  END IF;
  IF d.active_task IS NOT NULL THEN
    RAISE EXCEPTION 'ACTIVE_TASK_CONFLICT: finish the current task before accepting another' USING ERRCODE = '23514';
  END IF;
  tbl := COALESCE(public.gowayy_booking_table(p_job_id), public.gowayy_order_table(p_job_id));
  IF tbl IS NULL THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  job_type := CASE tbl
    WHEN 'ride_bookings' THEN 'passenger_ride'
    WHEN 'food_orders' THEN 'food_delivery'
    WHEN 'grocery_orders' THEN 'grocery_delivery'
    WHEN 'parcel_bookings' THEN 'parcel_delivery'
    ELSE NULL END;
  IF job_type IS NULL THEN RAISE EXCEPTION 'JOB_NOT_DISPATCHABLE' USING ERRCODE = '22023'; END IF;
  SELECT ds.enabled AND ds.eligible INTO v_eligible FROM public.driver_services ds WHERE ds.driver_id = d.id AND ds.service = job_type;
  IF NOT COALESCE(v_eligible, false) THEN RAISE EXCEPTION 'SERVICE_NOT_ENABLED' USING ERRCODE = '42501'; END IF;
  IF job_type = 'passenger_ride' THEN
    SELECT status, user_id INTO st, owner FROM public.ride_bookings WHERE id = p_job_id FOR UPDATE;
    IF st NOT IN ('confirmed','assigned') THEN RAISE EXCEPTION 'JOB_UNAVAILABLE' USING ERRCODE = '23514'; END IF;
    INSERT INTO public.ride_assignments (booking_id, driver_id, state, accepted_at, expires_at)
    VALUES (p_job_id, d.id, 'accepted', now(), now() + interval '2 hours')
    ON CONFLICT (booking_id) DO UPDATE SET driver_id = EXCLUDED.driver_id, state = 'accepted', accepted_at = now();
    UPDATE public.ride_bookings SET status = 'assigned', updated_at = now() WHERE id = p_job_id;
    INSERT INTO public.booking_events (booking_id, booking_table, service, from_status, to_status, actor, actor_id)
    VALUES (p_job_id, 'ride_bookings', 'cab', st, 'assigned', 'driver', u);
  ELSE
    EXECUTE format('SELECT status, user_id FROM public.%I WHERE id = $1 FOR UPDATE', tbl) INTO st, owner USING p_job_id;
    IF st NOT IN ('accepted','preparing','packed','confirmed') THEN RAISE EXCEPTION 'JOB_UNAVAILABLE' USING ERRCODE = '23514'; END IF;
  END IF;
  UPDATE public.drivers SET active_task = job_type, active_task_id = p_job_id, updated_at = now() WHERE id = d.id;
  IF owner IS NOT NULL THEN
    PERFORM public.gowayy_notify(owner, 'driver.assigned', 'Partner assigned',
      'A delivery or ride partner has accepted your task.', 'job:' || p_job_id || ':assigned');
  END IF;
  PERFORM public.gowayy_audit('dispatch.accept', tbl, p_job_id::text, jsonb_build_object('jobType', job_type));
  RETURN jsonb_build_object('job', jsonb_build_object('id', p_job_id, 'type', job_type, 'state', 'accepted'),
    'driver', to_jsonb(d));
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_accept_job(uuid) TO authenticated;
