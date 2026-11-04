# Deployment — GOWAYY

Three web apps deploy to **Vercel** (one project per app), the customer Android app builds
with **EAS**, and the backend runs on **Supabase** (PostgreSQL + PostGIS + Edge Functions).
CI/CD is GitHub Actions (`.github/workflows/`).

## 1. Supabase (backend)

```bash
supabase login
supabase link --project-ref $SUPABASE_PROJECT_REF
supabase db push                 # applies supabase/migrations/*.sql in order
supabase db seed                 # optional: supabase/seed/*.sql (demo catalog)
supabase functions deploy gowayy-api
supabase functions deploy payment-webhook
```

Secrets (Supabase dashboard → Project settings → Edge Functions, **never in clients**):

| Secret | Purpose |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | public, safe for clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge functions only |
| `PAYMENT_WEBHOOK_SECRET` | HMAC verification of payment provider events |
| `JWT_SECRET` | Edge gateway token verification (Supabase JWT secret) |

RLS is enabled on every table; all mutations go through SECURITY DEFINER RPCs with
server-authoritative pricing, stock checks and idempotency.

## 2. Vercel — three web apps

Create three Vercel projects (one per app). For each project set:

- **Root Directory**: `apps/gowayy-customer/web` · `apps/gowayy-partner/web` · `apps/gowayy-explore/web`
- The per-app `vercel.json` in that directory handles install/build from the monorepo
  root (`npm ci` at root, `npm run build:<app>`, output `dist`), SPA rewrites, PWA
  headers and security headers.

GitHub secrets for `deploy-web.yml`:

| Secret | Value |
| --- | --- |
| `VERCEL_TOKEN` | Vercel access token |
| `VERCEL_ORG_ID` | team/org id |
| `VERCEL_PROJECT_CUSTOMER` / `VERCEL_PROJECT_PARTNER` / `VERCEL_PROJECT_EXPLORE` | the three project ids |

Environment variables per project (Vercel dashboard → Settings → Environment Variables):

| Variable | customer | partner | explore |
| --- | --- | --- | --- |
| `VITE_API_URL` | `https://<project>.supabase.co/functions/v1/gowayy-api` | same | same |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | public values | same | same |
| `VITE_GOWAYY_APP_URL` | — | — | URL of the customer app (booking handoff target) |

Deploys run on push to `main` via `.github/workflows/deploy-web.yml` (production).

## 3. EAS — customer Android app

```bash
cd apps/gowayy-customer/mobile
npm install
expo login                     # or EXPO_TOKEN in CI
eas build --platform android --profile production   # AAB for Play
eas build --platform android --profile preview      # internal APK
eas update --channel production                     # OTA JS-only updates (no native change)
```

- Profiles and OTA channels are in `apps/gowayy-customer/mobile/eas.json`
  (`development` / `preview` / `production`; runtimeVersion policy `appVersion`).
- `mobile-build.yml` builds the production AAB on pushes to `main` touching the mobile
  app or shared packages (secret: `EXPO_TOKEN`).
- EAS Update ships JS-only changes; any native/config change requires a new build.

## 4. Preview hosts

The sandbox preview proxy (`https://{port}-{sandbox}.e2b.app`) must be accepted by dev
servers: all Vite dev servers bind `0.0.0.0` and use relative `/api` URLs proxied to the
dev API — no `localhost` references in browser code.

## 5. Rollback

- Web: Vercel → Deployments → promote a previous production deployment.
- Mobile OTA: `eas update --channel production --republish` with the previous bundle,
  or roll back the channel to a previous update group.
- DB: migrations are append-only; roll back by restoring a Supabase backup
  (see `docs/BACKUP.md`).
