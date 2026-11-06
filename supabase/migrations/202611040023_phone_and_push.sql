-- Supabase Auth phone OTP guards and durable native/browser push delivery.
-- Provider secrets stay in Edge Function environment variables. No OTP or push
-- delivery is considered successful merely because a database row exists.

CREATE TABLE IF NOT EXISTS public.phone_otp_requests (
  phone text PRIMARY KEY,
  last_requested_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.phone_otp_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.phone_otp_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_phone_otp_request_guard(p_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_phone text := btrim(COALESCE(p_phone, ''));
BEGIN
  IF v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'INVALID_PHONE: use an international number such as +919876543210' USING ERRCODE = '22023';
  END IF;
  PERFORM public.gowayy_rate_limit('phone-otp-request:' || v_phone, 5, 3600);
  IF EXISTS (SELECT 1 FROM public.phone_otp_requests WHERE phone = v_phone AND last_requested_at > now() - interval '60 seconds') THEN
    RAISE EXCEPTION 'OTP_RESEND_TOO_SOON: wait 60 seconds before requesting another code' USING ERRCODE = '42901';
  END IF;
  INSERT INTO public.phone_otp_requests (phone, last_requested_at) VALUES (v_phone, now())
  ON CONFLICT (phone) DO UPDATE SET last_requested_at = now();
  DELETE FROM public.phone_otp_requests WHERE last_requested_at < now() - interval '7 days';
  RETURN jsonb_build_object('accepted', true, 'resendAfterSeconds', 60);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_phone_otp_request_guard(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_phone_otp_verify_guard(p_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF btrim(COALESCE(p_phone, '')) !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'INVALID_PHONE: use an international number such as +919876543210' USING ERRCODE = '22023';
  END IF;
  PERFORM public.gowayy_rate_limit('phone-otp-verify:' || btrim(p_phone), 12, 3600);
  RETURN jsonb_build_object('accepted', true);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_phone_otp_verify_guard(text) TO anon, authenticated;

-- Called only after Supabase Auth verifies the SMS code and returns a session.
CREATE OR REPLACE FUNCTION public.rpc_finalize_phone_auth(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := NULLIF(p_payload->>'authUserId', '')::uuid;
  v_phone text := btrim(COALESCE(p_payload->>'phone', ''));
  v_first text := left(btrim(COALESCE(NULLIF(p_payload->>'firstName', ''), 'GOWAYY')), 60);
  v_last text := left(btrim(COALESCE(NULLIF(p_payload->>'lastName', ''), 'Customer')), 60);
  v_created boolean := false;
BEGIN
  IF v_user IS NULL OR v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'INVALID_PHONE_AUTH' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user) THEN
    RAISE EXCEPTION 'AUTH_USER_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  v_created := NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user);
  INSERT INTO public.profiles (id, first_name, last_name, phone)
  VALUES (v_user, v_first, v_last, v_phone)
  ON CONFLICT (id) DO UPDATE SET phone = excluded.phone, deleted_at = NULL;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user, 'customer') ON CONFLICT DO NOTHING;
  INSERT INTO public.notification_preferences (user_id) VALUES (v_user) ON CONFLICT DO NOTHING;
  IF v_created THEN
    PERFORM public.gowayy_notify(v_user, 'welcome', 'Welcome to GOWAYY', 'Your account is ready. Start a connected journey.', 'welcome:' || v_user::text);
  END IF;
  PERFORM public.gowayy_audit('auth.phone.verified', 'profiles', v_user::text, '{}'::jsonb);
  RETURN jsonb_build_object('userId', v_user, 'createdProfile', v_created);
END $$;
REVOKE ALL ON FUNCTION public.rpc_finalize_phone_auth(jsonb) FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  booking_updates boolean NOT NULL DEFAULT true,
  order_updates boolean NOT NULL DEFAULT true,
  payment_updates boolean NOT NULL DEFAULT true,
  partner_updates boolean NOT NULL DEFAULT true,
  marketing boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_preferences FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.device_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  installation_id text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('expo', 'web_push')),
  platform text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  token text NOT NULL,
  subscription jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, installation_id),
  UNIQUE (provider, token)
);
CREATE INDEX IF NOT EXISTS device_push_tokens_active_idx ON public.device_push_tokens (user_id, revoked_at) WHERE revoked_at IS NULL;
ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.device_push_tokens FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  token_id uuid NOT NULL REFERENCES public.device_push_tokens(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'retry', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, token_id)
);
CREATE INDEX IF NOT EXISTS push_deliveries_due_idx ON public.push_deliveries (status, next_attempt_at);
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_deliveries FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gowayy_push_category_allowed(p_type text, p_preferences public.notification_preferences)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_preferences.push_enabled AND CASE
    WHEN p_type LIKE 'payment.%' OR p_type LIKE 'refund.%' THEN p_preferences.payment_updates
    WHEN p_type LIKE 'order.%' OR p_type LIKE 'delivery.%' OR p_type LIKE 'restaurant.%' THEN p_preferences.order_updates
    WHEN p_type LIKE 'partner.%' THEN p_preferences.partner_updates
    WHEN p_type LIKE 'booking.%' OR p_type LIKE 'driver.%' OR p_type LIKE 'hotel.%' THEN p_preferences.booking_updates
    WHEN p_type LIKE 'marketing.%' THEN p_preferences.marketing
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.gowayy_queue_push_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.user_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.push_deliveries (notification_id, token_id, user_id)
  SELECT NEW.id, t.id, NEW.user_id
  FROM public.device_push_tokens t
  JOIN public.notification_preferences p ON p.user_id = t.user_id
  WHERE t.user_id = NEW.user_id AND t.revoked_at IS NULL
    AND public.gowayy_push_category_allowed(NEW.type, p)
  ON CONFLICT (notification_id, token_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notifications_queue_push ON public.notifications;
CREATE TRIGGER notifications_queue_push AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.gowayy_queue_push_delivery();

CREATE OR REPLACE FUNCTION public.rpc_register_push_token(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.gowayy_require_user();
  v_installation text := btrim(COALESCE(p_payload->>'installationId', ''));
  v_provider text := COALESCE(p_payload->>'provider', '');
  v_platform text := COALESCE(p_payload->>'platform', '');
  v_token text := btrim(COALESCE(p_payload->>'token', ''));
  v_subscription jsonb := COALESCE(p_payload->'subscription', '{}'::jsonb);
  v_row public.device_push_tokens%ROWTYPE;
BEGIN
  IF v_installation !~ '^[A-Za-z0-9._:-]{8,120}$' THEN RAISE EXCEPTION 'INVALID_INSTALLATION_ID' USING ERRCODE = '22023'; END IF;
  IF v_provider NOT IN ('expo', 'web_push') OR v_platform NOT IN ('android', 'ios', 'web') THEN
    RAISE EXCEPTION 'INVALID_PUSH_PROVIDER' USING ERRCODE = '22023';
  END IF;
  IF (v_provider = 'expo' AND v_platform = 'web') OR (v_provider = 'web_push' AND v_platform <> 'web') THEN
    RAISE EXCEPTION 'PUSH_PROVIDER_PLATFORM_MISMATCH' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_token) NOT BETWEEN 10 AND 4096 THEN RAISE EXCEPTION 'INVALID_PUSH_TOKEN' USING ERRCODE = '22023'; END IF;
  IF v_provider = 'expo' AND v_token !~ '^(ExponentPushToken|ExpoPushToken)\[[^]]+\]$' THEN
    RAISE EXCEPTION 'INVALID_EXPO_PUSH_TOKEN' USING ERRCODE = '22023';
  END IF;
  IF v_provider = 'web_push' AND (
    v_token !~ '^https://' OR jsonb_typeof(v_subscription) <> 'object'
    OR char_length(COALESCE(v_subscription->'keys'->>'auth', '')) < 8
    OR char_length(COALESCE(v_subscription->'keys'->>'p256dh', '')) < 16
  ) THEN RAISE EXCEPTION 'INVALID_WEB_PUSH_SUBSCRIPTION' USING ERRCODE = '22023'; END IF;

  -- A changed token replaces this installation; a token observed on a new
  -- installation is moved only to the currently authenticated account.
  UPDATE public.push_deliveries SET status = 'failed', last_error = 'Token replaced or unregistered', updated_at = now()
  WHERE token_id IN (SELECT id FROM public.device_push_tokens WHERE (user_id = v_user AND installation_id = v_installation) OR (provider = v_provider AND token = v_token))
    AND status IN ('pending', 'retry');
  DELETE FROM public.device_push_tokens WHERE (user_id = v_user AND installation_id = v_installation) OR (provider = v_provider AND token = v_token);
  INSERT INTO public.device_push_tokens (user_id, installation_id, provider, platform, token, subscription)
  VALUES (v_user, v_installation, v_provider, v_platform, v_token, v_subscription)
  RETURNING * INTO v_row;
  INSERT INTO public.notification_preferences (user_id) VALUES (v_user) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('id', v_row.id, 'installationId', v_row.installation_id, 'provider', v_row.provider, 'platform', v_row.platform, 'registered', true);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_register_push_token(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_unregister_push_token(p_installation_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := public.gowayy_require_user();
BEGIN
  UPDATE public.push_deliveries SET status = 'failed', last_error = 'Token unregistered', updated_at = now()
  WHERE token_id IN (SELECT id FROM public.device_push_tokens WHERE user_id = v_user AND installation_id = p_installation_id)
    AND status IN ('pending', 'retry');
  UPDATE public.device_push_tokens SET revoked_at = now(), updated_at = now()
  WHERE user_id = v_user AND installation_id = p_installation_id AND revoked_at IS NULL;
  RETURN jsonb_build_object('registered', false);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_unregister_push_token(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_notification_preferences(p_payload jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := public.gowayy_require_user();
  v_row public.notification_preferences%ROWTYPE;
  v_key text;
BEGIN
  INSERT INTO public.notification_preferences (user_id) VALUES (v_user) ON CONFLICT DO NOTHING;
  IF p_payload IS NOT NULL THEN
    FOR v_key IN SELECT jsonb_object_keys(p_payload) LOOP
      IF v_key NOT IN ('pushEnabled', 'bookingUpdates', 'orderUpdates', 'paymentUpdates', 'partnerUpdates', 'marketing')
        OR jsonb_typeof(p_payload->v_key) <> 'boolean' THEN
        RAISE EXCEPTION 'INVALID_NOTIFICATION_PREFERENCES' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    UPDATE public.notification_preferences SET
      push_enabled = COALESCE((p_payload->>'pushEnabled')::boolean, push_enabled),
      booking_updates = COALESCE((p_payload->>'bookingUpdates')::boolean, booking_updates),
      order_updates = COALESCE((p_payload->>'orderUpdates')::boolean, order_updates),
      payment_updates = COALESCE((p_payload->>'paymentUpdates')::boolean, payment_updates),
      partner_updates = COALESCE((p_payload->>'partnerUpdates')::boolean, partner_updates),
      marketing = COALESCE((p_payload->>'marketing')::boolean, marketing), updated_at = now()
    WHERE user_id = v_user;
  END IF;
  SELECT * INTO v_row FROM public.notification_preferences WHERE user_id = v_user;
  RETURN jsonb_build_object('pushEnabled', v_row.push_enabled, 'bookingUpdates', v_row.booking_updates,
    'orderUpdates', v_row.order_updates, 'paymentUpdates', v_row.payment_updates,
    'partnerUpdates', v_row.partner_updates, 'marketing', v_row.marketing, 'updatedAt', v_row.updated_at);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_notification_preferences(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_claim_push_deliveries(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  -- Recover work if a dispatcher exited after claiming but before finishing.
  UPDATE public.push_deliveries SET
    status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'retry' END,
    last_error = 'Dispatcher did not finish before the claim timeout', next_attempt_at = now(), updated_at = now()
  WHERE status = 'sending' AND updated_at < now() - interval '15 minutes';
  WITH due AS (
    SELECT d.id FROM public.push_deliveries d
    JOIN public.device_push_tokens t ON t.id = d.token_id
    WHERE d.status IN ('pending', 'retry') AND d.next_attempt_at <= now() AND d.attempts < 5 AND t.revoked_at IS NULL
    ORDER BY d.created_at FOR UPDATE OF d SKIP LOCKED LIMIT LEAST(GREATEST(p_limit, 1), 100)
  ), claimed AS (
    UPDATE public.push_deliveries d SET status = 'sending', attempts = d.attempts + 1, updated_at = now()
    FROM due WHERE d.id = due.id RETURNING d.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'notificationId', c.notification_id, 'tokenId', c.token_id, 'attempts', c.attempts,
    'provider', t.provider, 'platform', t.platform, 'token', t.token, 'subscription', t.subscription,
    'title', n.title, 'body', n.body, 'type', n.type, 'data', n.data
  )), '[]'::jsonb) INTO v_result
  FROM claimed c JOIN public.device_push_tokens t ON t.id = c.token_id JOIN public.notifications n ON n.id = c.notification_id;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.rpc_claim_push_deliveries(integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_finish_push_delivery(p_id uuid, p_outcome text, p_error text DEFAULT NULL, p_provider_message_id text DEFAULT NULL, p_revoke_token boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.push_deliveries%ROWTYPE;
BEGIN
  IF p_outcome NOT IN ('sent', 'retry', 'failed') THEN RAISE EXCEPTION 'INVALID_PUSH_OUTCOME' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_row FROM public.push_deliveries WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.status <> 'sending' THEN RAISE EXCEPTION 'PUSH_DELIVERY_NOT_CLAIMABLE' USING ERRCODE = '42501'; END IF;
  UPDATE public.push_deliveries SET
    status = CASE WHEN p_outcome = 'retry' AND v_row.attempts >= 5 THEN 'failed' ELSE p_outcome END,
    next_attempt_at = CASE WHEN p_outcome = 'retry' THEN now() + (LEAST(3600, 30 * power(2, GREATEST(v_row.attempts - 1, 0))) || ' seconds')::interval ELSE next_attempt_at END,
    last_error = left(COALESCE(p_error, ''), 1000), provider_message_id = COALESCE(p_provider_message_id, provider_message_id), updated_at = now()
  WHERE id = p_id;
  IF p_revoke_token THEN
    UPDATE public.device_push_tokens SET revoked_at = now(), updated_at = now() WHERE id = v_row.token_id;
    UPDATE public.push_deliveries SET status = 'failed', last_error = 'Provider reported an unregistered device', updated_at = now()
    WHERE token_id = v_row.token_id AND status IN ('pending', 'retry');
  END IF;
  RETURN jsonb_build_object('id', p_id, 'finished', true);
END $$;
REVOKE ALL ON FUNCTION public.rpc_finish_push_delivery(uuid, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
