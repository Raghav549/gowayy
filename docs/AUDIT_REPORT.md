# GOWAYY — Implementation, Verification and Production Readiness Report

**Date:** 2026-11-06  
**Baseline:** `3e3ee61e81f8e09278aa10dbf92313903b66c5b5` (`main`)  
**Working branch:** `arena/17a93e84-gowayy`  
**Deployment:** **not performed**. No production project, credentials, Auth users, payments, emails, push messages or bank payouts were claimed or created.

## 1. Executive status

This was an implementation pass, not an audit-only exercise. The branch contains responsive Customer/Partner/Admin corrections, a real host-offering/slot/booking slice, server-scoped Partner fulfilment, Admin RPC read/write paths, commerce/checkout fixes, upload validation, payment/refund orchestration, persistent payout requests, database migrations, and a secure owner-account provisioner.

**Production readiness: NOT YET READY.** Repository-level web/API/SQL checks and real Chromium responsive checks are green, but a hosted Supabase project was not available, live third-party delivery was not tested, Android device runs were not possible, the complete push-delivery architecture is not implemented, and the dependency audit still reports advisories requiring planned major upgrades.

## 2. Implemented and tested

### Customer and shared UI

- Preserved the purple/lavender and gold identity, logos, typography and imagery.
- Removed the requested descriptive copy and consolidated competing product/store search controls into the shared `UniversalSearch` flow while retaining PIN serviceability and category filters.
- Corrected responsive grids, card boundaries, `min-width: 0`, text wrapping/clamping, product imagery/fallbacks, authentication widths, navigation spacing and safe-area behaviour in the existing styles rather than replacing the brand layout.
- Fixed long search-result rows escaping their cards at 360 px, made the home banner image cover the full desktop banner, and escaped invalid SVG ampersands that prevented three poster images from decoding.
- Kept navigation reachable and content clear of fixed navigation in the implemented web shells; the shared Partner/top-bar shell now retains GOWAYY branding on mobile.
- Checkout and payment UI distinguishes provider confirmation from a browser return; it does not turn a redirect into a successful payment.

**Evidence:** root TypeScript, unit/web-flow tests, all three production builds, and real Chromium viewport checks in §4.

### Real local experiences and packages

- Added verified-host offering reads, host identity, owned schedules, future slots, remaining capacity, server quotes and guest-answer validation to both HTTP and Supabase transports.
- Replaced the static/basic interaction with a four-step Customer flow: selection, booking details, review and saved confirmation.
- Added Partner offering details, visibility, schedule creation, capacity display and deactivation. Property-only users do not receive tour management access.
- Booking rechecks slot state/capacity under a database row lock, scopes idempotency to the customer, persists a reference, and creates customer/host notifications. Requested/confirmed/completed bookings consume capacity; cancellation releases it.
- No host offerings or slots were seeded to make the UI look populated. Empty states remain honest.
- Experience payment capture resolves `partner_tours.user_id`; host earnings, payout requests, refund reversals and replay behaviour are covered by SQL runtime tests.

**Evidence:** HTTP host lifecycle/capacity/isolation/ownership tests and SQL quote/package/booking/capture/refund/payout tests.

### Partner, commerce and authorization

- Partner inbox, overview, booking/order transitions and delivery verification now derive access from actual tour ownership, verified property/store claims, direct store ownership, or accepted driver assignment—not role membership alone.
- Customers may cancel eligible records but cannot advance Partner fulfilment. Unrelated accounts are denied even if they hold every demo Partner role.
- Store creation/update, logos, banners, product records and scoped offers persist. Direct owners and verified claimants can manage stores; unrelated Partners cannot.
- Added authenticated image upload checks for MIME allow-list, byte limit and magic bytes; uploaded bytes are retrievable with `nosniff` in the HTTP adapter.
- Pending/paused/unverified stores and their products/offers no longer leak through storefront, search, direct product URLs, cart, checkout, wishlist, recently viewed or public coupons.
- Checkout is user-idempotent, rejects mixed-store carts, validates coupon scope at quote and checkout, and increments offer usage only after order creation.
- Earnings cover actual assigned/owned services and per-service commission rates. Per-payment settlement rows are separate from persistent payout requests.
- A refund creates a unique reversing ledger entry per original settlement/refund pair. Unpaid affected payout batches are cancelled and unlinked for recalculation; replay cannot duplicate reversals.

**Evidence:** 29 HTTP integration tests and SQL marketplace/payment/experience scope tests.

### Admin and backend

- Added server-authorized Admin read/write RPC paths and corrected the Admin Supabase wrapper so it does not call a nonexistent nested Edge URL.
- Admin navigation reaches the implemented control-centre sections.
- Added a runtime test that calls all 19 Admin read resources and verifies non-admin denial.
- Aligned the development Admin overview audit entries with Supabase's `createdAt` contract, fixing `Invalid Date` in recent activity; an HTTP regression test now validates every returned timestamp.
- Added production-safe defaults: demo OTP, sandbox capture and demo Partner verification are refused when demo mode is off.
- Added address/payment/order fixes, scoped transitions, catalogue read models, Storage bucket provisioning and upload handling.

### Secure initial owner provisioning

`scripts/provision-owner-accounts.mjs` and `npm run provision:owners`:

- require environment-supplied Supabase URL, anon key, service-role key, three emails and three strong passwords;
- validate every account before creating any of them;
- create or find real Supabase Auth users without resetting an existing password;
- upsert profiles and assign `customer`, `seller` and `admin` roles;
- verify an actual password session for each user;
- never print/write passwords, service keys or access tokens.

**Evidence:** two mocked API-contract unit tests. **No live owner account has been created**; live execution awaits the owner's project and secrets.

## 3. Database migrations added

| Migration | Purpose |
| --- | --- |
| `202611040013_production_defaults.sql` | Production-safe demo/payment/OTP defaults |
| `202611040014_schema_and_ordering.sql` | Missing commerce/control-centre fields and relationships |
| `202611040015_catalog_reads.sql` | Server catalogue/store/product/destination read models |
| `202611040016_checkout.sql` | Server-priced idempotent checkout, coverage, scoped discounts and payment availability |
| `202611040017_partner_operations.sql` | Partner store/catalogue/offer/inventory operations |
| `202611040018_admin_reads.sql` | Authorized Admin read models and additive fields |
| `202611040019_admin_writes.sql` | Authorized Admin mutations |
| `202611040020_storage.sql` | `gowayy-images` bucket limits and allowed image MIME types |
| `202611040021_addresses_and_payments.sql` | Addresses, capture/refund/payment persistence and provider operations |
| `202611040022_experience_booking.sql` | Host offerings/slots/quotes/bookings, scoped fulfilment/inbox, host credit, payout requests and refund reversals |

The migration series was executed against embedded PostgreSQL/PGlite, including the generated seed. It was **not** applied to a hosted Supabase project.

## 4. Exact verification results

| Check | Actual result |
| --- | --- |
| `npm run verify` | **Passed end to end** after installing each mobile app's own locked dependencies |
| `npm run typecheck` | Passed, 0 TypeScript errors |
| `npm run typecheck:mobile` | Passed after `npm ci --prefix apps/gowayy-customer/mobile` |
| `npm run typecheck:partner-mobile` | Passed after `npm ci --prefix apps/gowayy-partner/mobile` |
| `npm run typecheck:admin-mobile` | Passed after `npm ci --prefix apps/gowayy-admin/mobile` |
| `npm test` | **73 passed, 5 skipped**; 9 files passed, 2 skipped |
| `npm run test:integration` | **29/29 passed** against real HTTP servers and isolated persistent databases |
| `npm run test:supabase` | **25/25 passed** against PGlite migrations and generated seed |
| `npm run test:edge` | Deno checks passed for both functions/tests; **5/5 tests passed** |
| `npm run scan:secrets` | Passed; **194 source files, 0 high-confidence credential patterns** |
| `npm run build:all` | Passed: Customer **1717**, Partner **1667**, Admin **1647** modules |
| `verify-web-output.mjs customer/partner/admin` | All 3 passed; app-local `dist/index.html`, referenced bundles and SPA fallback verified |
| Real Chromium responsive/auth checks | **104/104 passed**, 0 browser console/page errors; exact scope below |
| Owner provisioner contract tests | **2/2 passed** with mocked fetch; no live Supabase claim |
| `npm audit` | **9 advisories remain**: 5 moderate, 2 high, 2 critical |

The browser result comprises **101 viewport snapshots plus 3 fresh-launch checks**. Viewports were 360, 390, 430, 768, 1024, 1366 and 1920 px. Customer login/register/forgot, home, food, booking details and booking review ran at all seven sizes; Customer categories/search and Partner manage ran at representative mobile/tablet/desktop sizes; Customer confirmation/checkout ran at four and Admin partner verification at five representative sizes; Partner login/home and Admin login/overview ran at all seven. All three splash screens exited correctly on a fresh 390 px launch. Checks covered document overflow, requested-image decoding, off-viewport controls, intended navigation and duplicate search inputs, followed by manual screenshot inspection of booking, search, home, Partner and Admin layouts. The flow used the real local HTTP API with an isolated `/tmp` database and explicitly created development-only offerings/slots; no visual fixtures were added to production seeds. Temporary Chromium tooling was removed with `npm ci` after the run.

Skipped unit tests remain the pre-existing `customer-live-render.test.tsx` (4) and `marketplace-e2e.test.ts` (1). JSDOM emits known React Router future-flag and unimplemented `window.scrollTo` warnings without failing tests. There is no repository lint script, so no ESLint result is claimed.

A transient test-run environment issue removed npm workspace links; `npm install` restored them without a dependency-manifest/lockfile change, after which the complete HTTP suite passed. This was not counted as an application failure.

## 5. Remaining work and external blocks

| Area | Status | What remains |
| --- | --- | --- |
| Hosted Supabase | **Awaiting credentials / external verification** | Link a real project, apply migrations, create the Storage bucket, deploy functions and run hosted smoke/RLS checks |
| Email OTP | **Implemented provider hook, awaiting provider** | Configure a real `GOWAYY_EMAIL_PROVIDER_URL`, verify delivery/expiry/resend/rate limits; no live email was sent |
| Phone OTP | **Not implemented end to end** | Select/configure an SMS provider and add the complete phone enrollment/verification flow; no SMS success is simulated |
| Razorpay | **Implemented server adapter, awaiting credentials** | Configure keys/webhook and verify live order, captured/failed payment and processed/failed refund events with provider test credentials |
| Push notifications | **Partially implemented** | In-app history/read state and native permission/token collection exist; server token registry, refresh, preferences, provider dispatch, retries and browser push are not complete |
| Maps/geocoding | **Partially implemented** | Existing coordinates/manual location and estimates remain; configure a real geocoding/map provider and verify it. No API key was invented |
| Background tracking | **Not implemented** | Add only with a justified driver use case, consent, Android permissions and policy review |
| Actual payout execution | **Not implemented** | Persistent payout requests/ledger reconciliation exist; bank transfers and paid-state reconciliation require a finance/provider workflow |
| Browser responsive verification | **Implemented and tested for the documented web flows** | 104 real Chromium checks passed at the required widths; this does not prove every possible screen, Firefox/Safari, installed PWA or native-device behaviour |
| Android APK/AAB and devices | **Blocked by missing SDK/device** | Mobile TypeScript passes, but Java, Android SDK, `adb` and emulator/device are absent. No APK, signing, installation or physical-device claim |
| Hosted Storage | **Awaiting Supabase** | HTTP upload validation/retrieval passed; hosted bucket upload/public-read smoke remains pending |
| Dependency security | **Partially implemented / planned upgrade required** | Available audit fixes require major Vite/Vitest, React Router and Zod migrations. Do not use `npm audit fix --force` without a separate regression plan |
| Admin native shell | **Partial native architecture** | Admin Android remains a WebView shell around the deployed Admin app; it is not a fully native independent Admin UI |

## 6. Required credentials and environment variables

### Public web (each Vercel project)

```text
VITE_GOWAYY_BACKEND=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

### Supabase Edge secrets (server only)

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GOWAYY_EMAIL_PROVIDER_URL
GOWAYY_PAYMENT_PROVIDER=razorpay
GOWAYY_RAZORPAY_KEY_ID
GOWAYY_RAZORPAY_KEY_SECRET
GOWAYY_PAYMENT_WEBHOOK_SECRET
```

Only the Razorpay key ID is public checkout configuration. The key secret and service-role key must never appear in Vite/Expo variables, client source, Git or screenshots.

### Native development

```text
EXPO_PUBLIC_GOWAYY_BACKEND
EXPO_PUBLIC_GOWAYY_API_BASE_URL
EXPO_PUBLIC_GOWAYY_ASSET_BASE_URL
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_ADMIN_URL
```

Use a reachable HTTPS/LAN origin on a physical device; device `localhost` is not the development computer.

### Owner provisioning

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, plus `GOWAYY_CUSTOMER_EMAIL/PASSWORD`, `GOWAYY_PARTNER_EMAIL/PASSWORD`, and `GOWAYY_ADMIN_EMAIL/PASSWORD`. Optional per-account `FIRST_NAME`/`LAST_NAME` variables are documented in `docs/SETUP.md`.

## 7. Exact setup and deployment entry points

### Local web/API

```bash
npm ci
npm run dev:all
# API :8787, Customer :5173, Partner :5174, Admin :5175
```

For the complete mobile-inclusive checks:

```bash
npm ci --prefix apps/gowayy-customer/mobile --no-audit --no-fund
npm ci --prefix apps/gowayy-partner/mobile --no-audit --no-fund
npm ci --prefix apps/gowayy-admin/mobile --no-audit --no-fund
npm run verify
```

### Supabase

```bash
npm run seed:supabase
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
# Set the Edge secrets listed above; see docs/SETUP.md for the exact secrets command.
supabase functions deploy gowayy-api
supabase functions deploy payment-webhook
```

Configure Razorpay `payment.captured`, `payment.failed`, `refund.processed` and `refund.failed` to call `https://YOUR_PROJECT_REF.supabase.co/functions/v1/payment-webhook`. The function validates `x-razorpay-signature`; browser callbacks do not capture payments.

Run `npm run provision:owners` only after migrations and environment setup. Follow the interactive password commands in `docs/SETUP.md`; do not place passwords in Git or a publicly shared command log.

### Vercel project mapping

| App | Root Directory | Build command from committed `vercel.json` | Output |
| --- | --- | --- | --- |
| Customer | `apps/gowayy-customer/web` | `cd ../../.. && npm run build -w @gowayy/customer-web` plus output check | `dist` |
| Partner | `apps/gowayy-partner/web` | `cd ../../.. && npm run build -w @gowayy/partner-web` plus output check | `dist` |
| Admin | `apps/gowayy-admin/web` | `cd ../../.. && npm run build -w @gowayy/admin-web` plus output check | `dist` |

Each uses `cd ../../.. && npm ci --no-audit --no-fund` for installation and requires the three public web variables above. GitHub deployment secrets are `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_CUSTOMER`, `VERCEL_PROJECT_PARTNER`, and `VERCEL_PROJECT_ADMIN`. Workflows: `.github/workflows/ci.yml` and `deploy-web.yml`.

### Android debug/release

```bash
cd apps/gowayy-customer/mobile
npm ci
npx expo prebuild --platform android --clean --no-install
./gradlew assembleDebug
# Signed release after configuring the private keystore through the workflow:
./gradlew assembleRelease
```

Repeat in `apps/gowayy-partner/mobile` and `apps/gowayy-admin/mobile`. Java 17 and the Android SDK/API/NDK versions pinned in `.github/workflows/mobile-build.yml` are required. Release signing secrets are `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. Never commit the keystore. `EXPO_PUBLIC_ADMIN_URL` is required for the Admin WebView shell.

See `docs/DEPLOYMENT.md` for artifact/version/signing behaviour and `docs/SETUP.md` for provider and provisioning details.

## 8. File manifest

The manifest below is relative to the repository root and compares the complete working tree at report time with the baseline. `M` means modified; `A` means added.
- `M` `apps/dev-api/src/admin.mjs`
- `M` `apps/dev-api/src/catalog-hub.mjs`
- `A` `apps/dev-api/src/catalog-visibility.mjs`
- `A` `apps/dev-api/src/commerce-rules.mjs`
- `M` `apps/dev-api/src/commerce.mjs`
- `A` `apps/dev-api/src/experiences.mjs`
- `A` `apps/dev-api/src/partner-access.mjs`
- `M` `apps/dev-api/src/partner-hub.mjs`
- `M` `apps/dev-api/src/server.mjs`
- `M` `apps/gowayy-admin/web/src/App.tsx`
- `M` `apps/gowayy-admin/web/src/lib/client.ts`
- `M` `apps/gowayy-customer/mobile/app/auth/register.tsx`
- `M` `apps/gowayy-customer/web/public/images/posters/food-2.svg`
- `M` `apps/gowayy-customer/web/public/images/posters/grocery-1.svg`
- `M` `apps/gowayy-customer/web/public/images/posters/grocery-2.svg`
- `M` `apps/gowayy-customer/web/src/components/PosterCarousel.tsx`
- `A` `apps/gowayy-customer/web/src/components/UniversalSearch.tsx`
- `M` `apps/gowayy-customer/web/src/lib/client.ts`
- `A` `apps/gowayy-customer/web/src/lib/payments.ts`
- `M` `apps/gowayy-customer/web/src/screens/Bookings.tsx`
- `M` `apps/gowayy-customer/web/src/screens/Categories.tsx`
- `M` `apps/gowayy-customer/web/src/screens/Checkout.tsx`
- `M` `apps/gowayy-customer/web/src/screens/CheckoutFlow.tsx`
- `M` `apps/gowayy-customer/web/src/screens/DestinationDetail.tsx`
- `M` `apps/gowayy-customer/web/src/screens/Explore.tsx`
- `M` `apps/gowayy-customer/web/src/screens/Home.tsx`
- `M` `apps/gowayy-customer/web/src/screens/LocalMarket.tsx`
- `M` `apps/gowayy-customer/web/src/screens/Orders.tsx`
- `M` `apps/gowayy-customer/web/src/screens/SearchPage.tsx`
- `M` `apps/gowayy-customer/web/src/screens/Tourism.tsx`
- `M` `apps/gowayy-customer/web/src/store/useUI.ts`
- `M` `apps/gowayy-customer/web/src/styles/global.css`
- `M` `apps/gowayy-partner/mobile/app/auth/register.tsx`
- `M` `apps/gowayy-partner/web/src/App.tsx`
- `M` `apps/gowayy-partner/web/src/lib/uploads.ts`
- `M` `apps/gowayy-partner/web/src/screens/Auth.tsx`
- `M` `apps/gowayy-partner/web/src/screens/DriverMode.tsx`
- `M` `apps/gowayy-partner/web/src/screens/Manage.tsx`
- `M` `apps/gowayy-partner/web/src/screens/Onboarding.tsx`
- `M` `apps/gowayy-partner/web/src/screens/Profile.tsx`
- `A` `docs/AUDIT_REPORT.md`
- `M` `docs/DEPLOYMENT.md`
- `M` `docs/SETUP.md`
- `M` `package.json`
- `M` `packages/api-client/src/http.ts`
- `M` `packages/api-client/src/supabase.ts`
- `M` `packages/types/src/index.ts`
- `M` `packages/ui/src/index.tsx`
- `M` `packages/ui/src/web.css`
- `M` `packages/validation/src/index.ts`
- `A` `scripts/provision-owner-accounts.mjs`
- `M` `supabase/functions/_shared/config.ts`
- `M` `supabase/functions/_shared/normalize.ts`
- `A` `supabase/functions/_shared/payments.ts`
- `M` `supabase/functions/_shared/supabase.ts`
- `M` `supabase/functions/gowayy-api/index.ts`
- `M` `supabase/functions/payment-webhook/index.ts`
- `M` `supabase/migrations/202611040009_rpc_platform.sql`
- `A` `supabase/migrations/202611040013_production_defaults.sql`
- `A` `supabase/migrations/202611040014_schema_and_ordering.sql`
- `A` `supabase/migrations/202611040015_catalog_reads.sql`
- `A` `supabase/migrations/202611040016_checkout.sql`
- `A` `supabase/migrations/202611040017_partner_operations.sql`
- `A` `supabase/migrations/202611040018_admin_reads.sql`
- `A` `supabase/migrations/202611040019_admin_writes.sql`
- `A` `supabase/migrations/202611040020_storage.sql`
- `A` `supabase/migrations/202611040021_addresses_and_payments.sql`
- `A` `supabase/migrations/202611040022_experience_booking.sql`
- `M` `tests/integration/api.test.mjs`
- `M` `tests/integration/commerce-partner.test.mjs`
- `A` `tests/supabase/admin_runtime.test.mjs`
- `A` `tests/supabase/experience_runtime.test.mjs`
- `M` `tests/supabase/harness.mjs`
- `A` `tests/supabase/marketplace_scope_runtime.test.mjs`
- `A` `tests/supabase/payment_runtime.test.mjs`
- `A` `tests/supabase/production-posture.test.mjs`
- `M` `tests/supabase/schema.test.mjs`
- `A` `tests/unit/provision-owner-accounts.test.mjs`
- `M` `vitest.config.ts`
