-- Production-safe runtime defaults.
--
-- Migration 202611040007 seeded app_config with demo_mode = true so that a fresh
-- local database works out of the box. Nothing in the repository ever turned that
-- switch off, so a production Supabase project inherited development behaviour:
--
--   * rpc_register / rpc_resend_otp returned the live OTP in the API response
--     (demoOtp), letting anyone verify any email address without an inbox.
--   * rpc_claim_partner auto-approved partner claims to state = 'verified',
--     skipping document review.
--   * rpc_capture_sandbox_payment marked card / UPI / netbanking payments as
--     'captured' with no gateway transaction behind them.
--
-- app_config has Row Level Security enabled and no policies, so it cannot be read
-- or written by an anon or authenticated client. Only SECURITY DEFINER functions
-- see it, which makes it a safe place to hold this switch: a user cannot flip
-- demo mode back on from a browser.
--
-- This migration is additive and non-destructive. It changes configuration values
-- only; no table, column, policy or data row is dropped.

UPDATE public.app_config
   SET value = 'false'::jsonb, updated_at = now()
 WHERE key = 'demo_mode';

-- Honest labels until the owner configures real providers. rpc_init_payment copies
-- payment_provider onto the payments row, so leaving it as 'sandbox' would label
-- genuine production charges as sandbox traffic.
UPDATE public.app_config
   SET value = '"unconfigured"'::jsonb, updated_at = now()
 WHERE key = 'payment_provider';

UPDATE public.app_config
   SET value = '"provider_required"'::jsonb, updated_at = now()
 WHERE key = 'otp_mode';

-- Make the switch self-documenting from SQL, and refuse to hand back a live OTP
-- unless demo mode is genuinely enabled. rpc_register already gates demoOtp on
-- gowayy_demo_mode(); this view exposes the current posture for operators and for
-- the deployment checks in docs/PRODUCTION_CHECKLIST.md.
CREATE OR REPLACE VIEW public.gowayy_runtime_mode AS
SELECT
  public.gowayy_demo_mode()                                   AS demo_mode,
  public.gowayy_config('otp_mode')       #>> '{}'             AS otp_mode,
  public.gowayy_config('payment_provider') #>> '{}'           AS payment_provider,
  CASE WHEN public.gowayy_demo_mode()
    THEN 'DEVELOPMENT: demo OTP is returned to clients, partner claims auto-verify and sandbox payment capture is enabled.'
    ELSE 'PRODUCTION: demo adapters are disabled. An email provider and a payment gateway webhook are required.'
  END                                                         AS posture;

-- Views are not covered by the ENABLE ROW LEVEL SECURITY loop over pg_tables, so
-- lock this one down explicitly. It is readable only through a definer function
-- (gowayy_runtime_mode()) or by an operator in the SQL editor.
CREATE OR REPLACE FUNCTION public.gowayy_runtime_mode()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT to_jsonb(m) FROM public.gowayy_runtime_mode m;
$$;

GRANT EXECUTE ON FUNCTION public.gowayy_runtime_mode() TO anon, authenticated;
REVOKE ALL ON public.gowayy_runtime_mode FROM PUBLIC;

COMMENT ON VIEW public.gowayy_runtime_mode IS
  'Read-only summary of the demo/production posture. Re-enable development behaviour with: '
  'UPDATE public.app_config SET value = ''true''::jsonb WHERE key = ''demo_mode'';';
