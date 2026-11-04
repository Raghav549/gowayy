# GOWAYY security

- **Authentication**: development API uses scrypt password hashing, opaque bearer
  sessions and server-side rate limits. Supabase mode uses Supabase Auth; passwords are
  never stored in GOWAYY tables (`profiles.auth_user_id` references `auth.users`).
- **Demo OTP**: explicitly labelled. It is not real email verification. The Supabase
  gateway only enables email delivery when `GOWAYY_EMAIL_PROVIDER_URL` is set; if no
  provider exists it deletes the provisional auth user and returns
  `EMAIL_PROVIDER_NOT_CONFIGURED` rather than pretending an email was sent.
- **Authorization**: RLS on every public table; `gowayy_owns_booking`,
  `gowayy_owns_payment`, partner-claim policies and owner-only notification policies.
  The Edge gateway re-verifies the caller JWT and never accepts a client-supplied user
  id for ownership decisions.
- **Secrets**: `SUPABASE_SERVICE_ROLE_KEY`, `GOWAYY_PAYMENT_WEBHOOK_SECRET` and provider
  credentials are server-side Edge Function secrets only. Client bundles contain at
  most the public anon key. `.gitignore` excludes `.env*`.
- **Payments**: client success is never trusted. `requires_action` persists until a
  signature-verified webhook capture. Refunds are computed on the server.
- **Validation**: Zod on every form (web/mobile), independent Zod validation in the
  Edge gateway, and SQL CHECK constraints / typed columns in PostgreSQL.
- **Audit**: `audit_logs` records auth, booking/order transitions, cancellations,
  payment events, partner claims and driver verification in both backends.
- **Privacy**: account deletion soft-deletes the GOWAYY profile and removes the
  Supabase auth user; support tickets, addresses and saved places are owner-scoped.
- **Uploads**: partner document uploads are intended for private Supabase Storage
  buckets with server-side permission checks; no public write policy is defined.
- **Known gaps**: no Supabase project has been deployed in this workspace, no real email
  OTP provider or payment gateway is configured, and PostGIS columns were not verified
  on a PostGIS-enabled instance. See `docs/PHASES.md`.
