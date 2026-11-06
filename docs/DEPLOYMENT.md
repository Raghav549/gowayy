# Deployment — GOWAYY

The three Vite web apps deploy independently to three Vercel projects. The three native Android apps are generated from Expo prebuild and built as Gradle APKs directly on GitHub-hosted runners; no EAS account/build, Expo token, or paid build service is used. Supabase remains the hosted backend.

## CI and root causes addressed

- **Android:** the former workflow generated Android source and JS bundles, then attempted EAS builds that failed when `EXPO_TOKEN` was absent. The current workflow runs `expo prebuild` on a clean runner and `./gradlew assembleDebug` for PR/branch verification or signed `assembleRelease` on `main`. Each app is isolated in a non-fail-fast matrix job, its APK is inspected for package/version/signature and uploaded separately. Main-branch builds publish one app-specific GitHub Release.
- **Vercel `STATIC_BUILD_NO_OUT_DIR`:** each project must use its app's exact web root (`apps/gowayy-customer/web`, `apps/gowayy-partner/web`, or `apps/gowayy-admin/web`). The app-local `vercel.json` writes Vite output to `dist` relative to that root. The previous commands used `cd ../..`, which lands in `apps/`, not the repository root; workspace install/build commands now use `cd ../../..`. They verify the matching app's `dist/index.html`. Production deploys assemble `.vercel/output` for only that app and deploy via `vercel --prebuilt`; a root/output smoke test then checks the app-specific title and SPA deep link.
- **Web app selection and status:** CI builds each web app in a separate matrix job and verifies its assets. Vercel production deployments use a separate Vercel project ID for each app. Missing Vercel credentials now fail the production workflow visibly instead of making the run green after skipping all deployments.
- **Android versioning:** on each workflow run, the APK's version name is `0.1.0+build.<run_number>` and its integer version code is `100000 + run_number`. Package IDs remain `app.gowayy.customer`, `app.gowayy.partner`, and `app.gowayy.admin`. The package and signing certificate are both checked by Android's installer before it will replace an installed app.

## 1. Vercel — three independent web apps

Create three Vercel projects and configure each project's **Root Directory** exactly as below. Do not set the repository root as one app's project root and do not point multiple projects at the same `dist` directory.

| App | Root Directory | Workspace | Vercel output directory | Title smoke test |
| --- | --- | --- | --- | --- |
| Customer | `apps/gowayy-customer/web` | `@gowayy/customer-web` | `dist` | `GOWAYY — Connected Journeys` |
| Admin | `apps/gowayy-admin/web` | `@gowayy/admin-web` | `dist` | `GOWAYY Admin — Operations console` |
| Partner | `apps/gowayy-partner/web` | `@gowayy/partner-web` | `dist` | `GOWAYY PARTNER — Grow your business` |

Use the **Vite** framework preset. Keep each app's committed `vercel.json` install/build/output settings; remove conflicting dashboard command/output overrides. Its monorepo install command changes to the repository root, runs `npm ci`, and the build command builds exactly one workspace before checking the app-local output. SPA rewrites route browser deep links to that app's own `index.html`. Production GitHub deploys link and pull environment for only the matrix row's Vercel project, assemble that app's files, then deploy and smoke-test `/` and a deep path.

Required GitHub Actions secrets:

| Secret | Purpose |
| --- | --- |
| `VERCEL_TOKEN` | Vercel CLI authentication |
| `VERCEL_ORG_ID` | Vercel account/team id |
| `VERCEL_PROJECT_CUSTOMER` | Customer project id |
| `VERCEL_PROJECT_ADMIN` | Admin console project id |
| `VERCEL_PROJECT_PARTNER` | Partner project id |

Required production environment variables in **each** Vercel project:

| Variable | Value |
| --- | --- |
| `VITE_GOWAYY_BACKEND` | `supabase` |
| `VITE_SUPABASE_URL` | Public Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Public Supabase anon key; never use a service-role key |

The workflow pulls the project's production environment and fails before build if the Supabase backend selector/URL/anon key are missing. Do not use the obsolete `VITE_API_URL`; the API client reads the names above (and `VITE_API_BASE_URL` only for direct HTTP transport configuration).

Additional variables for the development/HTTP backend and payment work:

| Variable | Where | Purpose |
| --- | --- | --- |
| `GOWAYY_PAYMENT_PROVIDER` | API/Edge | `razorpay` for the implemented live Edge adapter; `sandbox` only for labelled development |
| `GOWAYY_RAZORPAY_KEY_ID`, `GOWAYY_RAZORPAY_KEY_SECRET` | Supabase Edge secrets | Server-side Razorpay order/refund calls; never put the secret in Vite/Expo variables |
| `GOWAYY_PAYMENT_GATEWAY_KEY` | Development API only | Legacy configuration gate, not a live gateway integration; card/net-banking remain unavailable without a real adapter |
| `GOWAYY_PAYMENT_WEBHOOK_SECRET` | API/Edge | HMAC secret for signed payment callbacks |
| `GOWAYY_OTP_PROVIDER` | API | `demo` in development; a real email provider in production |
| `EXPO_PUBLIC_ADMIN_URL` | Admin Android build | HTTPS URL of the deployed admin console loaded by the APK shell |

Production deploy workflow: `.github/workflows/deploy-web.yml`; clean build/output test: `.github/workflows/ci.yml`. Disable Vercel Git auto-deploy if you want GitHub Actions to be the only production deployment path; otherwise a Vercel Git build may duplicate an Actions deploy.

## 2. Native Android — direct Gradle APKs from GitHub Actions

Each project builds from its app directory after clean dependency installation and Expo prebuild. `mobile-build.yml` always runs three independent, non-fail-fast APK jobs for each qualifying push, pull request, or manual run; path detection is used only to decide which app-specific releases to publish. Pull requests and non-production branches produce installable debug APK artifacts for all three apps. Pushes to `main` produce signed release APK artifacts for all three; only the changed app(s) (or all apps on manual dispatch) get a new independent GitHub Release with their APK and update metadata. Shared packages, backend-connected modules, brand assets, and build scripts mark all apps affected. Release tags are `android-customer-build-N`, `android-admin-build-N`, and `android-partner-build-N`; no app publishes another app's package or release.

### Signing identity (required before the first main-branch release)

Release builds fail clearly unless the following **GitHub Actions repository secrets** are configured. Use one private keystore consistently for all three distinct application IDs (or adjust the workflow to use per-app keystores). Never commit the keystore, passwords, or generated APK signing material.

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Create a private release key in a secure environment, retain a separate encrypted backup, and add the key as a repository secret. Example (replace the alias and output path; do not commit the file):

```bash
keytool -genkeypair -v -keystore gowayy-release.keystore -storetype PKCS12 \
  -alias gowayy-release -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 gowayy-release.keystore | gh secret set ANDROID_KEYSTORE_BASE64
# Set the three passwords/alias interactively or with your secret-management process.
```

The workflow decodes the secret only to the ephemeral runner's temp directory, validates the alias, passes credentials to Gradle through environment variables, then runs `apksigner verify`. Replacing/loss of this key prevents updates to previously installed release packages. Debug APKs from separate runners are for testing only and are not an update identity.

### App metadata and release update flow

| App | Android app directory | Application ID | Release metadata asset |
| --- | --- | --- | --- |
| Customer | `apps/gowayy-customer/mobile` | `app.gowayy.customer` | `gowayy-customer-update.json` |
| Admin | `apps/gowayy-admin/mobile` | `app.gowayy.admin` | WebView shell — set `EXPO_PUBLIC_ADMIN_URL` |
| Partner | `apps/gowayy-partner/mobile` | `app.gowayy.partner` | `gowayy-partner-update.json` |

Each app's independent **App updates** screen queries public GitHub Releases and only accepts its own tag prefix, package ID and metadata asset. It shows the available version and notes, downloads with byte progress, checks APK size and checksum, and opens Android's package installer using a content URI. Android verifies package ID and signing certificate. Android 8+ requires the user to enable “Allow from this source” in the app's install permission settings and confirm installation; the app never installs silently. A successful package update retains app data, login state and app-private settings according to Android's package-update rules.

A release version changes on each production workflow run (including shared-code changes). App source changes select only that app; `packages/**`, `apps/dev-api/**`, Supabase API/schema changes, shared brand assets and build scripts select all three. `workflow_dispatch` builds all three. Artifact names are `gowayy-customer-android-apk`, `gowayy-admin-android-apk`, and `gowayy-partner-android-apk`.

## 3. Build and verification commands

```bash
npm ci --no-audit --no-fund
npm ci --prefix apps/gowayy-customer/mobile --no-audit --no-fund
npm ci --prefix apps/gowayy-admin/mobile --no-audit --no-fund
npm ci --prefix apps/gowayy-partner/mobile --no-audit --no-fund
npm run build -w @gowayy/customer-web
npm run build -w @gowayy/admin-web
npm run build -w @gowayy/partner-web
node scripts/verify-web-output.mjs customer
node scripts/verify-web-output.mjs admin
node scripts/verify-web-output.mjs partner
```

The GitHub Android workflow is the native Gradle build pipeline. All three apps use Expo SDK 57 with React Native 0.86.3, which compiles against the stable Android API 36 / Build Tools 36.0.0 and NDK 27.1.12297006. This version pin is intentional: Expo SDK 58's Android dependencies require API 37, but the hosted runner's SDK manager cannot install the API 37 platform, and compiling those libraries against API 36 fails Android AAR metadata validation. `npx expo prebuild --platform android --clean --no-install` regenerates ignored native sources; Gradle then runs `assembleDebug` or `assembleRelease`.

## 4. Preview hosts

Vite development servers bind to `0.0.0.0`, allow the Arena preview origin, and proxy `/api` to the development backend. Browser-facing code does not call browser-localhost to reach another service.

## 5. Rollback

- Web: Vercel → Deployments → promote the prior deployment in that app's own project.
- Android: publish a higher versionCode release signed with the same key; Android does not support downgrading a package in place. Revert code and release a new build.
- Database: migrations are append-only; restore from a Supabase backup (see `docs/BACKUP.md`).
