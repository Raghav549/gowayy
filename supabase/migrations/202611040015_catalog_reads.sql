-- Public, data-driven storefront and destination read models.

CREATE OR REPLACE FUNCTION public.gowayy_marketplace_product_json(p public.marketplace_products)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'storeId', p.store_id, 'brand', p.brand,
    'name', p.name, 'category', p.category, 'categoryId', p.category_id,
    'dataClass', p.data_class, 'description', p.description,
    'highlights', p.highlights, 'highlightsNote', p.highlights_note,
    'specifications', p.specifications, 'inTheBox', p.in_the_box,
    'warranty', p.warranty, 'faq', p.faq, 'deliveryNote', p.delivery_note,
    'active', p.active, 'published', p.published, 'featured', p.featured,
    'tags', p.tags, 'couponEligible', p.coupon_eligible,
    'pricePaise', (SELECT v.price_paise FROM public.product_variants v WHERE v.product_id = p.id ORDER BY v.position, v.created_at LIMIT 1),
    'mrpPaise', (SELECT v.mrp_paise FROM public.product_variants v WHERE v.product_id = p.id ORDER BY v.position, v.created_at LIMIT 1),
    'stockQuantity', COALESCE((SELECT sum(v.stock)::integer FROM public.product_variants v WHERE v.product_id = p.id), 0),
    'variants', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', v.id, 'label', v.label, 'pricePaise', v.price_paise,
        'mrpPaise', v.mrp_paise, 'stock', v.stock) ORDER BY v.position, v.created_at)
      FROM public.product_variants v WHERE v.product_id = p.id), '[]'::jsonb),
    'images', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'status', i.status, 'path', i.asset_path, 'assetPath', i.asset_path,
        'alt', i.alt, 'credit', i.credit, 'license', i.license,
        'sourceUrl', i.source_url, 'verificationNote', i.verification_note) ORDER BY i.position)
      FROM public.product_images i WHERE i.product_id = p.id), '[]'::jsonb),
    'protectionPlans', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', pl.id, 'provider', pl.provider, 'demo', pl.demo, 'title', pl.title,
        'pricePaise', pl.price_paise, 'mrpPaise', pl.mrp_paise,
        'perMonthPaise', pl.per_month_paise, 'coverage', pl.coverage,
        'terms', pl.terms, 'exclusions', pl.exclusions) ORDER BY pl.id)
      FROM public.protection_plans pl WHERE pl.product_id = p.id AND pl.active), '[]'::jsonb),
    'store', (SELECT jsonb_build_object('id', s.id, 'name', s.name, 'logo', s.logo)
              FROM public.grocery_stores s WHERE s.id = p.store_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.gowayy_store_json(s public.grocery_stores)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', s.id, 'slug', s.id, 'name', s.name, 'description', s.description,
    'destinationId', s.destination_id, 'categoryId', s.category_id,
    'categoryName', COALESCE(s.category_name, (SELECT p.category FROM public.marketplace_products p WHERE p.store_id = s.id ORDER BY p.created_at LIMIT 1), 'Store'),
    'address', s.address, 'phone', s.phone, 'openingHours', s.opening_hours,
    'openingHoursVerified', s.opening_hours_verified,
    'deliveryCoverageKm', s.delivery_radius_km, 'slots', s.delivery_slots,
    'logo', s.logo, 'banner', s.banner,
    'image', COALESCE(s.banner, s.logo, s.image, (SELECT jsonb_build_object('status', i.status, 'path', i.asset_path, 'assetPath', i.asset_path, 'alt', i.alt)
      FROM public.product_images i JOIN public.marketplace_products p ON p.id = i.product_id
      WHERE p.store_id = s.id AND i.status = 'verified' ORDER BY i.position LIMIT 1)),
    'status', s.status, 'published', s.published,
    'productCount', (SELECT count(*)::integer FROM public.marketplace_products p
                     WHERE p.store_id = s.id AND p.active AND p.published AND p.deleted_at IS NULL)
  );
$$;

CREATE OR REPLACE FUNCTION public.gowayy_offer_json(o public.marketplace_offers)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', o.id, 'scope', o.scope, 'productIds', o.product_ids,
    'categoryIds', o.category_ids, 'storeId', o.store_id, 'title', o.title,
    'code', o.code, 'kind', o.kind, 'value', o.value,
    'maxDiscountPaise', o.max_discount_paise, 'minOrderPaise', o.min_order_paise,
    'startAt', o.start_at, 'endAt', o.end_at, 'usageLimit', o.usage_limit,
    'usedCount', o.used_count, 'active', o.active
  );
$$;

CREATE OR REPLACE FUNCTION public.rpc_commerce_categories()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH categories AS (
    SELECT 'core'::text AS id, 'All essentials'::text AS name, 'core'::text AS slug, 0 AS position
    UNION ALL
    SELECT c.id, c.name, c.slug, 1 FROM public.marketplace_categories c WHERE c.active
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'slug', c.slug,
    'count', (SELECT count(*)::integer FROM public.marketplace_products p
              WHERE p.active AND p.published AND p.deleted_at IS NULL
                AND (c.id = 'core' OR p.category_id = c.id OR lower(p.category) = lower(c.name))),
    'productCount', (SELECT count(*)::integer FROM public.marketplace_products p
              WHERE p.active AND p.published AND p.deleted_at IS NULL
                AND (c.id = 'core' OR p.category_id = c.id OR lower(p.category) = lower(c.name)))
  ) ORDER BY c.position, c.name), '[]'::jsonb)
  FROM categories c;
$$;

CREATE OR REPLACE FUNCTION public.rpc_commerce_products(p_category text DEFAULT NULL, p_q text DEFAULT NULL, p_store text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(public.gowayy_marketplace_product_json(p) ORDER BY p.featured DESC, p.created_at DESC), '[]'::jsonb)
  FROM public.marketplace_products p
  LEFT JOIN public.marketplace_categories mc ON mc.id = p.category_id
  WHERE p.active AND p.published AND p.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.grocery_stores s WHERE s.id = p.store_id AND s.published AND s.status = 'active' AND s.deleted_at IS NULL)
    AND (p_category IS NULL OR p_category = '' OR p_category = 'core'
         OR p.category_id = p_category OR p.category ILIKE p_category OR mc.slug = p_category)
    AND (p_store IS NULL OR p_store = '' OR p.store_id = p_store)
    AND (p_q IS NULL OR btrim(p_q) = '' OR
         (p.name || ' ' || p.brand || ' ' || p.category || ' ' || COALESCE(p.tags::text, '')) ILIKE '%' || btrim(p_q) || '%');
$$;

CREATE OR REPLACE FUNCTION public.rpc_recommended_stores()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(public.gowayy_store_json(s) ORDER BY s.name), '[]'::jsonb)
  FROM public.grocery_stores s
  WHERE s.deleted_at IS NULL AND s.published AND s.status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.rpc_banners()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', b.id, 'title', b.title, 'subtitle', b.subtitle, 'href', b.href,
    'image', b.image, 'order', b.order_index) ORDER BY b.order_index, b.created_at), '[]'::jsonb)
  FROM public.marketplace_banners b
  WHERE b.active AND (b.start_at IS NULL OR b.start_at <= now())
    AND (b.end_at IS NULL OR b.end_at >= now());
$$;

CREATE OR REPLACE FUNCTION public.rpc_posters(p_kind text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH items AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'kind', p.kind, 'title', p.title, 'subtitle', p.subtitle,
      'cta', p.cta, 'href', p.href, 'image', p.image, 'order', p.order_index
    ) ORDER BY p.order_index, p.created_at), '[]'::jsonb) AS value
    FROM public.posters p
    WHERE p.active AND (p_kind IS NULL OR p_kind = '' OR p.kind = p_kind)
      AND (p.start_at IS NULL OR p.start_at <= now()) AND (p.end_at IS NULL OR p.end_at >= now())
  ) SELECT jsonb_build_object(
    'items', items.value,
    'grocery', COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(items.value) x WHERE x->>'kind' = 'grocery'), '[]'::jsonb),
    'food', COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(items.value) x WHERE x->>'kind' = 'food'), '[]'::jsonb)
  ) FROM items;
$$;

CREATE OR REPLACE FUNCTION public.rpc_storefront()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'banners', public.rpc_banners(),
    'categories', public.rpc_commerce_categories(),
    'stores', public.rpc_recommended_stores(),
    'featuredProducts', COALESCE((SELECT jsonb_agg(public.gowayy_marketplace_product_json(p) ORDER BY p.created_at DESC)
      FROM (SELECT * FROM public.marketplace_products WHERE active AND published AND featured AND deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM public.grocery_stores s WHERE s.id = marketplace_products.store_id AND s.published AND s.status = 'active' AND s.deleted_at IS NULL)
        ORDER BY created_at DESC LIMIT 8) p), '[]'::jsonb),
    'newProducts', COALESCE((SELECT jsonb_agg(public.gowayy_marketplace_product_json(p) ORDER BY p.created_at DESC)
      FROM (SELECT * FROM public.marketplace_products WHERE active AND published AND deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM public.grocery_stores s WHERE s.id = marketplace_products.store_id AND s.published AND s.status = 'active' AND s.deleted_at IS NULL)
        ORDER BY created_at DESC LIMIT 6) p), '[]'::jsonb),
    'offers', COALESCE((SELECT jsonb_agg(public.gowayy_offer_json(o) ORDER BY o.created_at DESC)
      FROM public.marketplace_offers o WHERE o.active AND (o.start_at IS NULL OR o.start_at <= now())
        AND (o.end_at IS NULL OR o.end_at >= now())), '[]'::jsonb),
    'posters', public.rpc_posters() - 'items',
    'services', jsonb_build_object('food', true, 'grocery', true, 'marketplace', true,
      'cod', COALESCE(public.gowayy_config('service_cod'), 'true'::jsonb)),
    'appConfig', jsonb_build_object('maintenanceMode', COALESCE(public.gowayy_config('maintenance_mode'), 'false'::jsonb))
  );
$$;

CREATE OR REPLACE FUNCTION public.rpc_store_detail(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.grocery_stores%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.grocery_stores
  WHERE (id = p_slug OR id = 'str_' || p_slug) AND deleted_at IS NULL AND published AND status = 'active';
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN public.gowayy_store_json(s) || jsonb_build_object(
    'products', COALESCE((SELECT jsonb_agg(public.gowayy_marketplace_product_json(p) ORDER BY p.created_at DESC)
      FROM public.marketplace_products p WHERE p.store_id = s.id AND p.active AND p.published AND p.deleted_at IS NULL), '[]'::jsonb),
    'offers', COALESCE((SELECT jsonb_agg(public.gowayy_offer_json(o) ORDER BY o.created_at DESC)
      FROM public.marketplace_offers o WHERE o.active AND (o.scope = 'platform' OR (o.scope = 'store' AND o.store_id = s.id)
        OR (o.scope = 'product' AND EXISTS (SELECT 1 FROM public.marketplace_products p WHERE p.store_id = s.id AND o.product_ids ? p.id))
        OR (o.scope = 'category' AND EXISTS (SELECT 1 FROM public.marketplace_products p WHERE p.store_id = s.id AND p.category_id IS NOT NULL AND o.category_ids ? p.category_id)))
        AND (o.start_at IS NULL OR o.start_at <= now()) AND (o.end_at IS NULL OR o.end_at >= now())), '[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.rpc_product_detail(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p public.marketplace_products%ROWTYPE; s public.grocery_stores%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.marketplace_products
  WHERE (slug = p_slug OR id = p_slug) AND active AND published AND deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.grocery_stores s WHERE s.id = marketplace_products.store_id AND s.published AND s.status = 'active' AND s.deleted_at IS NULL);
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO s FROM public.grocery_stores WHERE id = p.store_id;
  RETURN public.gowayy_marketplace_product_json(p) || jsonb_build_object(
    'store', public.gowayy_store_json(s),
    'relatedProducts', COALESCE((SELECT jsonb_agg(public.gowayy_marketplace_product_json(r) ORDER BY r.created_at DESC)
      FROM (SELECT * FROM public.marketplace_products WHERE id <> p.id AND store_id = p.store_id
            AND active AND published AND deleted_at IS NULL
            AND (category_id IS NOT DISTINCT FROM p.category_id OR category = p.category)
            ORDER BY created_at DESC LIMIT 8) r), '[]'::jsonb),
    'offers', COALESCE((SELECT jsonb_agg(public.gowayy_offer_json(o) ORDER BY o.created_at DESC)
      FROM public.marketplace_offers o WHERE o.active
        AND (o.scope = 'platform' OR (o.scope = 'store' AND o.store_id = p.store_id)
             OR (o.scope = 'product' AND o.product_ids ? p.id)
             OR (o.scope = 'category' AND p.category_id IS NOT NULL AND o.category_ids ? p.category_id))
        AND (o.start_at IS NULL OR o.start_at <= now()) AND (o.end_at IS NULL OR o.end_at >= now())), '[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.rpc_service_areas()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id, 'city', a.city, 'state', a.state,
    'foodPincodes', to_jsonb(a.food_pincodes), 'groceryPincodes', to_jsonb(a.grocery_pincodes)
  ) ORDER BY a.city), '[]'::jsonb)
  FROM public.service_areas a WHERE a.active;
$$;

CREATE OR REPLACE FUNCTION public.gowayy_destination_json(d public.destinations)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', d.id, 'slug', d.slug, 'name', d.name, 'region', d.region,
    'state', d.state, 'country', d.country, 'coords', jsonb_build_object('lat', d.lat, 'lng', d.lng),
    'coordinateAccuracy', d.coordinate_accuracy, 'elevationM', d.elevation_m,
    'elevationVerified', d.elevation_verified, 'description', d.description,
    'bestSeason', d.best_season, 'estimatedVisitHours', d.estimated_visit_hours,
    'hiddenGem', d.hidden_gem, 'activities', to_jsonb(d.activities),
    'accessibility', d.accessibility, 'safety', d.safety, 'weatherNote', d.weather_note,
    'sources', d.sources, 'infoStatus', d.info_status, 'order', d.display_order,
    'images', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', i.id, 'status', i.status, 'path', i.asset_path, 'assetPath', i.asset_path,
      'thumbPath', i.thumb_path, 'alt', i.alt, 'credit', i.credit,
      'license', i.license, 'sourceUrl', i.source_url) ORDER BY i.sort_order)
      FROM public.destination_images i WHERE i.destination_id = d.id AND i.status = 'verified'), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.rpc_destinations()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(public.gowayy_destination_json(d) ORDER BY d.display_order, d.name), '[]'::jsonb)
  FROM public.destinations d WHERE d.published AND d.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.rpc_destination(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.gowayy_destination_json(d) FROM public.destinations d
  WHERE (d.slug = p_slug OR d.id = p_slug) AND d.published AND d.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.rpc_order_detail(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user(); result jsonb;
BEGIN
  SELECT to_jsonb(o) INTO result FROM public.customer_orders o WHERE o.id = p_id AND o.user_id = u;
  IF result IS NULL THEN RETURN NULL; END IF;
  -- delivery_address remains text in the backwards-compatible view. Decode the
  -- marketplace JSON representation at the API boundary.
  IF result->>'service' = 'marketplace' THEN
    result := jsonb_set(result, '{delivery_address}', COALESCE((result->>'delivery_address')::jsonb, '{}'::jsonb));
  END IF;
  RETURN result;
END $$;
