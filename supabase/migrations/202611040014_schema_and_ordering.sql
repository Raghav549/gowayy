-- Schema and order-flow parity for the customer, partner and admin apps.
-- Additive only: existing rows are preserved and new columns are nullable or defaulted.

-- The original role checks made admin, seller and tour-operator accounts impossible
-- to provision even though all three applications and the API contract use them.
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('customer','driver','restaurant','grocery','property','seller','tour_operator','admin'));
ALTER TABLE public.partner_claims DROP CONSTRAINT IF EXISTS partner_claims_role_check;
ALTER TABLE public.partner_claims ADD CONSTRAINT partner_claims_role_check
  CHECK (role IN ('driver','restaurant','grocery','property','seller','tour_operator'));

-- ---------------------------------------------------------------- catalogue --
CREATE TABLE IF NOT EXISTS public.marketplace_categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  image jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketplace_products ADD COLUMN IF NOT EXISTS category_id text;
ALTER TABLE public.marketplace_products ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.marketplace_products ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true;
ALTER TABLE public.marketplace_products ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE public.marketplace_products ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.marketplace_products ADD COLUMN IF NOT EXISTS coupon_eligible boolean NOT NULL DEFAULT true;
DO $$ BEGIN
  ALTER TABLE public.marketplace_products ADD CONSTRAINT marketplace_products_category_fk
    FOREIGN KEY (category_id) REFERENCES public.marketplace_categories(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS marketplace_products_store_idx ON public.marketplace_products(store_id, active, published);
CREATE INDEX IF NOT EXISTS marketplace_products_owner_idx ON public.marketplace_products(owner_user_id);

ALTER TABLE public.grocery_stores ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.grocery_stores ADD COLUMN IF NOT EXISTS category_id text;
ALTER TABLE public.grocery_stores ADD COLUMN IF NOT EXISTS category_name text;
ALTER TABLE public.grocery_stores ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.grocery_stores ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.grocery_stores ADD COLUMN IF NOT EXISTS opening_hours text;
ALTER TABLE public.grocery_stores ADD COLUMN IF NOT EXISTS opening_hours_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.grocery_stores ADD COLUMN IF NOT EXISTS logo jsonb;
ALTER TABLE public.grocery_stores ADD COLUMN IF NOT EXISTS banner jsonb;
ALTER TABLE public.grocery_stores ADD COLUMN IF NOT EXISTS image jsonb;
ALTER TABLE public.grocery_stores ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.grocery_stores DROP CONSTRAINT IF EXISTS grocery_stores_status_check;
ALTER TABLE public.grocery_stores ADD CONSTRAINT grocery_stores_status_check CHECK (status IN ('active','paused'));
CREATE INDEX IF NOT EXISTS grocery_stores_owner_idx ON public.grocery_stores(owner_user_id);

CREATE TABLE IF NOT EXISTS public.marketplace_offers (
  id text PRIMARY KEY,
  owner_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'product' CHECK (scope IN ('product','category','store','platform')),
  product_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  category_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  store_id text REFERENCES public.grocery_stores(id) ON DELETE CASCADE,
  title text NOT NULL,
  code text UNIQUE,
  kind text NOT NULL CHECK (kind IN ('percent','flat')),
  value numeric NOT NULL CHECK (value > 0),
  max_discount_paise integer,
  min_order_paise integer NOT NULL DEFAULT 0,
  start_at timestamptz,
  end_at timestamptz,
  usage_limit integer,
  used_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_offers_owner_idx ON public.marketplace_offers(owner_user_id, active);

CREATE TABLE IF NOT EXISTS public.marketplace_banners (
  id text PRIMARY KEY,
  title text NOT NULL,
  subtitle text,
  href text NOT NULL,
  image jsonb,
  active boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.posters (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('food','grocery')),
  title text NOT NULL,
  subtitle text,
  cta text,
  href text NOT NULL,
  image jsonb,
  active boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posters_kind_order_idx ON public.posters(kind, active, order_index);

CREATE TABLE IF NOT EXISTS public.service_areas (
  id text PRIMARY KEY,
  city text NOT NULL,
  state text NOT NULL DEFAULT 'West Bengal',
  food_pincodes text[] NOT NULL DEFAULT '{}',
  grocery_pincodes text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_areas_active_idx ON public.service_areas(active);

ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- All delivery orders support server-verified customer handover codes.
ALTER TABLE public.food_orders ADD COLUMN IF NOT EXISTS delivery_code text;
ALTER TABLE public.food_orders ADD COLUMN IF NOT EXISTS delivery_verified_at timestamptz;
ALTER TABLE public.food_orders ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.grocery_orders ADD COLUMN IF NOT EXISTS delivery_code text;
ALTER TABLE public.grocery_orders ADD COLUMN IF NOT EXISTS delivery_verified_at timestamptz;
ALTER TABLE public.grocery_orders ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0;

-- Marketplace orders need an owning store for partner operations, a delivery code
-- for handover, and idempotency to make checkout retries safe.
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS store_id text REFERENCES public.grocery_stores(id);
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS delivery_code text;
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS delivery_verified_at timestamptz;
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_orders_idempotency_idx
  ON public.marketplace_orders(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE public.marketplace_orders DROP CONSTRAINT IF EXISTS marketplace_orders_status_check;
ALTER TABLE public.marketplace_orders ADD CONSTRAINT marketplace_orders_status_check
  CHECK (status IN ('created','accepted','preparing','packed','out_for_delivery','delivered','cancelled','refunded'));

-- Payments and their event ledger previously rejected marketplace orders.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_order_table_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_order_table_check
  CHECK (order_table IN ('food_orders','grocery_orders','marketplace_orders'));
ALTER TABLE public.order_events DROP CONSTRAINT IF EXISTS order_events_order_table_check;
ALTER TABLE public.order_events ADD CONSTRAINT order_events_order_table_check
  CHECK (order_table IN ('food_orders','grocery_orders','marketplace_orders'));

-- New tables follow the same deny-by-default RLS posture. Public reads are
-- explicitly granted below; mutations go through checked SECURITY DEFINER RPCs.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['marketplace_categories','marketplace_offers','marketplace_banners','posters','service_areas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t || '_public_read', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
  END LOOP;
END $$;

-- Include marketplace orders in the unified customer order read model. The new
-- columns are appended so CREATE OR REPLACE VIEW remains non-destructive.
CREATE OR REPLACE VIEW public.customer_orders WITH (security_invoker = true) AS
SELECT o.id, o.reference, o.user_id, o.journey_id, o.service, o.status, o.listing_id,
       o.delivery_address, o.instructions, o.slot, o.substitution, o.coupon, o.price,
       o.total_paise, o.payment_id, o.created_at, o.updated_at, o.source_table,
       COALESCE(i.items, '[]'::jsonb) AS items,
       p.status AS payment_status, o.payment_method, o.delivery_code,
       (o.delivery_verified_at IS NOT NULL) AS delivery_verified
FROM (
  SELECT id, reference, user_id, journey_id, 'food'::text AS service, status,
         restaurant_id AS listing_id, delivery_address, instructions, NULL::text AS slot,
         NULL::text AS substitution, coupon, price, total_paise, payment_id, created_at, updated_at,
         'food_orders'::text AS source_table, NULL::text AS payment_method,
         delivery_code, delivery_verified_at
  FROM public.food_orders
  UNION ALL
  SELECT id, reference, user_id, journey_id, 'grocery'::text, status,
         store_id, delivery_address, instructions, slot, substitution, coupon,
         price, total_paise, payment_id, created_at, updated_at, 'grocery_orders',
         NULL::text, delivery_code, delivery_verified_at
  FROM public.grocery_orders
  UNION ALL
  SELECT id, reference, user_id, journey_id, 'marketplace'::text, status,
         store_id, delivery_address::text, instructions, delivery_slot, NULL::text, coupon,
         price, (price->>'totalPaise')::integer, payment_id, created_at, updated_at,
         'marketplace_orders', payment_method, delivery_code, delivery_verified_at
  FROM public.marketplace_orders
) o
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('id', x.product_id, 'name', x.name, 'quantity', x.quantity,
                                      'unitPricePaise', x.unit_price_paise, 'options', x.options)) AS items
  FROM (
    SELECT product_id, name, quantity, unit_price_paise, options FROM public.food_order_items WHERE order_id = o.id
    UNION ALL
    SELECT product_id, name, quantity, unit_price_paise, options FROM public.grocery_order_items WHERE order_id = o.id
    UNION ALL
    SELECT (item->>'id')::text, (item->>'name')::text,
           (item->>'quantity')::integer, (item->>'unitPricePaise')::integer,
           COALESCE(item->'options', '[]'::jsonb)
    FROM public.marketplace_orders mo, jsonb_array_elements(mo.items) item
    WHERE mo.id = o.id AND o.source_table = 'marketplace_orders'
  ) x
) i ON true
LEFT JOIN public.payments p ON p.id = o.payment_id;

-- Payment target discovery and payment amount must understand marketplace orders.
CREATE OR REPLACE FUNCTION public.gowayy_order_table(p_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.food_orders WHERE id = p_id) THEN RETURN 'food_orders'; END IF;
  IF EXISTS (SELECT 1 FROM public.grocery_orders WHERE id = p_id) THEN RETURN 'grocery_orders'; END IF;
  IF EXISTS (SELECT 1 FROM public.marketplace_orders WHERE id = p_id) THEN RETURN 'marketplace_orders'; END IF;
  RETURN NULL;
END $$;

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
  -- A fresh browser idempotency key must not create a second concurrent charge
  -- for the same target. Reuse the pending attempt; captured targets are final.
  IF (bid IS NOT NULL AND EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = bid AND p.status = 'captured'))
    OR (oid IS NOT NULL AND EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id = oid AND p.status = 'captured')) THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_CAPTURED' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO existing FROM public.payments p
    WHERE p.user_id = u AND p.status IN ('requires_action','processing')
      AND ((bid IS NOT NULL AND p.booking_id = bid) OR (oid IS NOT NULL AND p.order_id = oid))
    ORDER BY p.created_at DESC LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(existing); END IF;
  IF bid IS NOT NULL THEN
    bt := public.gowayy_booking_table(bid);
    IF bt IS NULL OR NOT public.gowayy_owns_booking(bid) THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = '42501'; END IF;
    EXECUTE format('SELECT total_paise FROM public.%I WHERE id = $1', bt) INTO amount USING bid;
  ELSIF oid IS NOT NULL THEN
    ot := public.gowayy_order_table(oid);
    IF ot IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = '42501'; END IF;
    IF ot = 'marketplace_orders' THEN
      SELECT (price->>'totalPaise')::integer INTO amount FROM public.marketplace_orders WHERE id = oid AND user_id = u;
    ELSE
      EXECUTE format('SELECT total_paise FROM public.%I WHERE id = $1 AND user_id = $2', ot) INTO amount USING oid, u;
    END IF;
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
    COALESCE(public.gowayy_config('payment_provider') #>> '{}', 'unconfigured'), idem)
  RETURNING * INTO out;
  IF bid IS NOT NULL THEN EXECUTE format('UPDATE public.%I SET payment_id = $1 WHERE id = $2', bt) USING out.id, bid; END IF;
  IF oid IS NOT NULL THEN EXECUTE format('UPDATE public.%I SET payment_id = $1 WHERE id = $2', ot) USING out.id, oid; END IF;
  PERFORM public.gowayy_audit('payment.init', 'payments', out.id::text, jsonb_build_object('amountPaise', amount, 'method', method));
  RETURN to_jsonb(out);
END $$;

-- Fix the undefined p_v_id reference and let partners advance marketplace orders.
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
  ELSIF public.gowayy_is_partner_for(listing) OR EXISTS (
    SELECT 1 FROM public.grocery_stores s WHERE s.id = listing AND s.owner_user_id = u
  ) THEN v_actor := 'partner'; END IF;
  IF owner <> u AND v_actor = 'customer' THEN RAISE EXCEPTION 'FORBIDDEN: not your order' USING ERRCODE = '42501'; END IF;
  -- A customer may cancel only their own order. Drivers and partners act only on
  -- the transition table; no client-supplied actor or status history is trusted.
  IF owner = u AND v_actor = 'customer' AND p_status <> 'cancelled' THEN
    RAISE EXCEPTION 'FORBIDDEN: customers cannot advance fulfilment' USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.order_status_transitions
                 WHERE from_status = old_status AND to_status = p_status AND actor = v_actor) INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'INVALID_TRANSITION: % → % is not permitted for %', old_status, p_status, v_actor USING ERRCODE = '23514'; END IF;
  IF p_status = 'delivered' AND tbl = 'marketplace_orders' THEN
    IF NOT EXISTS (SELECT 1 FROM public.marketplace_orders WHERE id = p_id AND delivery_verified_at IS NOT NULL) THEN
      RAISE EXCEPTION 'DELIVERY_CODE_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;
  EXECUTE format('UPDATE public.%I SET status = $1, updated_at = now() WHERE id = $2', tbl) USING p_status, p_id;
  INSERT INTO public.order_events (order_id, order_table, from_status, to_status, actor, actor_id)
  VALUES (p_id, tbl, old_status, p_status, v_actor, u);
  PERFORM public.gowayy_notify(owner, 'order.' || p_status, 'Order ' || p_status,
    'Your order is now ' || p_status || '.', 'order:' || p_id || ':' || p_status);
  PERFORM public.gowayy_audit('order.transition', tbl, p_id::text, jsonb_build_object('from', old_status, 'to', p_status));
  RETURN public.gowayy_order_json(p_id);
END $$;

-- Product and store records are now searchable by the same universal API used by
-- the HTTP backend. Replacing the function keeps its original grant/signature.
CREATE OR REPLACE FUNCTION public.rpc_search(p_q text)
RETURNS TABLE (id text, kind text, title text, subtitle text, service text, destination_id text, href text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH q AS (SELECT '%' || lower(btrim(p_q)) || '%' AS pattern), base AS (
    SELECT d.id, 'destination'::text AS kind, d.name AS title, d.region AS subtitle, NULL::text AS service, d.id AS destination_id, '/destinations/' || d.slug AS href
      FROM public.destinations d, q WHERE lower(d.name || ' ' || d.region || ' ' || d.description) LIKE q.pattern AND d.published
    UNION ALL
    SELECT a.id, 'attraction', a.name, a.category, 'tourism', a.destination_id, '/tourism?attraction=' || a.id
      FROM public.destination_attractions a, q WHERE lower(a.name || ' ' || a.category) LIKE q.pattern AND a.published
    UNION ALL
    SELECT p.id, 'property', p.name, p.property_type, p.service, p.destination_id, '/hotels/' || p.id
      FROM public.properties p, q WHERE lower(p.name || ' ' || p.property_type) LIKE q.pattern AND p.published
    UNION ALL
    SELECT r.id, 'restaurant', r.name, array_to_string(r.cuisines, ', '), 'food', r.destination_id, '/food/' || r.id
      FROM public.restaurants r, q WHERE lower(r.name || ' ' || array_to_string(r.cuisines, ' ')) LIKE q.pattern AND r.published
    UNION ALL
    SELECT f.id, 'food', f.name, r.name, 'food', r.destination_id, '/food/' || r.id
      FROM public.food_products f JOIN public.restaurants r ON r.id = f.restaurant_id, q
      WHERE lower(f.name) LIKE q.pattern AND f.available
    UNION ALL
    SELECT g.id, 'grocery', g.name, s.name, 'grocery', s.destination_id, '/groceries/' || s.id
      FROM public.grocery_products g JOIN public.grocery_stores s ON s.id = g.store_id, q
      WHERE lower(g.name) LIKE q.pattern
    UNION ALL
    SELECT t.id, 'taxi_route', pf.name || ' → ' || pt.name, COALESCE(st.name, t.operator),
           'shared_taxi', NULL, '/cabs?shared=' || t.id
      FROM public.shared_taxi_routes t
      JOIN public.places pf ON pf.id = t.from_place_id JOIN public.places pt ON pt.id = t.to_place_id
      LEFT JOIN public.taxi_stands st ON st.id = t.stand_id, q
      WHERE lower(pf.name || ' ' || pt.name || ' shared taxi') LIKE q.pattern AND t.active
    UNION ALL
    SELECT tp.id, 'package', tp.name, tp.duration_hours || ' h', 'package', tp.destination_id, '/packages?offering=' || tp.id
      FROM public.tour_packages tp, q WHERE lower(tp.name) LIKE q.pattern AND tp.published
    UNION ALL
    SELECT ta.id, 'experience', ta.name, ta.duration_minutes || ' min', 'experience', ta.destination_id, '/experiences?offering=' || ta.id
      FROM public.tour_activities ta, q WHERE ta.kind = 'experience' AND lower(ta.name) LIKE q.pattern AND ta.published
    UNION ALL
    SELECT p.id, 'product', p.name, s.name || ' · ' || p.category, 'marketplace', s.destination_id, '/products/' || p.slug
      FROM public.marketplace_products p JOIN public.grocery_stores s ON s.id = p.store_id, q
      WHERE p.active AND p.published AND p.deleted_at IS NULL
        AND lower(p.name || ' ' || p.brand || ' ' || p.category || ' ' || COALESCE(p.tags::text, '')) LIKE q.pattern
    UNION ALL
    SELECT s.id, 'store', s.name, COALESCE(s.category_name, 'Store'), 'marketplace', s.destination_id, '/groceries/' || s.id
      FROM public.grocery_stores s, q
      WHERE s.published AND s.deleted_at IS NULL AND s.status = 'active'
        AND lower(s.name || ' ' || COALESCE(s.category_name, '') || ' ' || s.description) LIKE q.pattern
  ) SELECT * FROM base LIMIT 30;
$$;
