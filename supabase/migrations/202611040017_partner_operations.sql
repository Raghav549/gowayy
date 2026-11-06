-- Partner-owned catalogue, stores, orders and delivery verification.

CREATE OR REPLACE FUNCTION public.gowayy_can_manage_store(p_store_id text, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p_user AND r.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.grocery_stores s WHERE s.id = p_store_id AND s.owner_user_id = p_user)
    OR EXISTS (SELECT 1 FROM public.partner_claims c WHERE c.user_id = p_user AND c.listing_id = p_store_id AND c.role IN ('grocery','seller') AND c.state = 'verified');
$$;

CREATE OR REPLACE FUNCTION public.gowayy_can_fulfil_order(p_table text, p_order_id uuid, p_user uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p_user AND r.role = 'admin') THEN RETURN true; END IF;
  IF p_table = 'food_orders' THEN
    RETURN EXISTS (SELECT 1 FROM public.food_orders o JOIN public.partner_claims c
      ON c.listing_id = o.restaurant_id AND c.role = 'restaurant' AND c.state = 'verified'
      WHERE o.id = p_order_id AND c.user_id = p_user);
  ELSIF p_table = 'grocery_orders' THEN
    RETURN EXISTS (SELECT 1 FROM public.grocery_orders o JOIN public.partner_claims c
      ON c.listing_id = o.store_id AND c.role IN ('grocery','seller') AND c.state = 'verified'
      WHERE o.id = p_order_id AND c.user_id = p_user);
  ELSIF p_table = 'marketplace_orders' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.marketplace_orders o
      LEFT JOIN LATERAL jsonb_array_elements(o.items) item ON true
      LEFT JOIN public.marketplace_products p ON p.id = item->>'id'
      JOIN public.partner_claims c ON c.user_id = p_user AND c.state = 'verified'
        AND c.role IN ('grocery','seller') AND c.listing_id = COALESCE(p.store_id, o.store_id)
      WHERE o.id = p_order_id
    );
  END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_claim_partner(p_role text, p_listing_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); ok boolean; state text; v_listing text := p_listing_id;
BEGIN
  IF p_role NOT IN ('restaurant','grocery','seller','property','tour_operator') THEN RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023'; END IF;
  IF p_role = 'tour_operator' OR (p_role IN ('grocery','seller') AND NULLIF(p_listing_id, '') IS NULL) THEN
    v_listing := 'self:' || u::text; ok := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM (
        SELECT id FROM public.restaurants WHERE p_role = 'restaurant'
        UNION ALL SELECT id FROM public.grocery_stores WHERE p_role IN ('grocery','seller')
        UNION ALL SELECT id FROM public.properties WHERE p_role = 'property'
      ) x WHERE x.id = v_listing) INTO ok;
  END IF;
  IF NOT ok THEN RAISE EXCEPTION 'LISTING_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  state := CASE WHEN public.gowayy_demo_mode() THEN 'verified' ELSE 'pending' END;
  INSERT INTO public.partner_claims (user_id, role, listing_id, state, verified_at)
  VALUES (u, p_role, v_listing, state, CASE WHEN state = 'verified' THEN now() ELSE NULL END)
  ON CONFLICT (user_id, role, listing_id) DO UPDATE SET state = EXCLUDED.state, verified_at = EXCLUDED.verified_at;
  INSERT INTO public.user_roles (user_id, role) VALUES (u, p_role) ON CONFLICT DO NOTHING;
  PERFORM public.gowayy_audit('partner.claim', 'partner_claims', v_listing,
    jsonb_build_object('role', p_role, 'demoAutoVerified', public.gowayy_demo_mode()));
  RETURN jsonb_build_object('role', p_role, 'listingId', v_listing, 'state', state,
    'demoNotice', CASE WHEN state = 'verified' THEN 'DEMO: claim auto-verified for local testing. Production requires document verification.' ELSE 'Verification pending.' END);
END $$;

CREATE OR REPLACE FUNCTION public.gowayy_partner_product_json(p public.marketplace_products)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.gowayy_marketplace_product_json(p) || jsonb_build_object(
    'ownerUserId', p.owner_user_id,
    'images', COALESCE((SELECT jsonb_agg(i.asset_path ORDER BY i.position)
      FROM public.product_images i WHERE i.product_id = p.id AND i.asset_path IS NOT NULL), '[]'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.rpc_partner_categories()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user();
BEGIN
  RETURN jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.name) FROM public.marketplace_categories c WHERE c.active), '[]'::jsonb),
    'mine', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.name) FROM public.marketplace_categories c WHERE c.active AND c.owner_user_id = u), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_category_create(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); name text := left(btrim(COALESCE(p_payload->>'name', '')), 60);
  v_slug text; v_id text := 'cat_' || gen_random_uuid()::text; image jsonb;
BEGIN
  IF char_length(name) < 2 THEN RAISE EXCEPTION 'VALIDATION_FAILED: category name needs at least two characters' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = u AND role IN ('grocery','seller','admin')) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  v_slug := trim(BOTH '-' FROM lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')));
  IF EXISTS (SELECT 1 FROM public.marketplace_categories c WHERE c.slug = v_slug) THEN RAISE EXCEPTION 'CATEGORY_EXISTS' USING ERRCODE = '23505'; END IF;
  image := COALESCE(p_payload->'image', (p_payload->'images'->0));
  IF jsonb_typeof(image) = 'string' THEN image := jsonb_build_object('path', image #>> '{}', 'assetPath', image #>> '{}', 'alt', name || ' category'); END IF;
  INSERT INTO public.marketplace_categories (id, name, slug, owner_user_id, image) VALUES (v_id, name, v_slug, u, image);
  RETURN to_jsonb((SELECT c FROM public.marketplace_categories c WHERE c.id = v_id));
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_products()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user();
BEGIN
  RETURN COALESCE((SELECT jsonb_agg(public.gowayy_partner_product_json(p) ORDER BY p.created_at DESC)
    FROM public.marketplace_products p WHERE p.deleted_at IS NULL
      AND (p.owner_user_id = u OR public.gowayy_can_manage_store(p.store_id, u))), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_product_create(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); p_id text := 'prd_' || gen_random_uuid()::text;
  store_id text := p_payload->>'storeId'; category_id text := NULLIF(p_payload->>'categoryId', '');
  category_name text; store_name text; name text := left(btrim(COALESCE(p_payload->>'name', '')), 140);
  slug text; v jsonb; idx integer := 0; image jsonb; price integer; mrp integer; stock integer;
BEGIN
  IF char_length(name) < 2 THEN RAISE EXCEPTION 'VALIDATION_FAILED: product name is required' USING ERRCODE = '22023'; END IF;
  IF store_id IS NULL OR NOT public.gowayy_can_manage_store(store_id, u) THEN RAISE EXCEPTION 'STORE_REQUIRED: choose a store you manage' USING ERRCODE = '42501'; END IF;
  SELECT s.name INTO store_name FROM public.grocery_stores s WHERE s.id = store_id;
  IF category_id IS NOT NULL THEN
    SELECT c.name INTO category_name FROM public.marketplace_categories c WHERE c.id = category_id AND c.active;
    IF NOT FOUND THEN RAISE EXCEPTION 'CATEGORY_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  ELSE
    SELECT c.id, c.name INTO category_id, category_name FROM public.marketplace_categories c WHERE c.active ORDER BY c.owner_user_id = u DESC, c.name LIMIT 1;
    IF category_id IS NULL THEN RAISE EXCEPTION 'CATEGORY_REQUIRED: create a category first' USING ERRCODE = '22023'; END IF;
  END IF;
  price := greatest(0, round(COALESCE((p_payload->>'pricePaise')::numeric, 0))::integer);
  mrp := greatest(price, round(COALESCE((p_payload->>'mrpPaise')::numeric, price))::integer);
  stock := greatest(0, round(COALESCE((p_payload->>'stock')::numeric, 0))::integer);
  slug := trim(BOTH '-' FROM lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))) || '-' || left(gen_random_uuid()::text, 8);
  INSERT INTO public.marketplace_products (
    id, slug, store_id, brand, name, category, category_id, owner_user_id,
    data_class, description, tags, coupon_eligible, published, active, featured)
  VALUES (p_id, slug, store_id, left(COALESCE(p_payload->>'brand', store_name), 60), name,
    category_name, category_id, u, 'verified-listing', left(COALESCE(p_payload->>'description', ''), 2000),
    COALESCE(p_payload->'tags', '[]'::jsonb), COALESCE((p_payload->>'couponEligible')::boolean, true),
    COALESCE((p_payload->>'published')::boolean, true), COALESCE((p_payload->>'active')::boolean, true), false);
  IF jsonb_array_length(COALESCE(p_payload->'variants', '[]'::jsonb)) = 0 THEN
    v := jsonb_build_object('label', COALESCE(NULLIF(p_payload->>'variantLabel', ''), 'Standard'), 'pricePaise', price, 'mrpPaise', mrp, 'stock', stock);
    INSERT INTO public.product_variants (id, product_id, label, price_paise, mrp_paise, stock, position)
    VALUES ('var_' || gen_random_uuid()::text, p_id, left(v->>'label', 60), price, mrp, stock, 0);
  ELSE
    FOR v IN SELECT * FROM jsonb_array_elements(p_payload->'variants') LOOP
      price := greatest(0, round(COALESCE((v->>'pricePaise')::numeric, 0))::integer);
      mrp := greatest(price, round(COALESCE((v->>'mrpPaise')::numeric, price))::integer);
      stock := greatest(0, round(COALESCE((v->>'stock')::numeric, 0))::integer);
      INSERT INTO public.product_variants (id, product_id, label, price_paise, mrp_paise, stock, position)
      VALUES ('var_' || gen_random_uuid()::text, p_id, left(COALESCE(v->>'label', 'Option'), 60), price, mrp, stock, idx);
      idx := idx + 1;
    END LOOP;
  END IF;
  FOR image IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'images', '[]'::jsonb)) LOOP
    INSERT INTO public.product_images (id, product_id, status, asset_path, alt, license, position)
    VALUES ('img_' || gen_random_uuid()::text, p_id, 'verified',
      COALESCE(image->>'path', image->>'assetPath', CASE WHEN jsonb_typeof(image) = 'string' THEN image #>> '{}' ELSE NULL END),
      left(name || ' product image', 180), 'partner-provided', idx);
    idx := idx + 1;
  END LOOP;
  PERFORM public.gowayy_audit('partner.product.created', 'marketplace_products', p_id, jsonb_build_object('storeId', store_id));
  RETURN public.gowayy_partner_product_json((SELECT p FROM public.marketplace_products p WHERE p.id = p_id));
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_product_update(p_id text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); p public.marketplace_products%ROWTYPE;
  category_name text; v jsonb; image jsonb; idx integer := 0; price integer; mrp integer; stock integer;
BEGIN
  SELECT * INTO p FROM public.marketplace_products WHERE id = p_id AND deleted_at IS NULL;
  IF p.id IS NULL OR NOT (p.owner_user_id = u OR public.gowayy_can_manage_store(p.store_id, u)) THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  IF NULLIF(p_payload->>'categoryId', '') IS NOT NULL THEN
    SELECT c.name INTO category_name FROM public.marketplace_categories c WHERE c.id = p_payload->>'categoryId' AND c.active;
    IF NOT FOUND THEN RAISE EXCEPTION 'CATEGORY_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  END IF;
  UPDATE public.marketplace_products SET
    name = left(COALESCE(NULLIF(p_payload->>'name', ''), name), 140),
    description = left(COALESCE(p_payload->>'description', description), 2000),
    category_id = COALESCE(NULLIF(p_payload->>'categoryId', ''), category_id),
    category = COALESCE(category_name, category), tags = COALESCE(p_payload->'tags', tags),
    coupon_eligible = COALESCE((p_payload->>'couponEligible')::boolean, coupon_eligible),
    published = COALESCE((p_payload->>'published')::boolean, published),
    active = COALESCE((p_payload->>'active')::boolean, active), updated_at = now()
  WHERE id = p_id;
  FOR v IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'variants', '[]'::jsonb)) LOOP
    price := greatest(0, round(COALESCE((v->>'pricePaise')::numeric, 0))::integer);
    mrp := greatest(price, round(COALESCE((v->>'mrpPaise')::numeric, price))::integer);
    stock := greatest(0, round(COALESCE((v->>'stock')::numeric, 0))::integer);
    IF NULLIF(v->>'id', '') IS NOT NULL AND EXISTS (SELECT 1 FROM public.product_variants WHERE id = v->>'id' AND product_id = p_id) THEN
      UPDATE public.product_variants SET label = left(COALESCE(v->>'label', label), 60), price_paise = price, mrp_paise = mrp, stock = stock
      WHERE id = v->>'id' AND product_id = p_id;
    ELSE
      INSERT INTO public.product_variants (id, product_id, label, price_paise, mrp_paise, stock, position)
      VALUES ('var_' || gen_random_uuid()::text, p_id, left(COALESCE(v->>'label', 'Option'), 60), price, mrp, stock, idx);
    END IF;
    idx := idx + 1;
  END LOOP;
  IF p_payload ? 'pricePaise' OR p_payload ? 'stock' OR p_payload ? 'mrpPaise' THEN
    UPDATE public.product_variants SET
      price_paise = greatest(0, COALESCE(round((p_payload->>'pricePaise')::numeric)::integer, price_paise)),
      mrp_paise = greatest(greatest(0, COALESCE(round((p_payload->>'pricePaise')::numeric)::integer, price_paise)), COALESCE(round((p_payload->>'mrpPaise')::numeric)::integer, mrp_paise)),
      stock = greatest(0, COALESCE(round((p_payload->>'stock')::numeric)::integer, product_variants.stock))
    WHERE id = (SELECT id FROM public.product_variants WHERE product_id = p_id ORDER BY position LIMIT 1);
  END IF;
  IF p_payload ? 'images' THEN
    DELETE FROM public.product_images WHERE product_id = p_id;
    FOR image IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'images', '[]'::jsonb)) LOOP
      INSERT INTO public.product_images (id, product_id, status, asset_path, alt, license, position)
      VALUES ('img_' || gen_random_uuid()::text, p_id, 'verified',
        COALESCE(image->>'path', image->>'assetPath', CASE WHEN jsonb_typeof(image) = 'string' THEN image #>> '{}' ELSE NULL END),
        left(p.name || ' product image', 180), 'partner-provided', idx);
      idx := idx + 1;
    END LOOP;
  END IF;
  PERFORM public.gowayy_audit('partner.product.updated', 'marketplace_products', p_id, '{}'::jsonb);
  RETURN public.gowayy_partner_product_json((SELECT x FROM public.marketplace_products x WHERE x.id = p_id));
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_stores()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user();
BEGIN
  RETURN COALESCE((SELECT jsonb_agg(public.gowayy_store_json(s) || jsonb_build_object(
      'ownerUserId', s.owner_user_id,
      'verified', EXISTS (SELECT 1 FROM public.partner_claims c WHERE c.user_id = u AND c.listing_id = s.id AND c.state = 'verified')
    ) ORDER BY s.created_at DESC)
    FROM public.grocery_stores s WHERE s.deleted_at IS NULL AND public.gowayy_can_manage_store(s.id, u)), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_store_create(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); v_id text := 'str_' || gen_random_uuid()::text;
  name text := left(btrim(COALESCE(p_payload->>'name', '')), 100); state text;
  destination text := p_payload->>'destinationId';
BEGIN
  IF char_length(name) < 2 THEN RAISE EXCEPTION 'VALIDATION_FAILED: store name is required' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = u AND role IN ('grocery','seller','admin')) THEN RAISE EXCEPTION 'FORBIDDEN: complete seller onboarding first' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.destinations d WHERE d.id = destination AND d.published AND d.deleted_at IS NULL) THEN RAISE EXCEPTION 'DESTINATION_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF p_payload->>'lat' IS NULL OR p_payload->>'lng' IS NULL THEN RAISE EXCEPTION 'LOCATION_REQUIRED: provide the actual store coordinates' USING ERRCODE = '22023'; END IF;
  state := CASE WHEN public.gowayy_demo_mode() THEN 'verified' ELSE 'pending' END;
  INSERT INTO public.grocery_stores (
    id, destination_id, owner_user_id, name, description, lat, lng, address, phone,
    opening_hours, opening_hours_verified, category_id, category_name,
    delivery_radius_km, data_class, published, status, logo, banner, image)
  VALUES (v_id, destination, u, name, left(COALESCE(p_payload->>'description', ''), 2000),
    (p_payload->>'lat')::double precision, (p_payload->>'lng')::double precision,
    left(COALESCE(p_payload->>'address', ''), 300), left(COALESCE(p_payload->>'phone', ''), 40),
    left(COALESCE(p_payload->>'openingHours', ''), 120), false,
    NULLIF(p_payload->>'categoryId', ''), NULLIF(p_payload->>'categoryName', ''),
    greatest(0.1, COALESCE((p_payload->>'deliveryCoverageKm')::numeric, 8)),
    'verified-listing', state = 'verified', 'active', p_payload->'logo', p_payload->'banner', p_payload->'image');
  INSERT INTO public.partner_claims (user_id, role, listing_id, state, verified_at)
  VALUES (u, CASE WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = u AND role = 'seller') THEN 'seller' ELSE 'grocery' END,
    v_id, state, CASE WHEN state = 'verified' THEN now() ELSE NULL END)
  ON CONFLICT (user_id, role, listing_id) DO UPDATE SET state = EXCLUDED.state, verified_at = EXCLUDED.verified_at;
  PERFORM public.gowayy_audit('partner.store.created', 'grocery_stores', v_id, jsonb_build_object('verification', state));
  RETURN (SELECT public.gowayy_store_json(s) || jsonb_build_object('verified', state = 'verified') FROM public.grocery_stores s WHERE s.id = v_id);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_store_update(p_id text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user();
BEGIN
  IF NOT public.gowayy_can_manage_store(p_id, u) THEN RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  UPDATE public.grocery_stores SET
    name = left(COALESCE(NULLIF(p_payload->>'name', ''), name), 100),
    description = left(COALESCE(p_payload->>'description', description), 2000),
    address = left(COALESCE(p_payload->>'address', address), 300),
    phone = left(COALESCE(p_payload->>'phone', phone), 40),
    opening_hours = left(COALESCE(p_payload->>'openingHours', opening_hours), 120),
    opening_hours_verified = CASE WHEN p_payload ? 'openingHours' THEN false ELSE opening_hours_verified END,
    delivery_radius_km = greatest(0.1, COALESCE((p_payload->>'deliveryCoverageKm')::numeric, delivery_radius_km)),
    logo = CASE WHEN p_payload ? 'logo' THEN p_payload->'logo' ELSE logo END,
    banner = CASE WHEN p_payload ? 'banner' THEN p_payload->'banner' ELSE banner END,
    image = CASE WHEN p_payload ? 'image' THEN p_payload->'image' ELSE image END,
    status = COALESCE(NULLIF(p_payload->>'status', ''), status), updated_at = now()
  WHERE id = p_id;
  PERFORM public.gowayy_audit('partner.store.updated', 'grocery_stores', p_id, '{}'::jsonb);
  RETURN (SELECT public.gowayy_store_json(s) || jsonb_build_object('verified', EXISTS (
    SELECT 1 FROM public.partner_claims c WHERE c.user_id = u AND c.listing_id = s.id AND c.state = 'verified'))
    FROM public.grocery_stores s WHERE s.id = p_id);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_offers()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user();
BEGIN
  RETURN COALESCE((SELECT jsonb_agg(public.gowayy_offer_json(o) || jsonb_build_object('ownerUserId', o.owner_user_id) ORDER BY o.created_at DESC)
    FROM public.marketplace_offers o WHERE o.owner_user_id = u OR o.owner_user_id IS NULL), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_offer_create(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); v_id text := 'off_' || gen_random_uuid()::text;
  kind text := CASE WHEN p_payload->>'kind' = 'flat' THEN 'flat' ELSE 'percent' END;
  value numeric := COALESCE((p_payload->>'value')::numeric, (p_payload->>'valuePercent')::numeric, (p_payload->>'valuePaise')::numeric, 0);
  scope text := COALESCE(NULLIF(p_payload->>'scope', ''), 'store'); store_id text := NULLIF(p_payload->>'storeId', '');
BEGIN
  IF value <= 0 OR (kind = 'percent' AND value > 90) THEN RAISE EXCEPTION 'VALIDATION_FAILED: enter a valid discount up to 90 percent' USING ERRCODE = '22023'; END IF;
  IF scope NOT IN ('product','category','store','platform') THEN RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = '22023'; END IF;
  IF scope = 'platform' AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = u AND role = 'admin') THEN RAISE EXCEPTION 'FORBIDDEN: partners cannot create platform-wide offers' USING ERRCODE = '42501'; END IF;
  IF scope = 'store' THEN
    IF store_id IS NULL THEN SELECT s.id INTO store_id FROM public.grocery_stores s WHERE public.gowayy_can_manage_store(s.id, u) ORDER BY s.created_at LIMIT 1; END IF;
    IF store_id IS NULL OR NOT public.gowayy_can_manage_store(store_id, u) THEN RAISE EXCEPTION 'STORE_REQUIRED' USING ERRCODE = '42501'; END IF;
  END IF;
  IF scope = 'category' AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u AND r.role = 'admin') THEN
    IF jsonb_array_length(COALESCE(p_payload->'categoryIds', '[]'::jsonb)) = 0 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(p_payload->'categoryIds') requested
      WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_categories c WHERE c.id = requested.value AND c.owner_user_id = u)
    ) THEN RAISE EXCEPTION 'FORBIDDEN: category offers may target only your own categories' USING ERRCODE = '42501'; END IF;
  END IF;
  IF scope = 'product' AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u AND r.role = 'admin') THEN
    IF jsonb_array_length(COALESCE(p_payload->'productIds', '[]'::jsonb)) = 0 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(p_payload->'productIds') requested
      WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_products p WHERE p.id = requested.value AND public.gowayy_can_manage_store(p.store_id, u))
    ) THEN RAISE EXCEPTION 'FORBIDDEN: product offers may target only your own products' USING ERRCODE = '42501'; END IF;
  END IF;
  INSERT INTO public.marketplace_offers (
    id, owner_user_id, scope, product_ids, category_ids, store_id, title, code, kind, value,
    max_discount_paise, min_order_paise, start_at, end_at, usage_limit, active)
  VALUES (v_id, u, scope, COALESCE(p_payload->'productIds', '[]'::jsonb), COALESCE(p_payload->'categoryIds', '[]'::jsonb), store_id,
    left(COALESCE(NULLIF(p_payload->>'title', ''), 'Offer'), 100), NULLIF(upper(btrim(COALESCE(p_payload->>'code', ''))), ''), kind, value,
    NULLIF((p_payload->>'maxDiscountPaise')::integer, 0),
    greatest(0, COALESCE((p_payload->>'minOrderPaise')::integer, (p_payload->>'minSubtotalPaise')::integer, 0)),
    NULLIF(p_payload->>'startAt', '')::timestamptz, NULLIF(p_payload->>'endAt', '')::timestamptz,
    NULLIF((p_payload->>'usageLimit')::integer, 0), COALESCE((p_payload->>'active')::boolean, true));
  RETURN public.gowayy_offer_json((SELECT o FROM public.marketplace_offers o WHERE o.id = v_id)) || jsonb_build_object('ownerUserId', u);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_offer_update(p_id text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user();
BEGIN
  UPDATE public.marketplace_offers o SET active = COALESCE((p_payload->>'active')::boolean, o.active)
  WHERE o.id = p_id AND (o.owner_user_id = u OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u AND r.role = 'admin'));
  IF NOT FOUND THEN RAISE EXCEPTION 'OFFER_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  RETURN public.gowayy_offer_json((SELECT o FROM public.marketplace_offers o WHERE o.id = p_id));
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_coupons()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user();
BEGIN
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'code', o.code, 'kind', o.kind, 'value', o.value,
    'valuePercent', CASE WHEN o.kind = 'percent' THEN o.value END,
    'valuePaise', CASE WHEN o.kind = 'flat' THEN o.value END,
    'minSubtotalPaise', o.min_order_paise, 'active', o.active, 'offerId', o.id) ORDER BY o.created_at DESC)
    FROM public.marketplace_offers o WHERE o.owner_user_id = u AND o.code IS NOT NULL), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_orders()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user();
BEGIN
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', o.id, 'reference', o.reference, 'status', o.status, 'service', o.service,
      'items', o.items, 'price', o.price, 'totalPaise', o.total_paise,
      'deliveryAddress', CASE WHEN o.service = 'marketplace' THEN o.delivery_address::jsonb ELSE to_jsonb(o.delivery_address) END,
      'instructions', o.instructions, 'slot', o.slot, 'paymentMethod', o.payment_method,
      'createdAt', o.created_at, 'updatedAt', o.updated_at) ORDER BY o.created_at DESC)
    FROM public.customer_orders o
    WHERE public.gowayy_can_fulfil_order(o.source_table, o.id, u)), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_deliveries()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'orderId', x->>'id', 'id', x->>'id', 'reference', x->>'reference',
    'status', x->>'status', 'service', x->>'service', 'items', x->'items',
    'deliveryAddress', x->'deliveryAddress', 'masked', '••••••', 'verified', false
  ) ORDER BY x->>'createdAt' DESC), '[]'::jsonb)
  FROM jsonb_array_elements(public.rpc_partner_orders()) x
  WHERE x->>'status' = 'out_for_delivery';
$$;

CREATE OR REPLACE FUNCTION public.rpc_verify_delivery(p_order_id uuid, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); tbl text := public.gowayy_order_table(p_order_id);
  status text; expected text; attempts integer; owner uuid;
BEGIN
  IF tbl IS NULL OR NOT public.gowayy_can_fulfil_order(tbl, p_order_id, u) THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  IF p_code IS NULL OR p_code !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'INVALID_CODE: enter the six-digit delivery code' USING ERRCODE = '22023'; END IF;
  EXECUTE format('SELECT status, delivery_code, delivery_attempts, user_id FROM public.%I WHERE id = $1 FOR UPDATE', tbl)
  INTO status, expected, attempts, owner USING p_order_id;
  IF status <> 'out_for_delivery' THEN RAISE EXCEPTION 'INVALID_ORDER_STATE: mark the order out for delivery before handover verification' USING ERRCODE = '23514'; END IF;
  IF attempts >= 5 THEN RAISE EXCEPTION 'TOO_MANY_ATTEMPTS: ask support to review this delivery' USING ERRCODE = '23514'; END IF;
  IF expected IS NULL OR expected <> p_code THEN
    EXECUTE format('UPDATE public.%I SET delivery_attempts = delivery_attempts + 1, updated_at = now() WHERE id = $1', tbl) USING p_order_id;
    RETURN jsonb_build_object('verified', false, 'remainingAttempts', greatest(0, 4 - attempts));
  END IF;
  EXECUTE format('UPDATE public.%I SET delivery_verified_at = now(), status = ''delivered'', updated_at = now() WHERE id = $1', tbl) USING p_order_id;
  INSERT INTO public.order_events (order_id, order_table, from_status, to_status, actor, actor_id)
  VALUES (p_order_id, tbl, status, 'delivered', 'partner', u);
  PERFORM public.gowayy_notify(owner, 'order.delivered', 'Order delivered', 'Your delivery code was verified and the order is complete.', 'order:' || p_order_id::text || ':delivered');
  PERFORM public.gowayy_audit('delivery.verified', tbl, p_order_id::text, '{}'::jsonb);
  RETURN jsonb_build_object('verified', true, 'orderId', p_order_id, 'status', 'delivered');
END $$;

CREATE OR REPLACE FUNCTION public.rpc_update_address(p_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user();
BEGIN
  IF COALESCE((p_payload->>'isDefault')::boolean, false) THEN UPDATE public.user_addresses SET is_default = false WHERE user_id = u; END IF;
  UPDATE public.user_addresses SET
    label = left(COALESCE(NULLIF(p_payload->>'label', ''), label), 60),
    line1 = COALESCE(NULLIF(p_payload->>'line1', ''), line1), line2 = COALESCE(p_payload->>'line2', line2),
    city = COALESCE(NULLIF(p_payload->>'city', ''), city), state = COALESCE(NULLIF(p_payload->>'state', ''), state),
    postal_code = COALESCE(NULLIF(p_payload->>'postalCode', ''), NULLIF(p_payload->>'pincode', ''), postal_code),
    lat = COALESCE((p_payload->>'lat')::double precision, lat), lng = COALESCE((p_payload->>'lng')::double precision, lng),
    is_default = COALESCE((p_payload->>'isDefault')::boolean, is_default)
  WHERE id = p_id AND user_id = u AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADDRESS_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('address', (SELECT to_jsonb(a) FROM public.user_addresses a WHERE a.id = p_id));
END $$;

-- Issue handover codes for food/grocery orders using the same wrapper that
-- already enforces pricing, inventory, idempotency and ownership.
CREATE OR REPLACE FUNCTION public.rpc_place_order(p_service text, p_payload jsonb, p_idem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); existing uuid; out uuid; code text;
BEGIN
  IF p_idem IS NULL OR char_length(p_idem) < 8 THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023'; END IF;
  PERFORM public.gowayy_rate_limit('order:' || u::text, 30, 60);
  SELECT result_id INTO existing FROM public.idempotency_keys WHERE key = p_idem AND user_id = u AND operation = 'order:' || p_service;
  IF FOUND THEN RETURN public.gowayy_order_json(existing); END IF;
  out := CASE p_service WHEN 'food' THEN public.gowayy_place_food_order(u, p_payload, p_idem)
    WHEN 'grocery' THEN public.gowayy_place_grocery_order(u, p_payload, p_idem) ELSE NULL END;
  IF out IS NULL THEN RAISE EXCEPTION 'UNSUPPORTED_SERVICE: %', p_service USING ERRCODE = '22023'; END IF;
  code := lpad((floor(random() * 1000000))::integer::text, 6, '0');
  IF p_service = 'food' THEN UPDATE public.food_orders SET delivery_code = code WHERE id = out;
  ELSE UPDATE public.grocery_orders SET delivery_code = code WHERE id = out; END IF;
  INSERT INTO public.idempotency_keys (key, user_id, operation, result_type, result_id)
  VALUES (p_idem, u, 'order:' || p_service, 'order', out);
  RETURN public.gowayy_order_json(out);
END $$;

INSERT INTO public.order_status_transitions (from_status, to_status, actor) VALUES
  ('packed','out_for_delivery','partner'), ('out_for_delivery','cancelled','partner')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.rpc_transition_order(p_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  u uuid := public.gowayy_require_user(); tbl text := public.gowayy_order_table(p_id);
  old_status text; v_actor text := 'customer'; owner uuid; listing text; ok boolean;
  is_partner boolean; item jsonb;
BEGIN
  IF tbl IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  EXECUTE format('SELECT status, user_id, ' || CASE WHEN tbl = 'food_orders' THEN 'restaurant_id' ELSE 'store_id' END ||
                 ' FROM public.%I WHERE id = $1 FOR UPDATE', tbl) INTO old_status, owner, listing USING p_id;
  is_partner := public.gowayy_can_fulfil_order(tbl, p_id, u);
  IF owner = u AND p_status = 'cancelled' THEN v_actor := 'customer';
  ELSIF is_partner THEN v_actor := 'partner';
  ELSIF public.gowayy_has_role('driver') THEN v_actor := 'driver';
  ELSE RAISE EXCEPTION 'FORBIDDEN: not your order or business' USING ERRCODE = '42501'; END IF;
  IF p_status = 'delivered' THEN RAISE EXCEPTION 'DELIVERY_CODE_REQUIRED: verify the customer code instead of setting delivered directly' USING ERRCODE = '23514'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.order_status_transitions t WHERE t.from_status = old_status AND t.to_status = p_status AND t.actor = v_actor) INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'INVALID_TRANSITION: % → % is not permitted for %', old_status, p_status, v_actor USING ERRCODE = '23514'; END IF;
  IF p_status = 'cancelled' AND tbl = 'marketplace_orders' THEN
    FOR item IN SELECT jsonb_array_elements(o.items) FROM public.marketplace_orders o WHERE o.id = p_id LOOP
      UPDATE public.product_variants v SET stock = v.stock + (item->>'quantity')::integer WHERE v.id = item->>'variantId' AND v.product_id = item->>'id';
    END LOOP;
  ELSIF p_status = 'cancelled' AND tbl = 'grocery_orders' THEN
    UPDATE public.grocery_inventory i SET stock = i.stock + oi.quantity, updated_at = now()
    FROM public.grocery_order_items oi WHERE oi.order_id = p_id AND i.product_id = oi.product_id AND i.store_id = listing;
  END IF;
  EXECUTE format('UPDATE public.%I SET status = $1, updated_at = now() WHERE id = $2', tbl) USING p_status, p_id;
  INSERT INTO public.order_events (order_id, order_table, from_status, to_status, actor, actor_id)
  VALUES (p_id, tbl, old_status, p_status, v_actor, u);
  PERFORM public.gowayy_notify(owner, 'order.' || p_status, 'Order ' || p_status,
    'Your order is now ' || p_status || '.', 'order:' || p_id || ':' || p_status);
  PERFORM public.gowayy_audit('order.transition', tbl, p_id::text, jsonb_build_object('from', old_status, 'to', p_status));
  RETURN public.gowayy_order_json(p_id);
END $$;
