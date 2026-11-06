-- Server-priced, idempotent marketplace checkout with honest payment availability.

CREATE OR REPLACE FUNCTION public.gowayy_marketplace_discount(
  p_code text, p_subtotal integer, p_product_ids jsonb, p_category_ids jsonb, p_store_ids jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c public.coupons%ROWTYPE; o public.marketplace_offers%ROWTYPE;
  discount integer; code text;
BEGIN
  IF p_code IS NULL OR btrim(p_code) = '' THEN RETURN jsonb_build_object('code', NULL, 'discountPaise', 0); END IF;
  SELECT * INTO c FROM public.coupons cc
  WHERE upper(cc.code) = upper(btrim(p_code)) AND cc.active
    AND (cc.starts_at IS NULL OR cc.starts_at <= now()) AND (cc.ends_at IS NULL OR cc.ends_at >= now())
    AND cc.min_subtotal_paise <= p_subtotal;
  IF FOUND THEN
    code := c.code;
    IF c.kind = 'flat' THEN discount := least(c.value, p_subtotal);
    ELSE discount := least(COALESCE(c.max_discount_paise, p_subtotal), round(p_subtotal * c.value / 100.0)::integer, p_subtotal); END IF;
    RETURN jsonb_build_object('code', code, 'discountPaise', discount);
  END IF;
  SELECT * INTO o FROM public.marketplace_offers mo
  WHERE upper(mo.code) = upper(btrim(p_code)) AND mo.active
    AND (mo.start_at IS NULL OR mo.start_at <= now()) AND (mo.end_at IS NULL OR mo.end_at >= now())
    AND mo.min_order_paise <= p_subtotal AND (mo.usage_limit IS NULL OR mo.used_count < mo.usage_limit)
    AND (mo.scope = 'platform'
      OR (mo.scope = 'store' AND mo.store_id IS NOT NULL AND p_store_ids = jsonb_build_array(mo.store_id))
      OR (mo.scope = 'product' AND p_product_ids <@ mo.product_ids)
      OR (mo.scope = 'category' AND p_category_ids <@ mo.category_ids))
  LIMIT 1;
  IF FOUND THEN
    IF o.kind = 'flat' THEN discount := least(round(o.value)::integer, p_subtotal);
    ELSE discount := least(COALESCE(o.max_discount_paise, p_subtotal), round(p_subtotal * o.value / 100.0)::integer, p_subtotal); END IF;
    RETURN jsonb_build_object('code', o.code, 'discountPaise', discount);
  END IF;
  RAISE EXCEPTION 'INVALID_COUPON: coupon is invalid, expired, ineligible or below its minimum order' USING ERRCODE = '23514';
END $$;

CREATE OR REPLACE FUNCTION public.rpc_cart_quote(p_user uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_line record; v_items integer := 0; v_mrp integer := 0; v_prot integer := 0;
  v_discount integer := 0; v_delivery integer; v_tax integer; v_total integer;
  v_plan_price integer; coupon_result jsonb; applied text;
  product_ids jsonb; category_ids jsonb; store_ids jsonb;
BEGIN
  IF p_user IS DISTINCT FROM public.gowayy_require_user() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  FOR v_line IN
    SELECT ci.*, v.price_paise, v.mrp_paise, v.stock, p.active, p.published, p.deleted_at,
      s.published AS store_published, s.status AS store_status, s.deleted_at AS store_deleted_at
    FROM public.cart_items ci
    JOIN public.product_variants v ON v.id = ci.variant_id AND v.product_id = ci.product_id
    JOIN public.marketplace_products p ON p.id = ci.product_id
    JOIN public.grocery_stores s ON s.id = p.store_id
    WHERE ci.user_id = p_user
  LOOP
    IF NOT v_line.active OR NOT v_line.published OR v_line.deleted_at IS NOT NULL
      OR NOT v_line.store_published OR v_line.store_status <> 'active' OR v_line.store_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'ITEM_UNAVAILABLE: a cart item is no longer available' USING ERRCODE = '23514';
    END IF;
    IF v_line.stock < v_line.quantity THEN RAISE EXCEPTION 'OUT_OF_STOCK: %', v_line.variant_id USING ERRCODE = '23514'; END IF;
    v_items := v_items + v_line.price_paise * v_line.quantity;
    v_mrp := v_mrp + v_line.mrp_paise * v_line.quantity;
    IF v_line.protection_plan_id IS NOT NULL THEN
      SELECT price_paise INTO v_plan_price FROM public.protection_plans
      WHERE id = v_line.protection_plan_id AND product_id = v_line.product_id AND active;
      IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND' USING ERRCODE = '23514'; END IF;
      v_prot := v_prot + v_plan_price * v_line.quantity;
    END IF;
  END LOOP;
  SELECT
    COALESCE((SELECT jsonb_agg(x) FROM (SELECT DISTINCT p.id AS x FROM public.cart_items ci JOIN public.marketplace_products p ON p.id = ci.product_id WHERE ci.user_id = p_user) q), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(x) FROM (SELECT DISTINCT COALESCE(p.category_id, p.category) AS x FROM public.cart_items ci JOIN public.marketplace_products p ON p.id = ci.product_id WHERE ci.user_id = p_user) q), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(x) FROM (SELECT DISTINCT p.store_id AS x FROM public.cart_items ci JOIN public.marketplace_products p ON p.id = ci.product_id WHERE ci.user_id = p_user) q), '[]'::jsonb)
  INTO product_ids, category_ids, store_ids;
  IF jsonb_array_length(store_ids) > 1 THEN RAISE EXCEPTION 'MULTI_STORE_CART: checkout one store at a time' USING ERRCODE = '23514'; END IF;
  coupon_result := public.gowayy_marketplace_discount(p_payload->>'coupon', v_items, product_ids, category_ids, store_ids);
  v_discount := COALESCE((coupon_result->>'discountPaise')::integer, 0);
  applied := coupon_result->>'code';
  v_delivery := CASE WHEN p_payload->>'deliverySlot' = 'express' THEN 9900 ELSE 0 END;
  v_tax := round(greatest(0, v_items + v_prot + v_delivery - v_discount) * COALESCE(public.gowayy_config('gst_percent'), '5'::jsonb)::text::numeric / 100.0)::integer;
  v_total := v_items + v_prot + v_delivery - v_discount + v_tax;
  RETURN jsonb_build_object('quote', jsonb_build_object(
    'itemsPaise', v_items, 'protectionPaise', v_prot, 'deliveryFeePaise', v_delivery,
    'discountPaise', v_discount, 'taxPaise', v_tax, 'totalPaise', v_total,
    'mrpTotalPaise', v_mrp, 'savingsPaise', greatest(0, v_mrp - v_items) + v_discount,
    'appliedCoupon', applied,
    'lines', jsonb_build_array(
      jsonb_build_object('label', 'Items', 'paise', v_items),
      jsonb_build_object('label', 'Protection', 'paise', v_prot),
      jsonb_build_object('label', 'Delivery', 'paise', v_delivery),
      jsonb_build_object('label', 'Discount', 'paise', -v_discount),
      jsonb_build_object('label', 'GST', 'paise', v_tax))
  ));
END $$;

CREATE OR REPLACE FUNCTION public.rpc_marketplace_checkout(
  p_user uuid, p_address jsonb, p_method text, p_slot text DEFAULT 'standard',
  p_coupon text DEFAULT NULL, p_instructions text DEFAULT '', p_journey text DEFAULT NULL,
  p_idem text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_line record; v_variant public.product_variants%ROWTYPE; v_product public.marketplace_products%ROWTYPE;
  v_items jsonb := '[]'::jsonb; v_protection jsonb := '[]'::jsonb;
  v_items_paise integer := 0; v_mrp integer := 0; v_prot_paise integer := 0;
  v_discount integer := 0; v_delivery integer := 0; v_tax integer; v_total integer;
  v_order_id uuid; v_ref text; v_store_id text; v_plan_price integer;
  v_address jsonb; v_address_id text; v_pin text; v_kind text := 'grocery';
  v_quote jsonb; coupon_result jsonb; v_existing uuid; v_provider text;
  product_ids jsonb; category_ids jsonb; store_ids jsonb;
BEGIN
  IF p_user IS DISTINCT FROM public.gowayy_require_user() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_idem IS NULL OR char_length(p_idem) < 8 THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023'; END IF;
  SELECT id INTO v_existing FROM public.marketplace_orders WHERE user_id = p_user AND idempotency_key = p_idem;
  IF FOUND THEN RETURN public.rpc_order_detail(v_existing); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cart_items WHERE user_id = p_user) THEN
    RAISE EXCEPTION 'CART_EMPTY: Your cart is empty' USING ERRCODE = '23514';
  END IF;
  IF p_method NOT IN ('upi','card','netbanking','cod') THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED: choose a supported payment method' USING ERRCODE = '22023';
  END IF;
  v_provider := COALESCE(public.gowayy_config('payment_provider') #>> '{}', 'unconfigured');
  IF p_method <> 'cod' AND v_provider IN ('', 'unconfigured') THEN
    RAISE EXCEPTION 'PAYMENT_PROVIDER_NOT_CONFIGURED: online payment is unavailable; choose cash on delivery where supported' USING ERRCODE = '23514';
  END IF;
  IF NULLIF(p_journey, '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.journeys j WHERE j.id = p_journey::uuid AND j.user_id = p_user) THEN
    RAISE EXCEPTION 'JOURNEY_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  v_address_id := NULLIF(p_address->>'addressId', '');
  IF v_address_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', a.id, 'label', a.label, 'line1', a.line1, 'line2', a.line2,
      'city', a.city, 'state', a.state, 'postalCode', a.postal_code,
      'pincode', a.postal_code, 'lat', a.lat, 'lng', a.lng)
    INTO v_address FROM public.user_addresses a
    WHERE a.id = v_address_id::uuid AND a.user_id = p_user AND a.deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'ADDRESS_REQUIRED: choose one of your saved delivery addresses' USING ERRCODE = '42501'; END IF;
  ELSE
    v_address := p_address;
    IF NULLIF(p_address->>'line1', '') IS NULL OR NULLIF(p_address->>'city', '') IS NULL THEN
      RAISE EXCEPTION 'ADDRESS_REQUIRED: choose a delivery address' USING ERRCODE = '22023';
    END IF;
  END IF;
  v_pin := COALESCE(v_address->>'pincode', v_address->>'postalCode');

  SELECT
    COALESCE((SELECT jsonb_agg(x) FROM (SELECT DISTINCT p.id AS x FROM public.cart_items ci JOIN public.marketplace_products p ON p.id = ci.product_id WHERE ci.user_id = p_user) q), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(x) FROM (SELECT DISTINCT COALESCE(p.category_id, p.category) AS x FROM public.cart_items ci JOIN public.marketplace_products p ON p.id = ci.product_id WHERE ci.user_id = p_user) q), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(x) FROM (SELECT DISTINCT p.store_id AS x FROM public.cart_items ci JOIN public.marketplace_products p ON p.id = ci.product_id WHERE ci.user_id = p_user) q), '[]'::jsonb)
  INTO product_ids, category_ids, store_ids;

  FOR v_line IN SELECT * FROM public.cart_items WHERE user_id = p_user ORDER BY added_at, id LOOP
    SELECT * INTO v_product FROM public.marketplace_products WHERE id = v_line.product_id;
    SELECT * INTO v_variant FROM public.product_variants
    WHERE id = v_line.variant_id AND product_id = v_line.product_id FOR UPDATE;
    IF v_product.id IS NULL OR v_variant.id IS NULL OR NOT v_product.active OR NOT v_product.published OR v_product.deleted_at IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM public.grocery_stores s WHERE s.id = v_product.store_id AND s.published AND s.status = 'active' AND s.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'ITEM_UNAVAILABLE: a cart item is no longer available' USING ERRCODE = '23514';
    END IF;
    IF v_variant.stock < v_line.quantity THEN RAISE EXCEPTION 'OUT_OF_STOCK: insufficient stock for %', v_product.name USING ERRCODE = '23514'; END IF;
    v_store_id := COALESCE(v_store_id, v_product.store_id);
    v_items_paise := v_items_paise + v_variant.price_paise * v_line.quantity;
    v_mrp := v_mrp + v_variant.mrp_paise * v_line.quantity;
    v_plan_price := 0;
    IF v_line.protection_plan_id IS NOT NULL THEN
      SELECT price_paise INTO v_plan_price FROM public.protection_plans
      WHERE id = v_line.protection_plan_id AND product_id = v_line.product_id AND active;
      IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND' USING ERRCODE = '23514'; END IF;
      v_prot_paise := v_prot_paise + v_plan_price * v_line.quantity;
      v_protection := v_protection || jsonb_build_object('planId', v_line.protection_plan_id, 'paise', v_plan_price * v_line.quantity);
    END IF;
    v_items := v_items || jsonb_build_object(
      'id', v_product.id, 'variantId', v_variant.id,
      'name', v_product.name || ' (' || v_variant.label || ')',
      'quantity', v_line.quantity, 'unitPricePaise', v_variant.price_paise,
      'mrpPaise', v_variant.mrp_paise,
      'options', CASE WHEN v_line.protection_plan_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_line.protection_plan_id) END);
  END LOOP;
  IF jsonb_array_length(store_ids) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'MULTI_STORE_CART: checkout one store at a time' USING ERRCODE = '23514';
  END IF;

  SELECT CASE WHEN lower(p.category) ~ 'food|snack|dairy|kitchen|restaurant|bakery'
                   OR lower(COALESCE(s.category_name, '')) ~ 'food|kitchen|restaurant|bakery'
              THEN 'food' ELSE 'grocery' END
  INTO v_kind FROM public.marketplace_products p JOIN public.grocery_stores s ON s.id = p.store_id
  WHERE p.id = (SELECT product_id FROM public.cart_items WHERE user_id = p_user ORDER BY added_at, id LIMIT 1);
  IF EXISTS (SELECT 1 FROM public.service_areas WHERE active) AND (
    v_pin IS NULL OR NOT EXISTS (SELECT 1 FROM public.service_areas a WHERE a.active AND v_pin = ANY(CASE WHEN v_kind = 'food' THEN a.food_pincodes ELSE a.grocery_pincodes END))
  ) THEN
    RAISE EXCEPTION 'SERVICE_UNAVAILABLE: % delivery is not configured for PIN %', v_kind, COALESCE(v_pin, 'unknown') USING ERRCODE = '23514';
  END IF;

  coupon_result := public.gowayy_marketplace_discount(p_coupon, v_items_paise, product_ids, category_ids, store_ids);
  v_discount := COALESCE((coupon_result->>'discountPaise')::integer, 0);
  v_delivery := CASE WHEN p_slot = 'express' THEN 9900 ELSE 0 END;
  v_tax := round(greatest(0, v_items_paise + v_prot_paise + v_delivery - v_discount) * COALESCE(public.gowayy_config('gst_percent'), '5'::jsonb)::text::numeric / 100.0)::integer;
  v_total := v_items_paise + v_prot_paise + v_delivery - v_discount + v_tax;
  IF p_method = 'cod' AND (v_total > 1000000 OR COALESCE(public.gowayy_config('service_cod'), 'true'::jsonb) = 'false'::jsonb) THEN
    RAISE EXCEPTION 'COD_UNAVAILABLE: cash on delivery is unavailable for this order' USING ERRCODE = '23514';
  END IF;
  v_quote := jsonb_build_object(
    'itemsPaise', v_items_paise, 'protectionPaise', v_prot_paise,
    'deliveryFeePaise', v_delivery, 'discountPaise', v_discount,
    'taxPaise', v_tax, 'totalPaise', v_total, 'mrpTotalPaise', v_mrp,
    'savingsPaise', greatest(0, v_mrp - v_items_paise) + v_discount,
    'appliedCoupon', coupon_result->>'code',
    'lines', jsonb_build_array(
      jsonb_build_object('label', 'Items', 'paise', v_items_paise),
      jsonb_build_object('label', 'Protection', 'paise', v_prot_paise),
      jsonb_build_object('label', 'Delivery', 'paise', v_delivery),
      jsonb_build_object('label', 'Discount', 'paise', -v_discount),
      jsonb_build_object('label', 'GST', 'paise', v_tax)));

  v_order_id := gen_random_uuid(); v_ref := 'GW-O' || nextval('public.order_ref_seq');
  INSERT INTO public.marketplace_orders (
    id, reference, user_id, journey_id, items, protection, price,
    delivery_address, instructions, delivery_slot, coupon, payment_method,
    store_id, delivery_code, idempotency_key)
  VALUES (v_order_id, v_ref, p_user, NULLIF(p_journey, '')::uuid, v_items, v_protection, v_quote,
    v_address, left(COALESCE(p_instructions, ''), 1000), COALESCE(NULLIF(p_slot, ''), 'standard'),
    coupon_result->>'code', p_method, v_store_id,
    lpad((floor(random() * 1000000))::integer::text, 6, '0'), p_idem);

  FOR v_line IN SELECT * FROM public.cart_items WHERE user_id = p_user LOOP
    UPDATE public.product_variants SET stock = stock - v_line.quantity WHERE id = v_line.variant_id;
  END LOOP;
  IF v_discount > 0 THEN
    UPDATE public.marketplace_offers SET used_count = used_count + 1
    WHERE upper(code) = upper(COALESCE(coupon_result->>'code', ''));
  END IF;
  INSERT INTO public.order_events (order_id, order_table, to_status, actor, actor_id)
  VALUES (v_order_id, 'marketplace_orders', 'created', 'customer', p_user);
  PERFORM public.gowayy_notify(p_user, 'order.created', 'Order placed',
    'Your marketplace order ' || v_ref || ' has been placed.', 'order:' || v_order_id::text || ':created');
  PERFORM public.gowayy_audit('order.created', 'marketplace_orders', v_order_id::text,
    jsonb_build_object('totalPaise', v_total, 'paymentMethod', p_method));
  DELETE FROM public.cart_items WHERE user_id = p_user;
  RETURN public.rpc_order_detail(v_order_id);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_payment_methods(p_total_paise integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  provider text := COALESCE(public.gowayy_config('payment_provider') #>> '{}', 'unconfigured');
  online boolean := provider NOT IN ('', 'unconfigured') AND (provider <> 'sandbox' OR public.gowayy_demo_mode());
  cod boolean := p_total_paise <= 1000000 AND COALESCE(public.gowayy_config('service_cod'), 'true'::jsonb) <> 'false'::jsonb;
  reason text := CASE WHEN provider IN ('', 'unconfigured') THEN 'No online payment gateway is configured on this backend' ELSE NULL END;
BEGIN
  RETURN jsonb_build_object('items', jsonb_build_array(
    jsonb_build_object('id','upi','label','Pay by any UPI app','detail','Google Pay, PhonePe, Paytm and more','available',online,'integrated',online,'recommended',online AND p_total_paise > 0,'unavailableReason',reason),
    jsonb_build_object('id','card','label','Credit & debit cards','detail','Via the configured gateway','available',online,'integrated',online,'unavailableReason',reason),
    jsonb_build_object('id','wallet','label','GOWAYY Wallet balance','detail','Wallet service is not available','available',false,'integrated',false,'unavailableReason','No wallet ledger is configured'),
    jsonb_build_object('id','netbanking','label','Net banking','detail','Via the configured gateway','available',online,'integrated',online,'unavailableReason',reason),
    jsonb_build_object('id','emi','label','EMI','detail','Where the gateway supports it','available',false,'integrated',false,'unavailableReason','EMI requires provider-specific verification'),
    jsonb_build_object('id','cod','label','Cash on delivery','detail','Where operationally supported','available',cod,'integrated',true,'unavailableReason',CASE WHEN NOT cod THEN 'Cash on delivery is unavailable for this total or area' ELSE NULL END)
  ), 'note', CASE WHEN online THEN 'Online payments are confirmed only by a verified server webhook.'
                  ELSE 'Online payments are disabled until a gateway is configured. Cash on delivery remains subject to order limits and coverage.' END);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_cancel_order(p_id uuid, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); tbl text := public.gowayy_order_table(p_id);
  st text; owner uuid; pay public.payments%ROWTYPE; item jsonb; refund_result jsonb;
BEGIN
  IF tbl IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  EXECUTE format('SELECT status, user_id FROM public.%I WHERE id = $1 FOR UPDATE', tbl) INTO st, owner USING p_id;
  IF owner <> u THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF st IN ('delivered','cancelled','refunded') THEN RAISE EXCEPTION 'ORDER_NOT_CANCELLABLE' USING ERRCODE = '23514'; END IF;
  IF tbl = 'grocery_orders' THEN
    UPDATE public.grocery_inventory i SET stock = i.stock + oi.quantity, updated_at = now()
    FROM public.grocery_order_items oi JOIN public.grocery_orders o ON o.id = oi.order_id
    WHERE oi.order_id = p_id AND i.product_id = oi.product_id AND i.store_id = o.store_id;
  ELSIF tbl = 'marketplace_orders' THEN
    FOR item IN SELECT jsonb_array_elements(o.items) FROM public.marketplace_orders o WHERE o.id = p_id LOOP
      UPDATE public.product_variants v SET stock = v.stock + (item->>'quantity')::integer
      WHERE v.id = item->>'variantId' AND v.product_id = item->>'id';
    END LOOP;
  END IF;
  EXECUTE format('UPDATE public.%I SET status = ''cancelled'', updated_at = now() WHERE id = $1', tbl) USING p_id;
  INSERT INTO public.order_events (order_id, order_table, from_status, to_status, actor, actor_id)
  VALUES (p_id, tbl, st, 'cancelled', 'customer', u);
  UPDATE public.journey_services SET state = 'cancelled', updated_at = now() WHERE order_id = p_id;
  SELECT * INTO pay FROM public.payments WHERE order_id = p_id AND status = 'captured';
  IF FOUND THEN SELECT public.rpc_refund_payment(pay.id, true, COALESCE(p_reason, 'Order cancelled')) INTO refund_result; END IF;
  PERFORM public.gowayy_notify(u, 'order.cancelled', 'Order cancelled', 'Your order has been cancelled.', 'order:' || p_id || ':cancelled');
  RETURN public.gowayy_order_json(p_id) || jsonb_build_object('refundResult', refund_result);
END $$;
