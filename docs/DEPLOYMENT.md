# Deployment — GOWAYY

Three web apps deploy to **Vercel** (one project per app), the customer Android app builds
with **EAS**, and the backend runs on **Supabase** (PostgreSQL + PostGIS + Edge Functions).
CI/CD is GitHub Actions (`.github/workflows/`).

## 0. CI root-cause notes

- `[STATIC_BUILD_NO_OUT_DIR] No Output Directory named "dist"` (Vercel): the project
  Root Directory was not the app web dir. Fixed by the explicit per-app `vercel.json`
  contract above + `test -d` assertion in the build command.
- `Generated an empty chunk: "three"` (Vite): the shared root `vite.config.ts` listed
  `three` in `manualChunks`, but only the customer app imports three.js. The `three`
  chunk now lives only in `apps/gowayy-customer/web/vite.config.ts`.
- Partner/explore Android bundles failed with `Cannot find module 'babel-preset-expo'`:
  added `babel-preset-expo ~58.0.24` (SDK 58) to both apps' devDependencies.
- Android builds are never silently skipped: `mobile-build.yml` runs a `native-check`
  matrix job (prebuild + `expo export --platform android` + artifact upload) on every
  push/PR, and an `eas-build` matrix on main that FAILS with the exact remediation if
  `EXPO_TOKEN` is missing.

Earlier workflow runs failed in the runner-provisioning step ("Set up job") and one action
slug (`actions/setup-deno`) did not exist. Repairs: `denoland/setup-deno@v1`, explicit
`permissions: contents: read` on every workflow, per-app mobile installs/typechecks in
CI, and three EAS build jobs. All workflow steps are also run locally via `npm run verify`.

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
  (this is the exact fix for `[STATIC_BUILD_NO_OUT_DIR] No Output Directory named "dist"`:
  Vercel resolves `outputDirectory` relative to the project Root Directory, so the root
  must be the app dir — then `outputDirectory: "dist"` is `<app>/web/dist`, which is
  exactly where the build command emits it)
- **Framework preset**: Other (vercel.json sets `"framework": null`)
- **Install command** (in per-app `vercel.json`): `cd ../.. && npm ci --no-audit --no-fund`
- **Build command** (in per-app `vercel.json`): `cd ../.. && npm run build -w @gowayy/<app>-web && test -d apps/gowayy-<app>/web/dist`
  — the `test -d` makes a wrong root/output combination fail at build time with a clear
  message instead of a post-build Vercel error
- **Output directory**: `dist` (relative to the app web root), SPA rewrites, PWA and
  security headers are all in the per-app `vercel.json`.

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

## 3. EAS — three independent Android apps

Each app is its own EAS project with its own package id, icon, splash, versioning and
update channel:

| App | Directory | Android package | EAS slug | OTA channel |
| --- | --- | --- | --- | --- |
| GOWAYY | `apps/gowayy-customer/mobile` | `app.gowayy.customer` | `gowayy` | `production` |
| GOWAYY PARTNER | `apps/gowayy-partner/mobile` | `app.gowayy.partner` | `gowayy-partner` | `partner-production` |
| GOWAYY EXPLORE | `apps/gowayy-explore/mobile` | `app.gowayy.explore` | `gowayy-explore` | `explore-production` |

```bash
cd apps/gowayy-partner/mobile   # same pattern for customer/explore
npm install
eas build --platform android --profile production   # AAB for Play
eas build --platform android --profile preview      # internal APK
eas update --channel partner-production             # OTA JS-only updates (no native change)
```

- `mobile-build.yml` builds all three production AABs on pushes to `main` touching any
  mobile app or shared package (secret: `EXPO_TOKEN`; one Expo account, three projects).
- EAS Update ships JS/asset-only changes per channel; native/SDK/permission changes
  require a new EAS build and Play/internal distribution — OTA never replaces a binary.

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

## CI behaviour when deploy secrets are absent

`deploy-web.yml` and `mobile-build.yml` run a `preflight` job first. If any required
secret (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_*`, `EXPO_TOKEN`) is missing,
the deploy/build steps are skipped and a `report` step prints exactly which secrets are
missing — the skip is loud and visible in the run log, never silent or disguised as
success. The main `ci.yml` workflow (typecheck, 114 tests, secret scan, web builds) is
unaffected and remains the strict gate on every PR.
