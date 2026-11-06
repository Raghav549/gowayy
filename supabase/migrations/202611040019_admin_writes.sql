-- Server-authorized admin mutations. Deletes deactivate content to preserve history.

CREATE OR REPLACE FUNCTION public.gowayy_image_value(p_input jsonb, p_alt text DEFAULT 'GOWAYY image')
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE path text; result jsonb;
BEGIN
  IF p_input IS NULL OR p_input = 'null'::jsonb THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_input) = 'string' THEN
    path := p_input #>> '{}'; result := jsonb_build_object('path', path, 'assetPath', path, 'alt', p_alt, 'status', 'verified');
  ELSE
    path := COALESCE(p_input->>'path', p_input->>'assetPath', p_input->>'url');
    result := p_input || jsonb_build_object('path', path, 'assetPath', path, 'alt', COALESCE(p_input->>'alt', p_alt));
  END IF;
  IF path IS NULL OR NOT (path LIKE '/uploads/%' OR path LIKE '/images/%' OR path LIKE 'https://%') THEN
    RAISE EXCEPTION 'INVALID_IMAGE_PATH: use an uploaded image or HTTPS URL' USING ERRCODE = '22023';
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.gowayy_pincodes(p_input jsonb)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result text[]; pin text;
BEGIN
  IF p_input IS NULL THEN RETURN '{}'; END IF;
  IF jsonb_typeof(p_input) = 'string' THEN
    SELECT array_agg(btrim(x)) INTO result FROM regexp_split_to_table(p_input #>> '{}', '[,;[:space:]]+') x WHERE btrim(x) <> '';
  ELSE
    SELECT array_agg(btrim(x)) INTO result FROM jsonb_array_elements_text(p_input) x WHERE btrim(x) <> '';
  END IF;
  FOREACH pin IN ARRAY COALESCE(result, '{}') LOOP
    IF pin !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'INVALID_PINCODE: % must contain exactly six digits', pin USING ERRCODE = '22023'; END IF;
  END LOOP;
  RETURN COALESCE((SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(COALESCE(result, '{}')) x), '{}');
END $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_write(p_path text, p_method text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  admin uuid := public.gowayy_admin_id(); segments text[] := regexp_split_to_array(trim(BOTH '/' FROM p_path), '/');
  resource text; path_id text; action text; extra text; new_id text; new_uuid uuid;
  v_image jsonb; v_state text; v_old integer; v_new integer; v_services jsonb; v_config jsonb;
BEGIN
  resource := COALESCE(segments[1], ''); path_id := NULLIF(segments[2], ''); action := NULLIF(segments[3], ''); extra := NULLIF(segments[4], '');
  IF p_method NOT IN ('POST','PATCH','DELETE') THEN RAISE EXCEPTION 'METHOD_NOT_ALLOWED' USING ERRCODE = '22023'; END IF;

  IF resource = 'customers' AND path_id IS NOT NULL AND p_method = 'PATCH' THEN
    UPDATE public.profiles SET account_status = COALESCE(NULLIF(p_payload->>'status', ''), account_status), updated_at = now() WHERE id = path_id::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    PERFORM public.gowayy_audit('admin.customer.updated', 'profiles', path_id, jsonb_build_object('status', p_payload->>'status'));
    RETURN jsonb_build_object('customer', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = path_id::uuid));

  ELSIF resource = 'partners' AND path_id IS NOT NULL AND p_method = 'PATCH' THEN
    v_state := NULLIF(p_payload->>'approval', '');
    IF v_state IS NOT NULL AND v_state NOT IN ('verified','pending','rejected') THEN RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = '22023'; END IF;
    UPDATE public.profiles SET partner_approval = COALESCE(v_state, partner_approval),
      account_status = COALESCE(NULLIF(p_payload->>'status', ''), account_status), updated_at = now() WHERE id = path_id::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'PARTNER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    IF v_state IS NOT NULL THEN
      UPDATE public.partner_claims SET state = v_state, verified_at = CASE WHEN v_state = 'verified' THEN now() ELSE NULL END WHERE user_id = path_id::uuid;
      UPDATE public.partner_documents SET status = v_state, reviewed_at = now() WHERE user_id = path_id::uuid;
      UPDATE public.drivers SET verification = v_state, online = CASE WHEN v_state = 'verified' THEN online ELSE false END, updated_at = now() WHERE user_id = path_id::uuid;
      UPDATE public.grocery_stores s SET published = v_state = 'verified', updated_at = now() WHERE s.owner_user_id = path_id::uuid;
    END IF;
    PERFORM public.gowayy_audit('admin.partner.reviewed', 'profiles', path_id, jsonb_build_object('approval', v_state, 'status', p_payload->>'status'));
    RETURN jsonb_build_object('partner', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = path_id::uuid));

  ELSIF resource = 'stores' AND path_id IS NULL AND p_method = 'POST' THEN
    new_id := 'str_' || gen_random_uuid()::text;
    IF NULLIF(p_payload->>'destinationId', '') IS NULL OR p_payload->'coords' IS NULL THEN
      RAISE EXCEPTION 'LOCATION_REQUIRED: destination and actual store coordinates are required' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.grocery_stores (id, destination_id, owner_user_id, name, description, lat, lng, address, phone,
      opening_hours, opening_hours_verified, category_id, category_name, delivery_radius_km, data_class, published, status)
    VALUES (new_id, p_payload->>'destinationId', NULLIF(p_payload->>'ownerUserId', '')::uuid,
      left(btrim(p_payload->>'name'), 100), left(COALESCE(p_payload->>'description', ''), 2000),
      (p_payload->'coords'->>'lat')::double precision, (p_payload->'coords'->>'lng')::double precision,
      left(COALESCE(p_payload->>'address', ''), 300), left(COALESCE(p_payload->>'phone', ''), 40),
      left(COALESCE(p_payload->>'openingHours', ''), 120), false, NULLIF(p_payload->>'categoryId', ''),
      COALESCE((SELECT c.name FROM public.marketplace_categories c WHERE c.id = p_payload->>'categoryId'), 'General'),
      greatest(0.1, COALESCE((p_payload->>'deliveryCoverageKm')::numeric, 5)), 'verified-listing', false, 'active');
    IF NOT EXISTS (SELECT 1 FROM public.grocery_stores s WHERE s.id = new_id AND char_length(btrim(s.name)) >= 2) THEN
      RAISE EXCEPTION 'VALIDATION_FAILED: store name and destination are required' USING ERRCODE = '22023';
    END IF;
    PERFORM public.gowayy_audit('admin.store.created', 'grocery_stores', new_id, '{}'::jsonb);
    RETURN jsonb_build_object('store', (SELECT public.gowayy_store_json(s) || jsonb_build_object('verified', false) FROM public.grocery_stores s WHERE s.id = new_id));

  ELSIF resource = 'stores' AND path_id IS NOT NULL AND p_method = 'PATCH' THEN
    UPDATE public.grocery_stores s SET name = left(COALESCE(NULLIF(p_payload->>'name', ''), s.name), 100),
      description = left(COALESCE(p_payload->>'description', s.description), 2000),
      address = left(COALESCE(p_payload->>'address', s.address), 300), phone = left(COALESCE(p_payload->>'phone', s.phone), 40),
      opening_hours = left(COALESCE(p_payload->>'openingHours', s.opening_hours), 120),
      status = COALESCE(NULLIF(p_payload->>'status', ''), s.status),
      published = CASE WHEN p_payload ? 'verified' THEN (p_payload->>'verified')::boolean ELSE s.published END,
      updated_at = now() WHERE s.id = path_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    IF p_payload ? 'verified' THEN
      UPDATE public.partner_claims SET state = CASE WHEN (p_payload->>'verified')::boolean THEN 'verified' ELSE 'pending' END,
        verified_at = CASE WHEN (p_payload->>'verified')::boolean THEN now() ELSE NULL END WHERE listing_id = path_id;
      IF (p_payload->>'verified')::boolean THEN
        INSERT INTO public.partner_claims (user_id, role, listing_id, state, verified_at)
        SELECT s.owner_user_id, 'grocery', s.id, 'verified', now() FROM public.grocery_stores s
        WHERE s.id = path_id AND s.owner_user_id IS NOT NULL
        ON CONFLICT (user_id, role, listing_id) DO UPDATE SET state = 'verified', verified_at = now();
      END IF;
    END IF;
    PERFORM public.gowayy_audit('admin.store.updated', 'grocery_stores', path_id, p_payload);
    RETURN jsonb_build_object('store', (SELECT public.gowayy_store_json(s) || jsonb_build_object('verified', s.published) FROM public.grocery_stores s WHERE s.id = path_id));

  ELSIF resource = 'categories' AND path_id IS NULL AND p_method = 'POST' THEN
    RETURN jsonb_build_object('category', public.rpc_partner_category_create(p_payload));

  ELSIF resource = 'categories' AND path_id IS NOT NULL AND p_method = 'PATCH' THEN
    UPDATE public.marketplace_categories c SET name = left(COALESCE(NULLIF(p_payload->>'name', ''), c.name), 60),
      active = COALESCE((p_payload->>'active')::boolean, c.active) WHERE c.id = path_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'CATEGORY_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    PERFORM public.gowayy_audit('admin.category.updated', 'marketplace_categories', path_id, p_payload);
    RETURN jsonb_build_object('category', (SELECT to_jsonb(c) FROM public.marketplace_categories c WHERE c.id = path_id));

  ELSIF resource = 'products' AND path_id IS NOT NULL AND p_method = 'PATCH' THEN
    IF NULLIF(p_payload->>'categoryId', '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.marketplace_categories c WHERE c.id = p_payload->>'categoryId') THEN
      RAISE EXCEPTION 'CATEGORY_NOT_FOUND' USING ERRCODE = '22023';
    END IF;
    UPDATE public.marketplace_products p SET active = COALESCE((p_payload->>'active')::boolean, p.active),
      published = COALESCE((p_payload->>'published')::boolean, p.published),
      featured = COALESCE((p_payload->>'featured')::boolean, p.featured),
      category_id = COALESCE(NULLIF(p_payload->>'categoryId', ''), p.category_id),
      category = COALESCE((SELECT c.name FROM public.marketplace_categories c WHERE c.id = p_payload->>'categoryId'), p.category), updated_at = now()
    WHERE p.id = path_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    PERFORM public.gowayy_audit('admin.product.updated', 'marketplace_products', path_id, p_payload);
    RETURN jsonb_build_object('product', public.gowayy_partner_product_json((SELECT p FROM public.marketplace_products p WHERE p.id = path_id)));

  ELSIF resource = 'payments' AND path_id IS NOT NULL AND action = 'refund' AND p_method = 'POST' THEN
    RETURN public.rpc_admin_refund_payment(path_id::uuid, COALESCE((p_payload->>'full')::boolean, true), COALESCE(p_payload->>'reason', 'Admin refund'));

  ELSIF resource = 'settlements' AND path_id IS NOT NULL AND action = 'pay' AND p_method = 'POST' THEN
    UPDATE public.settlements SET state = 'paid', paid_at = COALESCE(paid_at, now()) WHERE id = path_id::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'SETTLEMENT_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    PERFORM public.gowayy_audit('admin.settlement.paid', 'settlements', path_id, '{}'::jsonb);
    RETURN jsonb_build_object('settlement', (SELECT to_jsonb(s) FROM public.settlements s WHERE s.id = path_id::uuid));

  ELSIF resource = 'banners' AND path_id IS NULL AND p_method = 'POST' THEN
    new_id := 'bnr_' || gen_random_uuid()::text;
    IF NULLIF(btrim(p_payload->>'title'), '') IS NULL THEN RAISE EXCEPTION 'VALIDATION_FAILED: banner title is required' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.marketplace_banners (id, title, subtitle, href, image, active, order_index, start_at, end_at, destination_id)
    VALUES (new_id, left(p_payload->>'title', 80), left(COALESCE(p_payload->>'subtitle', ''), 160),
      left(COALESCE(NULLIF(p_payload->>'href', ''), '/'), 200), public.gowayy_image_value(p_payload->'image', p_payload->>'title'),
      COALESCE((p_payload->>'active')::boolean, true), COALESCE((p_payload->>'order')::integer, 0),
      NULLIF(p_payload->>'startAt', '')::timestamptz, NULLIF(p_payload->>'endAt', '')::timestamptz, NULLIF(p_payload->>'destinationId', ''));
    PERFORM public.gowayy_audit('admin.banner.created', 'marketplace_banners', new_id, '{}'::jsonb);
    RETURN jsonb_build_object('banner', (SELECT to_jsonb(b) FROM public.marketplace_banners b WHERE b.id = new_id));

  ELSIF resource = 'banners' AND path_id IS NOT NULL AND p_method IN ('PATCH','DELETE') THEN
    IF p_method = 'DELETE' THEN UPDATE public.marketplace_banners SET active = false, updated_at = now() WHERE id = path_id;
    ELSE UPDATE public.marketplace_banners SET title = left(COALESCE(NULLIF(p_payload->>'title', ''), title), 80),
      subtitle = left(COALESCE(p_payload->>'subtitle', subtitle), 160), href = left(COALESCE(NULLIF(p_payload->>'href', ''), href), 200),
      image = CASE WHEN p_payload ? 'image' THEN public.gowayy_image_value(p_payload->'image', title) ELSE image END,
      active = COALESCE((p_payload->>'active')::boolean, active), order_index = COALESCE((p_payload->>'order')::integer, order_index),
      start_at = COALESCE(NULLIF(p_payload->>'startAt', '')::timestamptz, start_at), end_at = COALESCE(NULLIF(p_payload->>'endAt', '')::timestamptz, end_at), updated_at = now() WHERE id = path_id; END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'BANNER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    PERFORM public.gowayy_audit('admin.banner.' || lower(p_method), 'marketplace_banners', path_id, '{}'::jsonb);
    RETURN CASE WHEN p_method = 'DELETE' THEN jsonb_build_object('deleted', true, 'deactivated', true)
      ELSE jsonb_build_object('banner', (SELECT to_jsonb(b) FROM public.marketplace_banners b WHERE b.id = path_id)) END;

  ELSIF resource = 'offers' AND path_id IS NOT NULL AND p_method = 'PATCH' THEN
    UPDATE public.marketplace_offers SET active = COALESCE((p_payload->>'active')::boolean, active) WHERE id = path_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'OFFER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    PERFORM public.gowayy_audit('admin.offer.updated', 'marketplace_offers', path_id, p_payload);
    RETURN jsonb_build_object('offer', public.gowayy_offer_json((SELECT o FROM public.marketplace_offers o WHERE o.id = path_id)));

  ELSIF resource = 'posters' AND path_id = 'reorder' AND p_method = 'POST' THEN
    WITH requested AS (SELECT value AS id, ordinality FROM jsonb_array_elements_text(COALESCE(p_payload->'ids', '[]'::jsonb)) WITH ORDINALITY)
    UPDATE public.posters p SET order_index = requested.ordinality FROM requested WHERE p.id = requested.id;
    RETURN jsonb_build_object('reordered', true);

  ELSIF resource = 'posters' AND path_id IS NULL AND p_method = 'POST' THEN
    new_id := 'pst_' || gen_random_uuid()::text;
    IF NULLIF(btrim(p_payload->>'title'), '') IS NULL OR p_payload->>'kind' NOT IN ('food','grocery') THEN RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.posters (id, kind, title, subtitle, cta, href, image, active, order_index, start_at, end_at)
    VALUES (new_id, p_payload->>'kind', left(p_payload->>'title', 100), NULLIF(p_payload->>'subtitle', ''), NULLIF(p_payload->>'cta', ''),
      left(COALESCE(NULLIF(p_payload->>'href', ''), '/'), 200), public.gowayy_image_value(p_payload->'image', p_payload->>'title'),
      COALESCE((p_payload->>'active')::boolean, true), COALESCE((p_payload->>'order')::integer, 0),
      NULLIF(p_payload->>'startAt', '')::timestamptz, NULLIF(p_payload->>'endAt', '')::timestamptz);
    PERFORM public.gowayy_audit('admin.poster.created', 'posters', new_id, '{}'::jsonb);
    RETURN jsonb_build_object('poster', (SELECT to_jsonb(p) FROM public.posters p WHERE p.id = new_id));

  ELSIF resource = 'posters' AND path_id IS NOT NULL AND p_method IN ('PATCH','DELETE') THEN
    IF p_method = 'DELETE' THEN UPDATE public.posters SET active = false WHERE id = path_id;
    ELSE UPDATE public.posters SET kind = COALESCE(NULLIF(p_payload->>'kind', ''), kind), title = left(COALESCE(NULLIF(p_payload->>'title', ''), title), 100),
      subtitle = COALESCE(p_payload->>'subtitle', subtitle), cta = COALESCE(p_payload->>'cta', cta), href = left(COALESCE(NULLIF(p_payload->>'href', ''), href), 200),
      image = CASE WHEN p_payload ? 'image' THEN public.gowayy_image_value(p_payload->'image', title) ELSE image END,
      active = COALESCE((p_payload->>'active')::boolean, active), order_index = COALESCE((p_payload->>'order')::integer, order_index),
      start_at = COALESCE(NULLIF(p_payload->>'startAt', '')::timestamptz, start_at), end_at = COALESCE(NULLIF(p_payload->>'endAt', '')::timestamptz, end_at) WHERE id = path_id; END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'POSTER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    PERFORM public.gowayy_audit('admin.poster.' || lower(p_method), 'posters', path_id, '{}'::jsonb);
    RETURN CASE WHEN p_method = 'DELETE' THEN jsonb_build_object('deleted', true, 'deactivated', true)
      ELSE jsonb_build_object('poster', (SELECT to_jsonb(p) FROM public.posters p WHERE p.id = path_id)) END;

  ELSIF resource = 'service-areas' AND path_id IS NULL AND p_method = 'POST' THEN
    new_id := 'area_' || gen_random_uuid()::text;
    IF NULLIF(btrim(p_payload->>'city'), '') IS NULL THEN RAISE EXCEPTION 'VALIDATION_FAILED: city is required' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.service_areas (id, city, state, food_pincodes, grocery_pincodes, active, delivery_note)
    VALUES (new_id, left(p_payload->>'city', 80), left(COALESCE(NULLIF(p_payload->>'state', ''), 'West Bengal'), 80),
      public.gowayy_pincodes(p_payload->'foodPincodes'), public.gowayy_pincodes(p_payload->'groceryPincodes'),
      COALESCE((p_payload->>'active')::boolean, true), NULLIF(p_payload->>'deliveryNote', ''));
    PERFORM public.gowayy_audit('admin.serviceArea.created', 'service_areas', new_id, '{}'::jsonb);
    RETURN jsonb_build_object('serviceArea', (SELECT to_jsonb(a) FROM public.service_areas a WHERE a.id = new_id));

  ELSIF resource = 'service-areas' AND path_id IS NOT NULL AND p_method IN ('PATCH','DELETE') THEN
    IF p_method = 'DELETE' THEN UPDATE public.service_areas SET active = false, updated_at = now() WHERE id = path_id;
    ELSE UPDATE public.service_areas SET city = left(COALESCE(NULLIF(p_payload->>'city', ''), city), 80), state = left(COALESCE(NULLIF(p_payload->>'state', ''), state), 80),
      food_pincodes = CASE WHEN p_payload ? 'foodPincodes' THEN public.gowayy_pincodes(p_payload->'foodPincodes') ELSE food_pincodes END,
      grocery_pincodes = CASE WHEN p_payload ? 'groceryPincodes' THEN public.gowayy_pincodes(p_payload->'groceryPincodes') ELSE grocery_pincodes END,
      delivery_note = COALESCE(p_payload->>'deliveryNote', delivery_note), active = COALESCE((p_payload->>'active')::boolean, active), updated_at = now() WHERE id = path_id; END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_AREA_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    PERFORM public.gowayy_audit('admin.serviceArea.' || lower(p_method), 'service_areas', path_id, '{}'::jsonb);
    RETURN CASE WHEN p_method = 'DELETE' THEN jsonb_build_object('deleted', true, 'deactivated', true)
      ELSE jsonb_build_object('serviceArea', (SELECT to_jsonb(a) FROM public.service_areas a WHERE a.id = path_id)) END;

  ELSIF resource = 'destinations' AND path_id IS NULL AND p_method = 'POST' THEN
    new_id := 'dst_' || gen_random_uuid()::text;
    IF NULLIF(btrim(p_payload->>'name'), '') IS NULL OR p_payload->'coords' IS NULL THEN RAISE EXCEPTION 'LOCATION_REQUIRED: name and coordinates are required' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.destinations (id, slug, name, region, summary, description, lat, lng, published, featured, display_order)
    VALUES (new_id, left(COALESCE(NULLIF(p_payload->>'slug', ''), trim(BOTH '-' FROM lower(regexp_replace(p_payload->>'name', '[^a-zA-Z0-9]+', '-', 'g')))), 80),
      left(p_payload->>'name', 80), left(COALESCE(NULLIF(p_payload->>'region', ''), 'Darjeeling Himalaya'), 80),
      left(COALESCE(p_payload->>'summary', ''), 240), left(COALESCE(p_payload->>'description', ''), 4000),
      (p_payload->'coords'->>'lat')::double precision, (p_payload->'coords'->>'lng')::double precision,
      COALESCE((p_payload->>'active')::boolean, true), COALESCE((p_payload->>'featured')::boolean, false), COALESCE((p_payload->>'order')::integer, 0));
    PERFORM public.gowayy_audit('admin.destination.created', 'destinations', new_id, '{}'::jsonb);
    RETURN jsonb_build_object('destination', public.gowayy_admin_destination_json((SELECT d FROM public.destinations d WHERE d.id = new_id)));

  ELSIF resource = 'destinations' AND path_id IS NOT NULL AND action IS NULL AND p_method IN ('PATCH','DELETE') THEN
    IF p_method = 'DELETE' THEN UPDATE public.destinations SET published = false, deleted_at = now(), updated_at = now() WHERE id = path_id;
    ELSE UPDATE public.destinations SET name = left(COALESCE(NULLIF(p_payload->>'name', ''), name), 80),
      slug = left(COALESCE(NULLIF(p_payload->>'slug', ''), slug), 80), region = left(COALESCE(NULLIF(p_payload->>'region', ''), region), 80),
      summary = left(COALESCE(p_payload->>'summary', summary), 240), description = left(COALESCE(p_payload->>'description', description), 4000),
      lat = COALESCE((p_payload->'coords'->>'lat')::double precision, lat), lng = COALESCE((p_payload->'coords'->>'lng')::double precision, lng),
      published = COALESCE((p_payload->>'active')::boolean, published), deleted_at = CASE WHEN (p_payload->>'active')::boolean THEN NULL ELSE deleted_at END,
      featured = COALESCE((p_payload->>'featured')::boolean, featured), display_order = COALESCE((p_payload->>'order')::integer, display_order), updated_at = now() WHERE id = path_id; END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'DESTINATION_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    PERFORM public.gowayy_audit('admin.destination.' || lower(p_method), 'destinations', path_id, '{}'::jsonb);
    RETURN CASE WHEN p_method = 'DELETE' THEN jsonb_build_object('deactivated', true)
      ELSE jsonb_build_object('destination', public.gowayy_admin_destination_json((SELECT d FROM public.destinations d WHERE d.id = path_id))) END;

  ELSIF resource = 'destinations' AND path_id IS NOT NULL AND action = 'images' AND p_method = 'POST' THEN
    v_image := public.gowayy_image_value(COALESCE(p_payload->'image', p_payload), 'Destination image');
    INSERT INTO public.destination_images (destination_id, status, asset_path, thumb_path, alt, credit, license, source_url, sort_order, is_primary)
    VALUES (path_id, 'verified', v_image->>'path', COALESCE(v_image->>'thumbPath', v_image->>'path'), left(COALESCE(v_image->>'alt', 'Destination image'), 180),
      v_image->>'credit', COALESCE(v_image->>'license', 'admin-provided'), v_image->>'sourceUrl',
      COALESCE((SELECT max(i.sort_order) + 1 FROM public.destination_images i WHERE i.destination_id = path_id), 0),
      NOT EXISTS (SELECT 1 FROM public.destination_images i WHERE i.destination_id = path_id AND i.status = 'verified' AND i.is_primary)) RETURNING id INTO new_uuid;
    PERFORM public.gowayy_audit('admin.destination.image.added', 'destination_images', new_uuid::text, jsonb_build_object('destinationId', path_id));
    RETURN jsonb_build_object('image', (SELECT to_jsonb(i) FROM public.destination_images i WHERE i.id = new_uuid),
      'destination', public.gowayy_admin_destination_json((SELECT d FROM public.destinations d WHERE d.id = path_id)));

  ELSIF resource = 'destinations' AND path_id IS NOT NULL AND action = 'images' AND extra IS NOT NULL AND p_method IN ('PATCH','DELETE') THEN
    IF p_method = 'DELETE' THEN
      UPDATE public.destination_images SET status = 'unavailable', is_primary = false WHERE id = extra::uuid AND destination_id = path_id;
    ELSE
      IF (p_payload->>'primary')::boolean THEN UPDATE public.destination_images SET is_primary = false WHERE destination_id = path_id; END IF;
      IF p_payload ? 'order' THEN
        SELECT sort_order INTO v_old FROM public.destination_images WHERE id = extra::uuid AND destination_id = path_id;
        v_new := greatest(1, (p_payload->>'order')::integer);
        IF v_old IS NOT NULL AND v_new < v_old THEN
          UPDATE public.destination_images SET sort_order = sort_order + 1 WHERE destination_id = path_id AND id <> extra::uuid AND sort_order >= v_new AND sort_order < v_old;
        ELSIF v_old IS NOT NULL AND v_new > v_old THEN
          UPDATE public.destination_images SET sort_order = sort_order - 1 WHERE destination_id = path_id AND id <> extra::uuid AND sort_order > v_old AND sort_order <= v_new;
        END IF;
      END IF;
      UPDATE public.destination_images i SET alt = left(COALESCE(p_payload->>'alt', i.alt), 180),
        asset_path = CASE WHEN p_payload ? 'path' THEN public.gowayy_image_value(p_payload->'path', i.alt)->>'path' ELSE i.asset_path END,
        thumb_path = CASE WHEN p_payload ? 'path' THEN public.gowayy_image_value(p_payload->'path', i.alt)->>'path' ELSE i.thumb_path END,
        is_primary = COALESCE((p_payload->>'primary')::boolean, i.is_primary), sort_order = COALESCE(v_new, i.sort_order)
      WHERE i.id = extra::uuid AND i.destination_id = path_id;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'IMAGE_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    PERFORM public.gowayy_audit('admin.destination.image.' || lower(p_method), 'destination_images', extra, jsonb_build_object('destinationId', path_id));
    RETURN jsonb_build_object('destination', public.gowayy_admin_destination_json((SELECT d FROM public.destinations d WHERE d.id = path_id)));

  ELSIF resource = 'support' AND path_id IS NOT NULL AND p_method = 'PATCH' THEN
    UPDATE public.support_tickets SET status = COALESCE(NULLIF(p_payload->>'status', ''), status),
      resolution = left(COALESCE(p_payload->>'resolution', resolution), 1000), updated_at = now() WHERE id = path_id::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_NOT_FOUND' USING ERRCODE = '22023'; END IF;
    PERFORM public.gowayy_audit('admin.ticket.updated', 'support_tickets', path_id, p_payload);
    RETURN jsonb_build_object('ticket', (SELECT to_jsonb(t) FROM public.support_tickets t WHERE t.id = path_id::uuid));

  ELSIF resource = 'settings' AND p_method = 'PATCH' THEN
    v_services := COALESCE(public.gowayy_config('services'), '{}'::jsonb);
    IF p_payload ? 'services' THEN
      WITH allowed(key) AS (VALUES ('cab'),('shared_taxi'),('hotel'),('homestay'),('food'),('grocery'),('tourism'),('experience'),('package'),('marketplace'),('parcel'),('cod')),
        incoming AS (SELECT key, value FROM jsonb_each(p_payload->'services') WHERE key IN (SELECT key FROM allowed) AND jsonb_typeof(value) = 'boolean')
      SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_config FROM incoming;
      v_services := v_services || COALESCE(v_config, '{}'::jsonb);
      INSERT INTO public.app_config (key, value) VALUES ('services', v_services) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
    END IF;
    IF p_payload ? 'appConfig' THEN
      v_config := COALESCE(public.gowayy_config('app_public_config'), '{}'::jsonb) || jsonb_build_object(
        'supportEmail', COALESCE(p_payload->'appConfig'->>'supportEmail', public.gowayy_config('app_public_config')->>'supportEmail'),
        'announcement', COALESCE(p_payload->'appConfig'->>'announcement', public.gowayy_config('app_public_config')->>'announcement'),
        'maintenance', COALESCE((p_payload->'appConfig'->>'maintenance')::boolean, (public.gowayy_config('app_public_config')->>'maintenance')::boolean, false),
        'commissionPercent', greatest(0, least(40, COALESCE((p_payload->'appConfig'->>'commissionPercent')::numeric, (public.gowayy_config('app_public_config')->>'commissionPercent')::numeric, 15))));
      INSERT INTO public.app_config (key, value) VALUES ('app_public_config', v_config) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
    END IF;
    PERFORM public.gowayy_audit('admin.settings.updated', 'app_config', 'public', jsonb_build_object('services', v_services));
    RETURN public.rpc_admin_read('settings', '{}'::jsonb);
  END IF;
  RAISE EXCEPTION 'NOT_FOUND: unknown admin mutation % %', p_method, p_path USING ERRCODE = '22023';
END $$;

REVOKE ALL ON FUNCTION public.rpc_admin_write(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_write(text, text, jsonb) TO authenticated;
