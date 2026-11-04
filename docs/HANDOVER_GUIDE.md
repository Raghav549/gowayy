# GOWAYY — setup and handover guide (A–L)

**Audience:** someone who has never opened this repository.
**Verified:** 4 November 2026 on branch `arena/9fff2983-gowayy`, Node 22.x, npm 10.x.
Every command below was run in this checkout unless marked **manual** (needs credentials, a
phone, Android SDK/keystore, or a third-party account). Where a provider is not configured this
guide says so instead of implying it works.

---

## A. Project structure

GOWAYY is a single npm-workspaces monorepo with **three web apps, three Android apps, one
development API, shared packages and a Supabase production path**.

```
gowayy/
├─ apps/
│  ├─ dev-api/                 Reference HTTP API — Node, JSON persistence, port 8787
│  │  ├─ src/server.mjs        Routing, auth, bookings, orders, payments, webhooks
│  │  ├─ src/admin.mjs         Admin-only endpoints (content, posters, service areas)
│  │  ├─ src/catalog-hub.mjs   Storefront, search, posters, service coverage, uploads
│  │  ├─ src/commerce.mjs      Products, cart, checkout, store listings
│  │  ├─ src/partner-hub.mjs   Partner profile, inventory/menu, earnings, settlements
│  │  └─ src/seed.mjs          Idempotent demo seed + production guard
│  ├─ gowayy-customer/
│  │  ├─ web/                  Customer React + Vite app, port 5173
│  │  │  ├─ src/screens/       Home, Explore, Food/Groceries, Shop, Hotels, Cabs, …
│  │  │  ├─ src/components/    Splash, posters, search select, category art
│  │  │  ├─ public/images/     Destination, category, poster and product images
│  │  │  └─ public/brand/      Logo, wordmark, icons
│  │  └─ mobile/               Customer Android app (Expo SDK 57 / React Native)
│  ├─ gowayy-partner/
│  │  ├─ web/                  Partner workspace, port 5174
│  │  └─ mobile/               Partner Android app
│  └─ gowayy-admin/
│     ├─ web/                  Scoped operations console, port 5175
│     └─ mobile/               Admin Android shell (WebView of the console)
├─ packages/                   api-client, catalog, commerce, design-system, ui, types,
│                              validation, pricing/booking/location engines, notifications
├─ supabase/
│  ├─ migrations/              202611040001 … 202611040012 (PostgreSQL + RLS + RPCs)
│  ├─ seed/0001_catalog.sql    Generated catalogue seed
│  └─ functions/               gowayy-api, payment-webhook (Deno)
├─ tests/                      unit (Vitest), integration (node:test), SQL (PGlite), Edge (Deno)
├─ scripts/                    brand/image builders, Vercel output, secret scan
├─ assets/                     brand tokens, logos, image sources/attribution
└─ docs/                       this guide, report, API, architecture, security, deployment
```

**Which app is which**

| Product | Folder | Purpose |
| --- | --- | --- |
| Customer web | `apps/gowayy-customer/web` | Storefront: destinations, search, cabs, stays, food, groceries, shop, checkout |
| Customer Android | `apps/gowayy-customer/mobile` | Native shell for the same journeys |
| Partner web | `apps/gowayy-partner/web` | Business profile, store logo/banner, catalogue, orders, offers, rooms/tours, earnings |
| Partner Android | `apps/gowayy-partner/mobile` | Native partner shell |
| Admin web | `apps/gowayy-admin/web` | Destinations CMS, posters, cities/service PINs, audit |
| Admin Android | `apps/gowayy-admin/mobile` | WebView shell for the secured console |
| Development API | `apps/dev-api` | Real server used by all three web/mobile apps in development |
| Production data | `supabase/` | PostgreSQL schema, RLS, RPCs, Edge Functions |

The admin console is deliberately scoped to content and serviceability. Legacy sections remain in
source for API compatibility but are not routable; every `/api/admin/*` call is authorised on the
server.

---

## B. Required software and accounts

### Install locally (free)

| Tool | Version | Why |
| --- | --- | --- |
| Node.js LTS | 22.x (`engines: >=20`) | web apps, API, tests; 22.22.3 verified |
| npm | 10.x | workspaces; do not mix yarn/pnpm |
| Git | current | repository access |
| Deno | 2.x | only `npm run test:edge` (provided through devDependencies here) |
| Python 3 | 3.11 | optional helper scripts only |
| ImageMagick | 7.x | optional image regeneration |
| Supabase CLI | 2.x | optional hosted database path |
| Java JDK | 17 | Android builds |
| Android SDK | API 35 + build-tools | Android builds |

### Accounts (free tier / paid marked)

| Service | Needed for | Cost |
| --- | --- | --- |
| Supabase | hosted PostgreSQL, Auth, Storage, Edge Functions | free tier; paid for production capacity |
| Payment gateway (Razorpay **or** Cashfree) | UPI/cards/net banking acquiring | free onboarding, per-transaction fee (paid) |
| Email/OTP provider (Resend, SendGrid, Postmark…) | real registration OTP | free tier; paid at volume |
| Vercel | web deploys | free hobby; paid for teams |
| GitHub | repository + CI + APK artifacts | free |
| Firebase / Expo push | optional push notifications | free tier |
| Google Play Console | optional store distribution | one-time fee (paid) |
| Domain + TLS | production URLs and deep links | paid |

No maps SDK account is required by the current code (no embedded map SDK).

---

## C. Environment variables

Copy the templates; never commit `.env`, `.env.local`, or anything with a real secret.

### C1. Development API — `apps/dev-api/.env`

```bash
cd apps/dev-api
cp .env.example .env
```

| Variable | Local | Staging | Production | Public? |
| --- | --- | --- | --- | --- |
| `PORT` | `8787` | `8787` | platform | no |
| `GOWAYY_ENV` | `development` | `staging` | `production` | no |
| `GOWAYY_DB_FILE` | unset → `./data/db.json` | mounted volume | not used | no |
| `GOWAYY_OTP_PROVIDER` | `demo` | real provider | real provider | no |
| `GOWAYY_PAYMENT_PROVIDER` | `sandbox` | `sandbox` | gateway name | no |
| `GOWAYY_WEBHOOK_SECRET` | `openssl rand -hex 32` | provider secret | provider secret | **secret** |
| `GOWAYY_PAYMENT_GATEWAY_KEY` | empty | key id/secret | key id/secret | **secret** |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | empty | project | project | **secret** |

`GOWAYY_ENV=production` or `NODE_ENV=production` makes the demo seed throw and refuse to run.

### C2. Customer web — `apps/gowayy-customer/web/.env.local`

```bash
cp apps/gowayy-customer/web/.env.example apps/gowayy-customer/web/.env.local
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | Vite proxies to `127.0.0.1:8787` |
| `VITE_GOWAYY_BACKEND` | `dev-api` | set `supabase` for the hosted backend |
| `VITE_SUPABASE_URL` | — | public project URL |
| `VITE_SUPABASE_ANON_KEY` | — | **public anon key only** |
| `VITE_UPI_VPA` | — | optional sandbox UPI intent target (not proof of payment) |

### C3. Partner and admin web

```bash
cp apps/gowayy-partner/web/.env.example apps/gowayy-partner/web/.env.local
cp apps/gowayy-admin/web/.env.example apps/gowayy-admin/web/.env.local
```

They need only `VITE_API_BASE_URL` if the API is not same-origin. Their dev servers proxy `/api`
to `127.0.0.1:8787`, `/uploads` to the API and `/images` to the customer app.

### C4. Mobile — `apps/gowayy-*/mobile/.env`

| Variable | Example | Where it is compiled |
| --- | --- | --- |
| `EXPO_PUBLIC_GOWAYY_API_BASE_URL` | `http://192.168.1.10:8787/api` | Android bundle (public) |
| `EXPO_PUBLIC_GOWAYY_ASSET_BASE_URL` | `http://192.168.1.10:5173` | Android bundle (public) |
| `EXPO_PUBLIC_GOWAYY_BACKEND` | `supabase` (optional) | Android bundle (public) |
| `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | optional | Android bundle (public) |
| `EXPO_PUBLIC_ADMIN_URL` | admin web URL | admin shell (public) |

`localhost` on a phone means the phone itself. Use the computer's LAN IP or a deployed HTTPS URL.

### C5. Local / staging / production

| Concern | Local | Staging | Production |
| --- | --- | --- | --- |
| API | `apps/dev-api` + JSON file | `apps/dev-api` + volume | Supabase Edge Function |
| Database | `apps/dev-api/data/db.json` | JSON volume or Supabase staging | Supabase production |
| Demo seed | runs | runs (not production) | **refuses** |
| Payments | sandbox capture/webhook | gateway sandbox | gateway live |
| OTP | labelled demo adapter | real provider | real provider |
| Web | Vite dev servers | Vercel preview | Vercel production |
| Secrets | ignored `.env` files | platform env | platform env + GitHub Secrets |

**Never** prefix a secret with `VITE_` or `EXPO_PUBLIC_`: those values ship to browsers/phones.

---

## D. Database and backend setup

### D1. Local (no migration step)

The dev API creates and seeds `apps/dev-api/data/db.json` on first start. The seed is
**idempotent**: restarting updates seeded records and never duplicates accounts.

```bash
npm run dev:api
curl -s localhost:8787/api/health
```

Safe to repeat: `npm run dev:api`, `npm run seed:supabase` (regenerates SQL), reading endpoints.
Caution: deleting `apps/dev-api/data/db.json` destroys local records, orders and uploads metadata.

Reset **local development only**:

```bash
# stop the API first
rm -f apps/dev-api/data/db.json
npm run dev:api
```

### D2. Hosted PostgreSQL (Supabase)

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push          # applies 202611040001 … 202611040012 in order
npm run seed:supabase     # regenerates supabase/seed/0001_catalog.sql
```

Migrations, in order: `001_foundation`, `002_identity`, `003_catalog`, `004_bookings`,
`005_finance`, `006_rls`, `007_helpers`, `008_rpc_bookings`, `009_rpc_platform`,
`010_read_models`, `011_commerce_partner`, `012_commerce_rpcs`.

- RLS is enabled on every public table; policies are in `006_rls.sql`.
- Privileged operations are service-role RPCs; customer JWTs cannot bypass them.
- PostGIS is guarded: geography columns/indexes are created only if the extension exists.
- Storage: the web/dev path stores uploads on disk (`/uploads`). For hosted production, create a
  Supabase Storage bucket and point upload handling at it (the current Edge API does not yet
  implement Storage uploads — see L).
- Auth providers are configured in the Supabase dashboard (email OTP/password).
- Deploy functions after the schema:

```bash
supabase functions deploy gowayy-api
supabase functions deploy payment-webhook
```

Edge secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`GOWAYY_PAYMENT_WEBHOOK_SECRET`, and optional `GOWAYY_EMAIL_PROVIDER_URL`.

`supabase db push` is repeatable and applies only new migrations. Do not run destructive resets on
an existing database.

### D3. What the demo seed contains

- 10 destinations / 15 destination records; existing records are editable in Admin.
- 5 cities with independent food and grocery PIN lists (Darjeeling, Siliguri, Kurseong, Mirik,
  Kalimpong), for example `734103` is grocery-only: food reports unsupported while grocery works.
- 6 posters (3 grocery, 3 food), 8 product photographs, category artwork, demo store records.
- Demo accounts in section J, labelled demo/test data.

Guard check:

```bash
cd apps/dev-api
GOWAYY_ENV=production node -e "import('./src/seed.mjs').then(m=>m.seedDemoData({},{}))" 2>&1 | head -3
# Refusing to seed demo accounts outside development/staging
```

---

## E. Customer app setup

```bash
npm ci
npm run dev:web                 # http://localhost:5173
npm run build:customer          # apps/gowayy-customer/web/dist
npm run typecheck               # all web/shared TypeScript
```

Configure `.env.local` as in C2. In development the app talks to `/api` through the Vite proxy;
the customer public directory serves destination, category, poster and product images.

**Android**

```bash
npm ci --prefix apps/gowayy-customer/mobile
cd apps/gowayy-customer/mobile
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

`app.json` sets package `app.gowayy.customer`, permissions `INTERNET`,
`ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `POST_NOTIFICATIONS`,
`REQUEST_INSTALL_PACKAGES`; purple splash `assets/branding/splash-mark.png` on `#421080`; deep-link
scheme `gowayy` and `https://gowayy.app`. App icons are under `assets/branding/`.

Install on a phone (USB debugging on):

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

AAB for Play:

```bash
cd apps/gowayy-customer/mobile/android && ./gradlew bundleRelease
# app/build/outputs/bundle/release/app-release.aab
```

The PWA build is the normal web build (service worker `public/sw.js`); deploy `dist` as a static
site or use the Vercel workflow.

---

## F. Partner app setup

```bash
npm run dev:partner             # http://localhost:5174
npm run build:partner
npm run typecheck
```

Log in with a partner account. Partner roles are server-checked: `restaurant`, `grocery`,
`property`, `tour_operator`, `driver`. New partners claim a listing via `/api/partners/claim`;
documents are submitted in **Manage → verification** and remain `pending` until reviewed
(development uses a labelled demo adapter). Store profile, logo/banner upload, catalogue,
inventory, menu, rooms, tours, orders, offers, earnings and settlements are in the Manage tabs.

Logo/banner flow: **Manage → Store → Upload logo/banner → Save store**. Uploads go through
`POST /api/uploads`; the saved path is stored on the store and returned by `/api/commerce/stores`
so the customer card shows it. A partner can only edit a store they own (server returns 403
otherwise). With several stores, use the store selector at the top.

Partner Android uses the same mobile commands as the customer app with
`npm ci --prefix apps/gowayy-partner/mobile`, package `app.gowayy.partner`.

---

## G. Admin app setup

```bash
npm run dev:admin               # http://localhost:5175
npm run build:admin
```

The console is scoped to:

1. **Destinations** — name, slug, region, summary, description, coordinates, active/featured,
   cover image, multi-image gallery, set cover, reorder images, delete image. Existing seeded
   destinations are editable and are never deleted; “deactivate” keeps records and bookings.
2. **Posters** — grocery/food carousel, image upload or HTTPS URL, title/CTA/link, order,
   start/end schedule, active toggle, preview, replace, delete. Customer reads only active,
   in-window posters from `/api/posters`.
3. **Cities & service areas** — add/edit/activate/delete a city, with **separate** food and
   grocery PIN lists. The server validates PINs and rejects out-of-area checkout with
   `SERVICE_UNAVAILABLE`; the customer UI shows “Service unavailable in your area”.
4. **Audit log** — records who changed what.

**Create/authorise an admin:** admin accounts use the normal auth user table plus an entry in
`db.admins` with level `super` (or the equivalent service-role grant in Supabase). The seeded
`admin@gowayy.app` and `demo@gowayy.app` already have this. There is intentionally no
self-service “make me admin” screen.

**Verify server-side RBAC:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:8787/api/admin/overview
# 401 without a token

# with a customer token → 403
```

**Verify images are saved and shown:** upload in Admin → the response stores `/uploads/...`;
admin previews load it through the dev proxy, the customer app reads it from the API/database.
Seeded `/images/...` paths are served by the customer app’s `public/images` directory. The Vercel
prep script copies that library into the admin/partner output.

---

## H. Payment gateway setup

### Current implementation

| Capability | Status |
| --- | --- |
| Server-initiated payment (`POST /api/payments/init`), amount must equal the server total | working |
| Idempotency | working |
| Sandbox capture signed and passed through the real webhook verifier | working |
| HMAC-SHA256 webhook verification (`x-gowayy-signature`), replay protection, amount/type checks | working |
| Transaction ledger (`charge`, `refund`, `commission`) | working |
| Refunds (customer and admin, 80% policy/full) | working |
| Reconciliation totals | working |
| COD eligibility (service setting, ₹10,000 cap, `cod_due` status) | working |
| Raw card storage | none anywhere |
| UPI | sandbox intent + server-verified capture; **not** a live PSP integration |
| Cards / net banking | **HTTP 503 `GATEWAY_NOT_CONFIGURED`** until a gateway adapter and credentials exist |

**No gateway has been selected or connected in this repository.** Razorpay or Cashfree are the
practical choices for India (UPI + cards + net banking in one hosted checkout); the existing
webhook/ledger/refund code is provider-agnostic.

### What you must supply

1. Merchant account with the provider (KYC/business documents).
2. Test-mode key id and key secret.
3. A signing/webhook secret generated in the provider dashboard.
4. The public webhook URL, for example `https://api.yourdomain.com/api/payments/webhook`
   (Supabase: `https://YOUR-PROJECT.functions.supabase.co/payment-webhook`).
5. Enable UPI, cards and net banking in the provider dashboard.
6. An adapter call: on `/payments/init` create the provider order/intent and return its hosted
   checkout URL; on webhook, map the provider event to the existing verified capture path.
7. Set the values **server-side only**:

```bash
GOWAYY_PAYMENT_PROVIDER=razorpay
GOWAYY_PAYMENT_GATEWAY_KEY=...       # key id/secret, never a VITE_/EXPO_PUBLIC_ var
GOWAYY_WEBHOOK_SECRET=...            # provider secret (Edge: GOWAYY_PAYMENT_WEBHOOK_SECRET)
```

Until item 6 is implemented and tested with real test-mode credentials, leaving the key empty is
the correct configuration. Customers then see cards/net banking disabled with a reason and can use
UPI sandbox, wallet or COD. Never mark an order paid from the frontend; capture happens only in the
server verifier.

**COD:** offered only for eligible marketplace orders, under the configured cap, and never for
services where the setting disables it. The order records `cod_due` until collection is confirmed.

---

## I. Maps, location, email and push

- **Maps:** no embedded map SDK/key. Destinations, coordinates, delivery coverage and PIN
  serviceability come from the database/catalogue. Browser geolocation is not required to order;
  the PIN code is the serviceability check.
- **Android location:** permissions are declared in `app.json`. Location is optional; denial does
  not block browsing or checkout.
- **Email OTP:** development uses `GOWAYY_OTP_PROVIDER=demo`, explicitly labelled as not real email
  verification. For production set the provider and implement the send call, or configure the
  Supabase Edge secret `GOWAYY_EMAIL_PROVIDER_URL` (+ its API key). Registration fails honestly
  with `OTP_PROVIDER_NOT_CONFIGURED` rather than pretending.
- **Push:** Android declares `POST_NOTIFICATIONS` and includes `expo-notifications`, but no FCM/
  Expo push credentials are committed. In-app notifications work without push. To enable push:
  create a Firebase project, add `google-services.json` to each Android app, upload the FCM
  service account to Expo, and store CI credentials as secrets. Never commit them.
- **Quotas:** Supabase free tier pauses idle projects; Vercel hobby has bandwidth limits; email and
  push providers have free caps. Add billing/alerts before launch.

---

## J. Demo login details (DEMO / TEST ONLY)

| App | Email | Password | Entry |
| --- | --- | --- | --- |
| Customer | `demo@gowayy.app` | `Gw@yDemo2026` | customer home |
| Partner | `demo@gowayy.app` | `Gw@yDemo2026` | partner workspace |
| Admin | `demo@gowayy.app` | `Gw@yDemo2026` | scoped admin console |

The same identity has customer, restaurant, grocery, property, tour operator, driver and admin
roles. Each app checks its own role and the server authorises every route; sharing credentials does
not let a customer call admin APIs (verified 403). Separate single-role demo accounts also exist:
`customer@gowayy.app / Gw@yCustomer2026`, `partner@gowayy.app / Gw@yPartner2026`,
`admin@gowayy.app / Gw@yAdmin2026`.

- Seeded idempotently through the existing auth/session path.
- Refuses to seed when `GOWAYY_ENV=production` or `NODE_ENV=production`.
- Development/staging only; rotate or delete before a public launch.
- Payments through this account are sandbox only.

Login/refresh/logout (`/api/auth/me`, `/api/auth/logout`) and protected routes were tested in all
three apps.

---

## K. Run and deploy commands (by app and environment)

### Local — first run

```bash
git clone <repo> && cd gowayy
npm ci
cp apps/dev-api/.env.example apps/dev-api/.env
cp apps/gowayy-customer/web/.env.example apps/gowayy-customer/web/.env.local
cp apps/gowayy-partner/web/.env.example apps/gowayy-partner/web/.env.local
cp apps/gowayy-admin/web/.env.example apps/gowayy-admin/web/.env.local
npm run dev:api
```

Expected: `[dev-api] listening on 0.0.0.0:8787`, `curl localhost:8787/api/health` returns 200.

### Local — apps (separate terminals)

```bash
npm run dev:web        # 5173
npm run dev:partner    # 5174
npm run dev:admin      # 5175
```

Expected: Vite prints `Local: http://localhost:PORT/`; all bind `0.0.0.0` and serve the app.

### Test / verify

```bash
npm run typecheck
npm run typecheck:mobile
npm run typecheck:partner-mobile
npm run typecheck:admin-mobile
npm test
npm run test:integration
npm run test:supabase
npm run test:edge
npm run scan:secrets
npm run verify          # everything above + three web builds
```

Verified result: typecheck 0 errors, unit **71 passed / 5 skipped**, integration **25/25**,
PGlite **16/16**, Edge **5/5**, all three builds green.

### Build (production)

```bash
npm run build:customer
npm run build:partner
npm run build:admin
```

### Android (per app)

```bash
npm ci --prefix apps/gowayy-customer/mobile
cd apps/gowayy-customer/mobile
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleDebug        # APK
./gradlew bundleRelease                      # AAB (needs signing config)
```

Repeat with `apps/gowayy-partner/mobile` or `apps/gowayy-admin/mobile`. CI release builds use
`.github/workflows/mobile-build.yml` and these repository secrets:
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`.

### Web deploy (Vercel)

Push to `main` or run **Deploy web apps** manually. Repository secrets: `VERCEL_TOKEN`,
`VERCEL_ORG_ID`, `VERCEL_PROJECT_CUSTOMER`, `VERCEL_PROJECT_PARTNER`,
`VERCEL_PROJECT_ADMIN`. Each project sets its own production env (`VITE_API_BASE_URL`, or
`VITE_GOWAYY_BACKEND=supabase` plus public Supabase vars). The workflow fails visibly if a secret
is missing.

### API / database deploy

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy gowayy-api
supabase functions deploy payment-webhook
```

Or run the reference API: `npm start -w @gowayy/dev-api` with persistent `apps/dev-api/data`.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| “Cannot reach the GOWAYY service” | API not running: `npm run dev:api`, check `/api/health` |
| Phone cannot reach API | use LAN IP, not `localhost`, in `EXPO_PUBLIC_GOWAYY_API_BASE_URL` |
| Port 8787 in use | `ss -ltnp \| grep 8787`, `kill -9 <pid>`, restart |
| `GATEWAY_NOT_CONFIGURED` | expected without gateway credentials; see H |
| `SERVICE_UNAVAILABLE` | PIN not in the active food/grocery list; add it in Admin |
| Admin login rejected | account lacks the admin role; use the demo/admin account |
| Demo accounts missing | API must start in development with a writable `apps/dev-api/data` |
| Admin/partner preview images 404 | start customer app on 5173 (dev proxy) or run `node scripts/prepare-vercel-output.mjs <app>` for deploys |
| Mobile `TS2688` | install that app’s mobile deps: `npm ci --prefix apps/gowayy-*/mobile` |
| APK signing failure | add the four `ANDROID_*` secrets or configure `android/gradle.properties` locally |
| `test:edge` fails | Deno not available on `PATH` |
| Vercel preflight failure | missing `VERCEL_*` secrets; intentional |

---

## L. Final manual-action checklist

### Mandatory before launch

- [ ] Create a **payment gateway** merchant account; supply key id/secret + webhook secret
      **server-side**, add the provider adapter, configure the webhook URL, and test one real
      sandbox payment + refund. Files: `apps/dev-api/src/server.mjs` (dev) and
      `supabase/functions/payment-webhook` (hosted). Until then cards/net banking stay disabled.
- [ ] Create a **Supabase** project; set `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY`; run `supabase db push`; deploy both functions; set the web env
      to `supabase` with the public URL/anon key.
- [ ] Configure a **real email OTP provider** and verify registration once.
- [ ] Create **Vercel** projects and add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, the three project ids;
      set each project’s API/Supabase env vars.
- [ ] Create an **Android keystore** and add the four `ANDROID_*` GitHub secrets; run the APK
      workflow; install and test on a phone.
- [ ] Set `GOWAYY_ENV=production`, a strong webhook secret, backups and monitoring.
- [ ] Rotate/delete the demo accounts and any demo data in production.
- [ ] Review every PIN list, store, product and poster; upload verified business content.

### Optional / later

- [ ] Firebase/Expo push credentials (`google-services.json` + FCM service account).
- [ ] Map SDK if embedded maps are wanted.
- [ ] Google Play Console listing and review.
- [ ] Custom domain/TLS and deep-link verification for `gowayy.app`.
- [ ] Provider-specific email templates, quotas and billing alerts.
- [ ] Remove legacy admin source sections if the reduced scope is permanent.

### Already implemented (no action needed)

- Lavender/purple theme, purple splash, responsive layout, realistic service art.
- Two admin-managed poster carousels with scheduling and reordering.
- Database-backed search suggestions and service-scoped search.
- Rebuilt Shops & Products, Popular Food and Local Experiences cards.
- Store logo/banner upload with neutral fallbacks and server ownership checks.
- Destinations CMS with galleries, cover image, reordering and soft deactivation.
- Cities with independent Food/Grocery PINs and server-side checkout enforcement.
- Server-enforced admin RBAC and the shared demo identity with production guard.
- Sandbox payment initiation, signed webhook verification, ledger, refunds, reconciliation and COD
  eligibility.
