-- Address vocabulary shared by HTTP, Customer web and Supabase, plus honest
-- marketplace capture and provider-confirmed refund lifecycle.

ALTER TABLE public.user_addresses ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.user_addresses ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.user_addresses ADD COLUMN IF NOT EXISTS alt_phone text;
ALTER TABLE public.user_addresses ADD COLUMN IF NOT EXISTS area text;
ALTER TABLE public.user_addresses ADD COLUMN IF NOT EXISTS landmark text;
ALTER TABLE public.user_addresses ADD COLUMN IF NOT EXISTS house text;
ALTER TABLE public.user_addresses ADD COLUMN IF NOT EXISTS building text;
ALTER TABLE public.user_addresses ADD COLUMN IF NOT EXISTS road text;

CREATE OR REPLACE FUNCTION public.gowayy_address_json(a public.user_addresses)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', a.id, 'userId', a.user_id, 'label', a.label, 'name', a.name,
    'phone', a.phone, 'altPhone', a.alt_phone, 'line', a.line1, 'line1', a.line1,
    'line2', a.line2, 'house', a.house, 'building', a.building, 'road', a.road,
    'area', a.area, 'landmark', a.landmark, 'city', a.city, 'state', a.state,
    'pincode', a.postal_code, 'postalCode', a.postal_code, 'lat', a.lat, 'lng', a.lng,
    'isDefault', a.is_default, 'createdAt', a.created_at, 'updatedAt', a.updated_at)
$$;

CREATE OR REPLACE FUNCTION public.rpc_addresses()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := public.gowayy_require_user(); BEGIN
  RETURN COALESCE((SELECT jsonb_agg(public.gowayy_address_json(a) ORDER BY a.is_default DESC, a.created_at DESC)
    FROM public.user_addresses a WHERE a.user_id = v_user AND a.deleted_at IS NULL), '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_addresses() TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_address_create(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.gowayy_require_user(); v_line text := left(btrim(COALESCE(p_payload->>'line', p_payload->>'line1', '')), 300);
  v_pincode text := NULLIF(btrim(COALESCE(p_payload->>'pincode', p_payload->>'postalCode', '')), '');
  v_phone text := NULLIF(btrim(COALESCE(p_payload->>'phone', '')), ''); v_row public.user_addresses%ROWTYPE;
BEGIN
  IF char_length(v_line) < 5 OR btrim(COALESCE(p_payload->>'city', '')) = '' THEN RAISE EXCEPTION 'INVALID_ADDRESS' USING ERRCODE = '22023'; END IF;
  IF v_pincode IS NOT NULL AND v_pincode !~ '^\d{6}$' THEN RAISE EXCEPTION 'INVALID_PINCODE' USING ERRCODE = '22023'; END IF;
  IF v_phone IS NOT NULL AND v_phone !~ '^\d{10}$' THEN RAISE EXCEPTION 'INVALID_PHONE' USING ERRCODE = '22023'; END IF;
  IF COALESCE((p_payload->>'isDefault')::boolean, false) THEN UPDATE public.user_addresses SET is_default = false WHERE user_id = v_user AND is_default; END IF;
  INSERT INTO public.user_addresses (user_id, label, name, phone, alt_phone, line1, line2, house, building, road,
    area, landmark, city, state, postal_code, lat, lng, is_default)
  VALUES (v_user, left(COALESCE(NULLIF(p_payload->>'label', ''), 'Home'), 60), NULLIF(p_payload->>'name', ''), v_phone,
    NULLIF(p_payload->>'altPhone', ''), v_line, NULLIF(p_payload->>'line2', ''), NULLIF(p_payload->>'house', ''),
    NULLIF(p_payload->>'building', ''), NULLIF(p_payload->>'road', ''), NULLIF(p_payload->>'area', ''),
    NULLIF(p_payload->>'landmark', ''), left(btrim(p_payload->>'city'), 100), left(COALESCE(NULLIF(p_payload->>'state', ''), 'West Bengal'), 100),
    v_pincode, NULLIF(p_payload->>'lat', '')::double precision, NULLIF(p_payload->>'lng', '')::double precision,
    COALESCE((p_payload->>'isDefault')::boolean, NOT EXISTS (SELECT 1 FROM public.user_addresses a WHERE a.user_id = v_user AND a.deleted_at IS NULL)))
  RETURNING * INTO v_row;
  RETURN public.gowayy_address_json(v_row);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_address_create(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_update_address(p_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := public.gowayy_require_user(); v_row public.user_addresses%ROWTYPE; v_line text; v_pincode text; BEGIN
  SELECT * INTO v_row FROM public.user_addresses WHERE id = p_id AND user_id = v_user AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADDRESS_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  v_line := left(btrim(COALESCE(p_payload->>'line', p_payload->>'line1', v_row.line1)), 300);
  v_pincode := COALESCE(NULLIF(btrim(COALESCE(p_payload->>'pincode', p_payload->>'postalCode', '')), ''), v_row.postal_code);
  IF char_length(v_line) < 5 OR (v_pincode IS NOT NULL AND v_pincode !~ '^\d{6}$') THEN RAISE EXCEPTION 'INVALID_ADDRESS' USING ERRCODE = '22023'; END IF;
  IF COALESCE((p_payload->>'isDefault')::boolean, false) THEN UPDATE public.user_addresses SET is_default = false WHERE user_id = v_user AND id <> p_id AND is_default; END IF;
  UPDATE public.user_addresses a SET label = left(COALESCE(NULLIF(p_payload->>'label', ''), a.label), 60),
    name = COALESCE(p_payload->>'name', a.name), phone = COALESCE(p_payload->>'phone', a.phone), alt_phone = COALESCE(p_payload->>'altPhone', a.alt_phone),
    line1 = v_line, line2 = COALESCE(p_payload->>'line2', a.line2), house = COALESCE(p_payload->>'house', a.house),
    building = COALESCE(p_payload->>'building', a.building), road = COALESCE(p_payload->>'road', a.road), area = COALESCE(p_payload->>'area', a.area),
    landmark = COALESCE(p_payload->>'landmark', a.landmark), city = left(COALESCE(NULLIF(p_payload->>'city', ''), a.city), 100),
    state = left(COALESCE(NULLIF(p_payload->>'state', ''), a.state), 100), postal_code = v_pincode,
    is_default = COALESCE((p_payload->>'isDefault')::boolean, a.is_default), updated_at = now()
  WHERE a.id = p_id RETURNING * INTO v_row;
  RETURN jsonb_build_object('address', public.gowayy_address_json(v_row));
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_update_address(uuid, jsonb) TO authenticated;

ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.food_orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.grocery_orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_orders_payment_status_check') THEN
    ALTER TABLE public.marketplace_orders ADD CONSTRAINT marketplace_orders_payment_status_check CHECK (payment_status IN ('pending','requires_action','processing','captured','failed','refunded','partially_refunded','cod_due'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_orders_payment_status_check') THEN
    ALTER TABLE public.food_orders ADD CONSTRAINT food_orders_payment_status_check CHECK (payment_status IN ('pending','requires_action','processing','captured','failed','refunded','partially_refunded','cod_due'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grocery_orders_payment_status_check') THEN
    ALTER TABLE public.grocery_orders ADD CONSTRAINT grocery_orders_payment_status_check CHECK (payment_status IN ('pending','requires_action','processing','captured','failed','refunded','partially_refunded','cod_due'));
  END IF;
END $$;

ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_status_check') THEN
    ALTER TABLE public.refunds ADD CONSTRAINT refunds_status_check CHECK (status IN ('pending','succeeded','failed'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.gowayy_request_refund(p_payment_id uuid, p_full boolean, p_reason text, p_requested_by uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_payment public.payments%ROWTYPE; v_amount integer; v_refund public.refunds%ROWTYPE; v_refunded integer; BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF v_payment.id IS NULL OR v_payment.status NOT IN ('captured','partially_refunded') THEN RAISE EXCEPTION 'PAYMENT_NOT_REFUNDABLE' USING ERRCODE = '23514'; END IF;
  SELECT COALESCE(sum(amount_paise), 0) INTO v_refunded FROM public.refunds WHERE payment_id = p_payment_id AND status <> 'failed';
  v_amount := CASE WHEN p_full THEN v_payment.amount_paise - v_refunded ELSE least(round(v_payment.amount_paise / 2.0)::integer, v_payment.amount_paise - v_refunded) END;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'PAYMENT_ALREADY_REFUNDED' USING ERRCODE = '23514'; END IF;
  SELECT * INTO v_refund FROM public.refunds WHERE payment_id = p_payment_id AND amount_paise = v_amount AND status = 'pending' ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.refunds (payment_id, amount_paise, reason, requested_by, status)
    VALUES (p_payment_id, v_amount, left(COALESCE(p_reason, ''), 200), p_requested_by, 'pending') RETURNING * INTO v_refund;
  END IF;
  PERFORM public.gowayy_audit('payment.refund.requested', 'refunds', v_refund.id::text, jsonb_build_object('amountPaise', v_refund.amount_paise));
  RETURN jsonb_build_object('payment', to_jsonb(v_payment), 'refund', to_jsonb(v_refund), 'refundPaise', v_refund.amount_paise, 'pending', true);
END $$;
REVOKE ALL ON FUNCTION public.gowayy_request_refund(uuid, boolean, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_refund_payment(p_id uuid, p_full boolean DEFAULT true, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := public.gowayy_require_user(); BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.id = p_id AND p.user_id = v_user) THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  RETURN public.gowayy_request_refund(p_id, p_full, p_reason, v_user);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_refund_payment(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_admin_refund_payment(p_id uuid, p_full boolean DEFAULT true, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_admin uuid := public.gowayy_admin_id(); BEGIN RETURN public.gowayy_request_refund(p_id, p_full, p_reason, v_admin); END $$;
REVOKE ALL ON FUNCTION public.rpc_admin_refund_payment(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_refund_payment(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gowayy_complete_refund(p_refund_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_refund public.refunds%ROWTYPE; v_payment public.payments%ROWTYPE; v_total integer; v_full boolean; BEGIN
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
  IF v_full AND v_payment.order_table IS NOT NULL THEN
    EXECUTE format('UPDATE public.%I SET status = ''refunded'', updated_at = now() WHERE id = $1', v_payment.order_table) USING v_payment.order_id;
  ELSIF v_full AND v_payment.booking_table IS NOT NULL THEN
    EXECUTE format('UPDATE public.%I SET status = ''refunded'', updated_at = now() WHERE id = $1', v_payment.booking_table) USING v_payment.booking_id;
  END IF;
  PERFORM public.gowayy_notify(v_payment.user_id, 'payment.refunded', 'Refund confirmed',
    'INR ' || round(v_refund.amount_paise / 100.0, 2) || ' has been refunded by the payment provider.', 'refund:' || p_refund_id::text);
END $$;
REVOKE ALL ON FUNCTION public.gowayy_complete_refund(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_attach_payment_provider(p_payment_id uuid, p_reference text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_reference !~ '^order_[A-Za-z0-9]+$' THEN RAISE EXCEPTION 'INVALID_PROVIDER_ORDER' USING ERRCODE = '22023'; END IF;
  UPDATE public.payments SET provider_reference = p_reference, updated_at = now() WHERE id = p_payment_id AND status = 'requires_action';
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_ATTACHABLE' USING ERRCODE = '23514'; END IF;
  RETURN jsonb_build_object('payment', (SELECT to_jsonb(p) FROM public.payments p WHERE p.id = p_payment_id), 'providerPayload', p_payload);
END $$;
REVOKE ALL ON FUNCTION public.rpc_attach_payment_provider(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_provider_refund_update(p_refund_id uuid, p_reference text, p_status text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_status NOT IN ('pending','processed','succeeded','failed') THEN RAISE EXCEPTION 'INVALID_REFUND_STATUS' USING ERRCODE = '22023'; END IF;
  UPDATE public.refunds SET provider_reference = COALESCE(NULLIF(p_reference, ''), provider_reference), provider_payload = p_payload,
    status = CASE WHEN p_status = 'failed' THEN 'failed' ELSE status END, updated_at = now() WHERE id = p_refund_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'REFUND_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF p_status IN ('processed','succeeded') THEN PERFORM public.gowayy_complete_refund(p_refund_id); END IF;
  RETURN jsonb_build_object('refund', (SELECT to_jsonb(r) FROM public.refunds r WHERE r.id = p_refund_id),
    'payment', (SELECT to_jsonb(p) FROM public.payments p JOIN public.refunds r ON r.payment_id = p.id WHERE r.id = p_refund_id));
END $$;
REVOKE ALL ON FUNCTION public.rpc_provider_refund_update(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_webhook_capture(p_event_id text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_pay public.payments%ROWTYPE; v_id uuid := NULLIF(p_payload->>'paymentId', '')::uuid;
  v_reference text := NULLIF(p_payload->>'providerReference', ''); v_order_reference text := NULLIF(p_payload->>'providerOrderId', '');
  v_table text; v_owner uuid; v_service text; v_rate numeric; v_commission integer; v_partner uuid;
  v_store text; v_net integer; v_duplicate boolean := false; v_old_status text;
BEGIN
  IF p_event_id IS NULL OR char_length(p_event_id) < 4 THEN RAISE EXCEPTION 'EVENT_ID_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF COALESCE((p_payload->>'signatureVerified')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'SIGNATURE_NOT_VERIFIED' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.webhook_events (event_id, provider, payload, signature_verified)
  VALUES (p_event_id, COALESCE(p_payload->>'provider', 'sandbox'), p_payload, true) ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('duplicate', true); END IF;
  IF v_id IS NOT NULL THEN SELECT * INTO v_pay FROM public.payments WHERE id = v_id FOR UPDATE;
  ELSE SELECT * INTO v_pay FROM public.payments WHERE provider_reference = COALESCE(v_order_reference, v_reference) FOR UPDATE; END IF;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF v_pay.status = 'captured' THEN v_duplicate := true; ELSE
    UPDATE public.payments SET status = 'captured', provider_reference = COALESCE(v_reference, provider_reference), updated_at = now() WHERE id = v_pay.id;
    INSERT INTO public.transactions (payment_id, type, amount_paise, note) VALUES (v_pay.id, 'charge', v_pay.amount_paise, 'webhook:' || p_event_id);
    v_table := COALESCE(v_pay.booking_table, v_pay.order_table);
    IF v_pay.booking_table IS NOT NULL THEN
      EXECUTE format('SELECT user_id, service, status FROM public.%I WHERE id = $1', v_pay.booking_table) INTO v_owner, v_service, v_old_status USING v_pay.booking_id;
      EXECUTE format('UPDATE public.%I SET status = CASE WHEN status = ''requested'' THEN ''confirmed'' ELSE status END, updated_at = now() WHERE id = $1', v_pay.booking_table) USING v_pay.booking_id;
      INSERT INTO public.booking_events (booking_id, booking_table, service, from_status, to_status, actor, note)
      VALUES (v_pay.booking_id, v_pay.booking_table, COALESCE(v_service, 'booking'), v_old_status, 'confirmed', 'system', 'Payment captured by verified webhook');
    ELSIF v_pay.order_table = 'marketplace_orders' THEN
      SELECT user_id, status INTO v_owner, v_old_status FROM public.marketplace_orders WHERE id = v_pay.order_id;
      UPDATE public.marketplace_orders SET payment_status = 'captured', status = CASE WHEN status = 'created' THEN 'accepted' ELSE status END, updated_at = now() WHERE id = v_pay.order_id;
      INSERT INTO public.order_events (order_id, order_table, from_status, to_status, actor)
      VALUES (v_pay.order_id, 'marketplace_orders', v_old_status, 'accepted', 'system');
      v_service := 'marketplace'; v_rate := public.gowayy_commission_rate('marketplace');
      FOR v_store, v_net IN SELECT p.store_id, sum((item->>'unitPricePaise')::integer * (item->>'quantity')::integer)::integer
        FROM public.marketplace_orders o, jsonb_array_elements(o.items) item
        JOIN public.marketplace_products p ON p.id = item->>'id'
        WHERE o.id = v_pay.order_id GROUP BY p.store_id LOOP
        v_commission := round(v_net * v_rate / 100)::integer;
        INSERT INTO public.commissions (payment_id, service, rate_percent, amount_paise) VALUES (v_pay.id, 'marketplace', v_rate, v_commission);
        SELECT owner_user_id INTO v_partner FROM public.grocery_stores WHERE id = v_store;
        IF v_partner IS NOT NULL THEN INSERT INTO public.settlements (partner_id, payment_id, gross_paise, commission_paise, net_paise)
          VALUES (v_partner, v_pay.id, v_net, v_commission, v_net - v_commission); END IF;
        IF v_partner IS NOT NULL THEN PERFORM public.gowayy_notify(v_partner, 'order.new', 'New paid marketplace order',
          'A paid order is ready for fulfilment.', 'partner-order:' || v_pay.order_id::text || ':' || v_store); END IF;
      END LOOP;
    ELSIF v_pay.order_table IS NOT NULL THEN
      v_service := CASE WHEN v_pay.order_table = 'food_orders' THEN 'food' ELSE 'grocery' END;
      EXECUTE format('SELECT user_id, status FROM public.%I WHERE id = $1', v_pay.order_table) INTO v_owner, v_old_status USING v_pay.order_id;
      EXECUTE format('UPDATE public.%I SET payment_status = ''captured'', status = CASE WHEN status = ''created'' THEN ''accepted'' ELSE status END, updated_at = now() WHERE id = $1', v_pay.order_table) USING v_pay.order_id;
      INSERT INTO public.order_events (order_id, order_table, from_status, to_status, actor)
      VALUES (v_pay.order_id, v_pay.order_table, v_old_status, 'accepted', 'system');
    END IF;
    IF v_service IS NOT NULL AND v_service <> 'marketplace' THEN
      v_rate := public.gowayy_commission_rate(v_service); v_commission := round(v_pay.amount_paise * v_rate / 100)::integer;
      INSERT INTO public.commissions (payment_id, service, rate_percent, amount_paise) VALUES (v_pay.id, v_service, v_rate, v_commission);
      IF v_service IN ('experience', 'package') THEN
        SELECT t.user_id INTO v_partner FROM public.experience_bookings b JOIN public.partner_tours t ON t.id = b.offering_id WHERE b.id = v_pay.booking_id;
      ELSIF v_service IN ('cab', 'shared_taxi', 'parcel') THEN
        SELECT d.user_id INTO v_partner FROM public.drivers d WHERE d.active_task_id = v_pay.booking_id AND d.deleted_at IS NULL
        UNION ALL SELECT d.user_id FROM public.ride_assignments a JOIN public.drivers d ON d.id = a.driver_id
          WHERE a.booking_id = v_pay.booking_id AND a.state = 'accepted' AND d.deleted_at IS NULL LIMIT 1;
      ELSE
        SELECT c.user_id INTO v_partner FROM public.partner_claims c WHERE c.state = 'verified' AND c.listing_id IN (
          SELECT property_id FROM public.hotel_bookings WHERE id = v_pay.booking_id
          UNION ALL SELECT restaurant_id FROM public.food_orders WHERE id = v_pay.order_id
          UNION ALL SELECT store_id FROM public.grocery_orders WHERE id = v_pay.order_id) LIMIT 1;
      END IF;
      IF v_partner IS NOT NULL THEN INSERT INTO public.settlements (partner_id, payment_id, gross_paise, commission_paise, net_paise)
        VALUES (v_partner, v_pay.id, v_pay.amount_paise, v_commission, v_pay.amount_paise - v_commission); END IF;
    END IF;
    PERFORM public.gowayy_notify(v_pay.user_id, 'payment.captured', 'Payment received',
      'Your payment of INR ' || round(v_pay.amount_paise / 100.0, 2) || ' was confirmed.', 'payment:' || v_pay.id || ':captured');
  END IF;
  SELECT * INTO v_pay FROM public.payments WHERE id = v_pay.id;
  RETURN jsonb_build_object('duplicate', v_duplicate, 'payment', to_jsonb(v_pay));
END $$;
REVOKE ALL ON FUNCTION public.rpc_webhook_capture(text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_complete_sandbox_refund(p_refund_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.gowayy_demo_mode() THEN RAISE EXCEPTION 'SANDBOX_DISABLED' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.refunds r JOIN public.payments p ON p.id = r.payment_id WHERE r.id = p_refund_id AND p.provider = 'sandbox') THEN
    RAISE EXCEPTION 'SANDBOX_REFUND_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  RETURN public.rpc_provider_refund_update(p_refund_id, 'sandbox-refund-' || p_refund_id::text, 'processed', jsonb_build_object('sandbox', true));
END $$;
REVOKE ALL ON FUNCTION public.rpc_complete_sandbox_refund(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_webhook_payment_failed(p_event_id text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_pay public.payments%ROWTYPE; v_id uuid := NULLIF(p_payload->>'paymentId', '')::uuid; v_reference text := NULLIF(p_payload->>'providerOrderId', ''); BEGIN
  IF COALESCE((p_payload->>'signatureVerified')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'SIGNATURE_NOT_VERIFIED' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.webhook_events (event_id, provider, payload, signature_verified) VALUES (p_event_id, COALESCE(p_payload->>'provider', 'razorpay'), p_payload, true) ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('duplicate', true); END IF;
  IF v_id IS NOT NULL THEN SELECT * INTO v_pay FROM public.payments WHERE id = v_id FOR UPDATE;
  ELSE SELECT * INTO v_pay FROM public.payments WHERE provider_reference = v_reference FOR UPDATE; END IF;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF v_pay.status IN ('requires_action','processing') THEN
    UPDATE public.payments SET status = 'failed', updated_at = now() WHERE id = v_pay.id;
    IF v_pay.order_table IS NOT NULL THEN EXECUTE format('UPDATE public.%I SET payment_status = ''failed'', updated_at = now() WHERE id = $1', v_pay.order_table) USING v_pay.order_id; END IF;
    PERFORM public.gowayy_notify(v_pay.user_id, 'payment.failed', 'Payment was not completed', 'Your order is saved and you can retry payment.', 'payment:' || v_pay.id || ':failed');
  END IF;
  RETURN jsonb_build_object('payment', (SELECT to_jsonb(p) FROM public.payments p WHERE p.id = v_pay.id));
END $$;
REVOKE ALL ON FUNCTION public.rpc_webhook_payment_failed(text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_webhook_refund(p_event_id text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_refund public.refunds%ROWTYPE; v_payment_id text := p_payload->>'providerPaymentId'; v_refund_id text := p_payload->>'providerReference'; v_status text := p_payload->>'status'; BEGIN
  IF COALESCE((p_payload->>'signatureVerified')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'SIGNATURE_NOT_VERIFIED' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.webhook_events (event_id, provider, payload, signature_verified) VALUES (p_event_id, COALESCE(p_payload->>'provider', 'razorpay'), p_payload, true) ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('duplicate', true); END IF;
  SELECT r.* INTO v_refund FROM public.refunds r JOIN public.payments p ON p.id = r.payment_id
    WHERE (v_refund_id IS NOT NULL AND r.provider_reference = v_refund_id) OR (v_payment_id IS NOT NULL AND p.provider_reference = v_payment_id AND r.status = 'pending')
    ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE OF r;
  IF NOT FOUND THEN RAISE EXCEPTION 'REFUND_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF v_status = 'failed' THEN UPDATE public.refunds SET status = 'failed', provider_payload = p_payload, updated_at = now() WHERE id = v_refund.id;
  ELSE PERFORM public.rpc_provider_refund_update(v_refund.id, v_refund_id, 'processed', p_payload); END IF;
  RETURN jsonb_build_object('refund', (SELECT to_jsonb(r) FROM public.refunds r WHERE r.id = v_refund.id));
END $$;
REVOKE ALL ON FUNCTION public.rpc_webhook_refund(text, jsonb) FROM PUBLIC, anon, authenticated;
