-- Server-authorized admin read models and additive control-centre fields.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS partner_approval text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_status_check CHECK (account_status IN ('active','suspended'));
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_partner_approval_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_partner_approval_check CHECK (partner_approval IS NULL OR partner_approval IN ('unverified','pending','verified','rejected'));
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS resolution text;
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.service_areas ADD COLUMN IF NOT EXISTS delivery_note text;
ALTER TABLE public.marketplace_banners ADD COLUMN IF NOT EXISTS destination_id text REFERENCES public.destinations(id) ON DELETE SET NULL;
ALTER TABLE public.marketplace_banners ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE public.destination_images ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

INSERT INTO public.app_config (key, value) VALUES
  ('services', '{"cab":true,"shared_taxi":true,"hotel":true,"homestay":true,"food":true,"grocery":true,"tourism":true,"experience":true,"package":true,"marketplace":true,"parcel":true,"cod":true}'::jsonb),
  ('app_public_config', '{"supportEmail":"support@gowayy.app","announcement":"","maintenance":false,"commissionPercent":15}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.gowayy_admin_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u AND r.role = 'admin') THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED: administrator authorisation is required' USING ERRCODE = '42501';
  END IF;
  RETURN u;
END $$;

CREATE OR REPLACE FUNCTION public.gowayy_assert_active()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u uuid := public.gowayy_require_user();
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u AND (p.deleted_at IS NOT NULL OR p.account_status = 'suspended')) THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED: this account is not active' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.gowayy_admin_destination_json(d public.destinations)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.gowayy_destination_json(d) || jsonb_build_object(
    'summary', COALESCE(d.summary, left(d.description, 240)), 'active', d.published,
    'featured', d.featured, 'order', d.display_order,
    'images', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', i.id, 'status', i.status, 'path', i.asset_path, 'assetPath', i.asset_path,
      'thumbPath', i.thumb_path, 'alt', i.alt, 'credit', i.credit, 'license', i.license,
      'sourceUrl', i.source_url, 'primary', i.is_primary, 'order', i.sort_order)
      ORDER BY i.is_primary DESC, i.sort_order)
      FROM public.destination_images i WHERE i.destination_id = d.id AND i.status = 'verified'), '[]'::jsonb),
    'imagesVerified', (SELECT count(*)::integer FROM public.destination_images i WHERE i.destination_id = d.id AND i.status = 'verified'),
    'listings', (SELECT (SELECT count(*) FROM public.properties p WHERE p.destination_id = d.id) +
                        (SELECT count(*) FROM public.restaurants r WHERE r.destination_id = d.id) +
                        (SELECT count(*) FROM public.grocery_stores s WHERE s.destination_id = d.id AND s.deleted_at IS NULL))::integer
  );
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_read(p_resource text, p_query jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  admin uuid := public.gowayy_admin_id(); term text := lower(COALESCE(p_query->>'q', ''));
  v_service text := NULLIF(p_query->>'service', '');
BEGIN
  IF p_resource = 'overview' THEN
    RETURN jsonb_build_object(
      'totals', jsonb_build_object(
        'customers', (SELECT count(*)::integer FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id WHERE r.role = 'customer' AND p.deleted_at IS NULL),
        'partners', (SELECT count(DISTINCT r.user_id)::integer FROM public.user_roles r WHERE r.role IN ('restaurant','grocery','seller','property','tour_operator','driver')),
        'activePartners', (SELECT count(DISTINCT r.user_id)::integer FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id WHERE r.role IN ('restaurant','grocery','seller','property','tour_operator','driver') AND p.account_status = 'active' AND p.deleted_at IS NULL),
        'pendingApprovals', (SELECT count(DISTINCT c.user_id)::integer FROM public.partner_claims c WHERE c.state = 'pending'),
        'stores', (SELECT count(*)::integer FROM public.grocery_stores s WHERE s.deleted_at IS NULL),
        'properties', (SELECT count(*)::integer FROM public.properties p WHERE p.deleted_at IS NULL),
        'products', (SELECT count(*)::integer FROM public.marketplace_products p WHERE p.deleted_at IS NULL),
        'orders', (SELECT count(*)::integer FROM public.customer_orders),
        'bookings', (SELECT count(*)::integer FROM public.customer_bookings),
        'revenuePaise', COALESCE((SELECT sum(p.amount_paise)::bigint FROM public.payments p WHERE p.status = 'captured'), 0),
        'refundsPaise', COALESCE((SELECT abs(sum(t.amount_paise))::bigint FROM public.transactions t WHERE t.type = 'refund'), 0),
        'openTickets', (SELECT count(*)::integer FROM public.support_tickets t WHERE t.status = 'open')),
      'recentActivity', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
        SELECT a.id, a.action, COALESCE(au.email, a.actor_role) AS actor, a.metadata AS meta, a.created_at
        FROM public.audit_logs a LEFT JOIN auth.users au ON au.id = a.actor_id ORDER BY a.created_at DESC LIMIT 12) x), '[]'::jsonb),
      'recentOrders', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.customer_orders ORDER BY created_at DESC LIMIT 5) x), '[]'::jsonb),
      'serviceAvailability', COALESCE(public.gowayy_config('services'), '{}'::jsonb));

  ELSIF p_resource = 'customers' THEN
    RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (
      SELECT p.id, p.first_name, p.last_name, p.first_name || ' ' || p.last_name AS name,
        au.email, COALESCE((SELECT jsonb_agg(r.role) FROM public.user_roles r WHERE r.user_id = p.id), '[]'::jsonb) AS roles,
        p.created_at, p.account_status AS status,
        (SELECT count(*)::integer FROM public.customer_orders o WHERE o.user_id = p.id) AS orders,
        (SELECT count(*)::integer FROM public.customer_bookings b WHERE b.user_id = p.id) AS bookings,
        COALESCE((SELECT sum(pay.amount_paise)::bigint FROM public.payments pay WHERE pay.user_id = p.id AND pay.status = 'captured'), 0) AS spend_paise,
        (SELECT count(*)::integer FROM public.support_tickets t WHERE t.user_id = p.id) AS tickets
      FROM public.profiles p JOIN auth.users au ON au.id = p.id
      WHERE p.deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'customer')
        AND (term = '' OR lower(p.first_name || ' ' || p.last_name || ' ' || COALESCE(au.email, '')) LIKE '%' || term || '%')) x), '[]'::jsonb));

  ELSIF p_resource = 'partners' THEN
    RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (
      SELECT p.id, p.first_name || ' ' || p.last_name AS name, au.email,
        COALESCE((SELECT jsonb_agg(r.role) FROM public.user_roles r WHERE r.user_id = p.id AND r.role IN ('restaurant','grocery','seller','property','tour_operator','driver')), '[]'::jsonb) AS roles,
        pp.business_name, pp.phone,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('role', c.role, 'listingId', c.listing_id, 'claimedAt', c.created_at, 'state', c.state)) FROM public.partner_claims c WHERE c.user_id = p.id), '[]'::jsonb) AS claims,
        COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.partner_documents d WHERE d.user_id = p.id), '[]'::jsonb) AS documents,
        (SELECT jsonb_build_object('verification', d.verification, 'online', d.online) FROM public.drivers d WHERE d.user_id = p.id) AS driver,
        COALESCE(p.partner_approval, CASE WHEN EXISTS (SELECT 1 FROM public.partner_claims c WHERE c.user_id = p.id AND c.state = 'verified') THEN 'verified'
          WHEN EXISTS (SELECT 1 FROM public.partner_claims c WHERE c.user_id = p.id) THEN 'pending' ELSE 'unverified' END) AS approval,
        p.account_status AS status, p.created_at,
        (SELECT count(*)::integer FROM public.customer_orders o WHERE EXISTS (SELECT 1 FROM public.partner_claims c WHERE c.user_id = p.id AND c.listing_id = o.listing_id)) AS orders
      FROM public.profiles p JOIN auth.users au ON au.id = p.id
      LEFT JOIN public.partner_profiles pp ON pp.user_id = p.id
      WHERE p.deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role IN ('restaurant','grocery','seller','property','tour_operator','driver'))
        AND (term = '' OR lower(p.first_name || ' ' || p.last_name || ' ' || COALESCE(au.email, '')) LIKE '%' || term || '%')) x), '[]'::jsonb));

  ELSIF p_resource = 'stores' THEN
    RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(public.gowayy_store_json(s) || jsonb_build_object(
      'verified', EXISTS (SELECT 1 FROM public.partner_claims c WHERE c.listing_id = s.id AND c.state = 'verified'),
      'ownerUserId', s.owner_user_id) ORDER BY s.created_at DESC)
      FROM public.grocery_stores s WHERE s.deleted_at IS NULL), '[]'::jsonb));

  ELSIF p_resource = 'categories' THEN
    RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'image', COALESCE(c.image->>'path', c.image->>'assetPath', c.image #>> '{}'),
      'productCount', (SELECT count(*)::integer FROM public.marketplace_products p WHERE p.category_id = c.id)) ORDER BY c.name)
      FROM public.marketplace_categories c), '[]'::jsonb));

  ELSIF p_resource = 'products' THEN
    RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(public.gowayy_partner_product_json(p) || jsonb_build_object(
      'stock', COALESCE((SELECT v.stock FROM public.product_variants v WHERE v.product_id = p.id ORDER BY v.position LIMIT 1), 0)) ORDER BY p.created_at DESC)
      FROM public.marketplace_products p WHERE p.deleted_at IS NULL), '[]'::jsonb));

  ELSIF p_resource = 'orders' THEN
    RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(o) || jsonb_build_object(
      'deliveryVerification', jsonb_build_object('required', true, 'verified', o.delivery_verified)) ORDER BY o.created_at DESC)
      FROM public.customer_orders o WHERE v_service IS NULL OR o.service = v_service), '[]'::jsonb));

  ELSIF p_resource = 'bookings' THEN
    RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC) FROM public.customer_bookings b), '[]'::jsonb));

  ELSIF p_resource = 'payments' THEN
    RETURN jsonb_build_object(
      'items', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC) FROM public.payments p), '[]'::jsonb),
      'transactions', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC) FROM public.transactions t), '[]'::jsonb),
      'reconciliation', jsonb_build_object(
        'capturedPaise', COALESCE((SELECT sum(amount_paise)::bigint FROM public.payments WHERE status = 'captured'), 0),
        'refundedPaise', COALESCE((SELECT abs(sum(amount_paise))::bigint FROM public.transactions WHERE type = 'refund'), 0),
        'pendingPaise', COALESCE((SELECT sum(amount_paise)::bigint FROM public.payments WHERE status = 'requires_action'), 0)));

  ELSIF p_resource = 'settlements' THEN
    RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (
      SELECT s.id, s.partner_id AS user_id, au.email AS partner, s.net_paise AS amount_paise,
        s.gross_paise, s.commission_paise, s.state AS status, s.created_at, s.paid_at
      FROM public.settlements s LEFT JOIN auth.users au ON au.id = s.partner_id) x), '[]'::jsonb),
      'commissionPercent', COALESCE((public.gowayy_config('app_public_config')->>'commissionPercent')::numeric, 15));

  ELSIF p_resource = 'banners' THEN
    RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(b) || jsonb_build_object(
      'image', COALESCE(b.image->>'path', b.image->>'assetPath', b.image #>> '{}'), 'order', b.order_index) ORDER BY b.order_index, b.created_at)
      FROM public.marketplace_banners b), '[]'::jsonb));

  ELSIF p_resource = 'offers' THEN
    RETURN jsonb_build_object(
      'items', COALESCE((SELECT jsonb_agg(public.gowayy_offer_json(o) ORDER BY o.created_at DESC) FROM public.marketplace_offers o), '[]'::jsonb),
      'coupons', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', c.code, 'description', c.kind || ' discount', 'active', c.active)) FROM public.coupons c), '[]'::jsonb));

  ELSIF p_resource = 'posters' THEN
    RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('order', p.order_index) ORDER BY p.order_index, p.created_at) FROM public.posters p), '[]'::jsonb));

  ELSIF p_resource = 'service-areas' THEN
    RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.city) FROM public.service_areas a), '[]'::jsonb));

  ELSIF p_resource = 'destinations' THEN
    RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(public.gowayy_admin_destination_json(d) ORDER BY d.display_order, d.name) FROM public.destinations d WHERE d.deleted_at IS NULL), '[]'::jsonb));

  ELSIF p_resource = 'support' THEN
    RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(t) || jsonb_build_object('customerEmail', au.email) ORDER BY t.created_at DESC)
      FROM public.support_tickets t LEFT JOIN auth.users au ON au.id = t.user_id), '[]'::jsonb));

  ELSIF p_resource = 'audit' THEN
    RETURN jsonb_build_object('items', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT a.id, a.action, COALESCE(au.email, a.actor_role) AS actor, a.metadata AS meta, a.created_at
      FROM public.audit_logs a LEFT JOIN auth.users au ON au.id = a.actor_id
      WHERE term = '' OR lower(a.action || ' ' || COALESCE(au.email, '') || ' ' || a.actor_role) LIKE '%' || term || '%'
      ORDER BY a.created_at DESC LIMIT 300) x), '[]'::jsonb));

  ELSIF p_resource = 'analytics' THEN
    RETURN jsonb_build_object(
      'days', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.date) FROM (
        SELECT d.day::date AS date,
          (SELECT count(*)::integer FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id WHERE r.role = 'customer' AND p.created_at::date = d.day::date) AS customers,
          (SELECT count(DISTINCT r.user_id)::integer FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id WHERE r.role IN ('restaurant','grocery','seller','property','tour_operator','driver') AND p.created_at::date = d.day::date) AS partners,
          (SELECT count(*)::integer FROM public.customer_orders o WHERE o.created_at::date = d.day::date) AS orders,
          (SELECT count(*)::integer FROM public.customer_bookings b WHERE b.created_at::date = d.day::date) AS bookings,
          COALESCE((SELECT sum(p.amount_paise)::bigint FROM public.payments p WHERE p.status = 'captured' AND p.updated_at::date = d.day::date), 0) AS revenue_paise
        FROM generate_series(current_date - 13, current_date, interval '1 day') d(day)) x), '[]'::jsonb),
      'byService', COALESCE((SELECT jsonb_object_agg(service, value) FROM (
        SELECT service, jsonb_build_object('count', count(*), 'valuePaise', sum(total_paise)) AS value
        FROM (SELECT service, total_paise FROM public.customer_orders UNION ALL SELECT service, total_paise FROM public.customer_bookings) all_records
        GROUP BY service) x), '{}'::jsonb),
      'byDestination', COALESCE((SELECT jsonb_object_agg(name, count) FROM (
        SELECT COALESCE(d.name, 'Unassigned') AS name, count(*)::integer AS count
        FROM public.customer_bookings b LEFT JOIN public.journeys j ON j.id = b.journey_id LEFT JOIN public.destinations d ON d.id = j.destination_id
        GROUP BY COALESCE(d.name, 'Unassigned')) x), '{}'::jsonb));

  ELSIF p_resource = 'settings' THEN
    RETURN jsonb_build_object('services', COALESCE(public.gowayy_config('services'), '{}'::jsonb),
      'appConfig', COALESCE(public.gowayy_config('app_public_config'), '{}'::jsonb));
  END IF;
  RAISE EXCEPTION 'NOT_FOUND: unknown admin read resource %', p_resource USING ERRCODE = '22023';
END $$;

REVOKE ALL ON FUNCTION public.rpc_admin_read(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_read(text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.gowayy_assert_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gowayy_assert_active() TO authenticated;
