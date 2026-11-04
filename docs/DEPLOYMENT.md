# Deployment — GOWAYY

Three web apps deploy to **Vercel** (one project per app), all three Android apps
produce downloadable APKs in **GitHub Actions** (EAS remains available for Play Store
AABs), and the backend runs on **Supabase** (PostgreSQL + PostGIS + Edge Functions).
CI/CD is GitHub Actions (`.github/workflows/`).

## 0. CI root-cause notes

- `[STATIC_BUILD_NO_OUT_DIR] No Output Directory named "dist"` (Vercel): `deploy-web.yml`
  now builds each Vite app in GitHub Actions, asserts `dist/index.html`, packages the
  files as Vercel Build Output API v3 (`.vercel/output/static`), and deploys with
  `vercel deploy --prebuilt`. Vercel no longer has to discover a nested monorepo `dist`
  directory during its remote static-build phase. `scripts/prepare-vercel-output.mjs`
  assembles the per-app output and SPA fallback.
- For any separate Vercel Git-connected/UI builds, set that project's Root Directory to
  its exact app web directory and clear Build & Development Settings overrides; those
  builds do not use the GitHub Action's prebuilt bypass.
- The former Three.js splash has been replaced with a lightweight split-color SVG logo
  reveal; unused Three.js and Expo GL dependencies and the dedicated Vite chunk were removed.
- Android builds stay EAS-only: `mobile-build.yml` runs Expo prebuild, typechecks and
  Android bundle exports on pushes/PRs; on `main` or manual dispatch it runs EAS
  `preview` builds, downloads the resulting APKs, validates ZIP integrity and uploads
  them as GitHub Actions artifacts.

Earlier workflow runs failed in the runner-provisioning step ("Set up job") and one action
slug (`actions/setup-deno`) did not exist. Repairs: `denoland/setup-deno@v1`, explicit
`permissions: contents: read` on every workflow, per-app mobile installs/typechecks in
CI, native Gradle APK builds, and explicit verification of the web output directories.

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

- **Root Directory for direct Vercel builds**: set each project to exactly one app web
  directory (`apps/gowayy-customer/web`, `apps/gowayy-partner/web`, or
  `apps/gowayy-explore/web`). Vercel resolves `outputDirectory: "dist"` relative to
  that directory. The GitHub production workflow now deploys Build Output API prebuilt
  bundles to avoid Vercel's nested-monorepo output-directory detection entirely.
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

Production deploys run on pushes to `main` via `.github/workflows/deploy-web.yml`. The workflow builds in GitHub Actions, checks each app's `dist/index.html`, assembles `.vercel/output`, and calls `vercel deploy --prebuilt --prod`. This is the reliable path that avoids Vercel's `[STATIC_BUILD_NO_OUT_DIR]` error for monorepo builds. Disable Vercel's separate Git auto-deploy trigger to avoid duplicate deployments; if retaining direct Vercel builds, use the exact per-app Root Directory above and remove conflicting Build & Development Settings overrides.

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

- `.github/workflows/mobile-build.yml` runs `native-check` (Expo prebuild, mobile
  typechecks and Android JS exports) on every push/PR. On pushes to `main` and on
  `workflow_dispatch`, it builds all three EAS `preview` APKs, downloads them, checks
  archive integrity, and uploads `gowayy-{customer,partner,explore}-android-apk`
  artifacts to the Actions run for 30 days. Download them from the workflow run's
  **Artifacts** section (`gowayy-customer-android-apk`, etc.). The cloud APK job
  requires the `EXPO_TOKEN` repository secret and a valid EAS project UUID in each
  app's `expo.extra.eas.projectId`; it does not need a local Android SDK or Gradle
  installation. The workflow checks the UUID configuration before starting paid cloud builds.
- EAS production profiles remain AABs for Google Play (`eas build --platform android --profile production`). EAS Update ships JS/asset-only changes per channel; native, SDK, and permission changes require a new EAS build — OTA never replaces a binary.

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

`deploy-web.yml` checks `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and all three
`VERCEL_PROJECT_*` secrets; if any are missing, deploys are skipped visibly and the
report step names them. `mobile-build.yml` always runs Expo validation/bundle checks;
its main/manual EAS APK job requires `EXPO_TOKEN` plus valid EAS project UUIDs and fails
with remediation if either is missing. The main `ci.yml` workflow (typecheck, tests, secret scan, web builds) remains
the strict gate on every PR.
