-- Payments, ledger, notifications, reviews, support and audit.
-- Client applications never write these tables directly: all writes are performed by
-- SECURITY DEFINER RPCs or verified payment webhooks.

CREATE TABLE IF NOT EXISTS public.payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id     uuid,
  booking_table  text CHECK (booking_table IN ('ride_bookings','hotel_bookings','experience_bookings','parcel_bookings')),
  order_id       uuid,
  order_table    text CHECK (order_table IN ('food_orders','grocery_orders')),
  method         text NOT NULL CHECK (method IN ('upi','upi_intent','gateway','cash')),
  status         text NOT NULL DEFAULT 'requires_action' CHECK (status IN ('requires_action','processing','captured','failed','refunded','partially_refunded')),
  amount_paise   integer NOT NULL CHECK (amount_paise >= 0),
  provider       text NOT NULL DEFAULT 'sandbox',
  provider_reference text,
  idempotency_key text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  CHECK (booking_id IS NOT NULL OR order_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS payments_user_idx ON public.payments (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id  uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('charge','refund','commission','settlement')),
  amount_paise integer NOT NULL,
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_payment_idx ON public.transactions (payment_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_webhook_once_idx
  ON public.transactions (note) WHERE note LIKE 'webhook:%';

CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_id    text PRIMARY KEY,
  provider    text NOT NULL DEFAULT 'sandbox',
  payload     jsonb NOT NULL,
  signature_verified boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.refunds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id  uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  amount_paise integer NOT NULL CHECK (amount_paise > 0),
  reason      text NOT NULL DEFAULT '',
  provider_reference text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refunds_payment_idx ON public.refunds (payment_id);

CREATE TABLE IF NOT EXISTS public.commissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id  uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  service     text NOT NULL,
  rate_percent numeric(5,2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent < 100),
  amount_paise integer NOT NULL CHECK (amount_paise >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.settlements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid NOT NULL REFERENCES public.profiles(id),
  payment_id  uuid NOT NULL REFERENCES public.payments(id),
  gross_paise integer NOT NULL,
  commission_paise integer NOT NULL,
  net_paise   integer NOT NULL,
  state       text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','paid','held')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS settlements_partner_idx ON public.settlements (partner_id, state);

CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  channel     text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','push')),
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key  text NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id  uuid NOT NULL,
  listing_id  text,
  rating      integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text NOT NULL DEFAULT '',
  source      text NOT NULL DEFAULT 'verified-booking',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id)
);
COMMENT ON TABLE public.reviews IS 'Only reviews tied to a real completed booking. No fabricated ratings exist.';
CREATE INDEX IF NOT EXISTS reviews_listing_idx ON public.reviews (listing_id) WHERE listing_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject     text NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 120),
  body        text NOT NULL CHECK (char_length(body) BETWEEN 3 AND 4000),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  booking_id  uuid,
  order_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON public.support_tickets (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.profiles(id),
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          bigserial PRIMARY KEY,
  actor_id    uuid,
  actor_role  text NOT NULL DEFAULT 'system',
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity, entity_id, created_at DESC);
