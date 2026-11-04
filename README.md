# GOWAYY

One connected journey for travel, transport, hospitality and local commerce — **three apps,
one shared backend, one secured admin console**.

1. **GOWAYY** (customer) — Expo Android app (`app.gowayy.customer`) + responsive web PWA:
   cabs, shared taxis, hotels/homestays, food, groceries, tourism, experiences, parcels,
   shopping/marketplace, all attached to a shared journey context.
2. **GOWAYY PARTNER** — own Android app (`app.gowayy.partner`) + web app: drivers, delivery
   partners, restaurant / grocery / hotel / homestay / tour operators (claims, verification,
   inventory, menu, rooms, tours, inbox, earnings, settlements).
3. **GOWAYY ADMIN** — separate, server-authorised web console (port 5175) + Android WebView
   shell (`app.gowayy.admin`): customers, partners, catalog, tourism, orders, bookings,
   finance, promotions, banners, support, analytics, audit logs, roles and platform settings.

Explore is **not** a separate app: destination discovery, photographs, attractions, packages
and experiences live inside the Customer app (`/explore`, `/destinations/:slug`).

All three share one PostgreSQL + PostGIS + Supabase backend (one DB, one auth, real-time
cross-app sync), one design system and shared engine packages.

## Quick start

```bash
npm install                 # workspace deps (three web apps + dev-api + packages)
cd apps/gowayy-customer/mobile && npm install   # Expo deps
npm run dev:all             # dev API :8787 + customer :5173 + partner :5174 + admin :5175
npm run verify              # typecheck (web+mobile), all tests, edge checks, secret scan, builds
```

See [`docs/SETUP.md`](docs/SETUP.md) for environment variables and secrets,
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for Vercel + direct Gradle APK + Supabase deployment, and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full map.

## Repository map

| Path | Contents |
| --- | --- |
| `apps/gowayy-customer/web` | Customer React+Vite PWA (port 5173): splash, onboarding, multi-page auth, Home, Explore, Shop, product detail and 4-step checkout, bookings, orders, journey dashboard, account |
| `apps/gowayy-customer/mobile` | GOWAYY Expo SDK 57 Android app (`app.gowayy.customer`), built as a native Gradle APK in GitHub Actions |
| `apps/gowayy-partner/web` + `/mobile` | PARTNER web (5174) + Android (`app.gowayy.partner`): store dashboard, dynamic products/categories, offers/coupons, orders with delivery-code verification, driver mode, earnings, rooms, packages |
| `apps/gowayy-admin/web` + `/mobile` | ADMIN console (5175) + Android shell (`app.gowayy.admin`): secured operations, finance, promotions, banners, analytics, audit, settings |
| `apps/dev-api` | Node HTTP API with JSON persistence — auth/roles, pricing, availability, bookings, orders, server-priced commerce, delivery codes, PDF invoices, payments, refunds, dispatch, partner catalog, admin hub, audit |
| `packages/*` | Shared types, Zod validation, API client (supabase + dev transports), design system, UI kit, pricing/booking/location/notification engines, commerce, catalog |
| `supabase/migrations` | Twelve ordered SQL migrations (80+ tables, RLS everywhere, server-priced checkout RPCs) + generated seed |
| `supabase/functions` | `gowayy-api` Edge gateway (JWT verification, full client contract incl. commerce + partner ops) and HMAC-verified `payment-webhook` |
| `assets/brand` | Original layered 2.5D G symbol + per-app marks, wordmarks, splash logos, colour tokens |
| `assets/mascot` | Original "Kanchu" monkey mascot, 12 SVG poses (from the reference image), lightweight static fallbacks |
| `assets/images` | Verified exact-place photographs, WebP derivatives, `IMAGE_SOURCES.json` licence manifest, `ATTRIBUTION.md` |
| `tests` | Vitest unit, dev-API HTTP integration, PGlite schema/behaviour tests, Deno Edge tests |
| `.github/workflows` | CI (typecheck+tests+secrets+per-app web builds), independent Vercel deploys, native Gradle Android APK builds and releases |
| `docs` | Architecture, setup, deployment, API, security, licensing, image research, backup, testing, phases, screenshot analysis |

## Design rules (lavender fields — purple and champagne)

Light-only system restored to the original brand: page gradient `#FBF8FD → #F4ECFA → #FFF9F2`,
purple accent `#421080`, lilac/lavender surfaces `#DCC7F2`/`#EDE3F7`, border `#E9E0F0`,
ink `#17131B`, and restrained champagne highlights `#FFA500`/`#FFC44D`. The purple-and-gold
G logo is unchanged, and the Android splash is the inverse mark on `#421080`. Customer,
Partner and Admin share the same tokens and purple primary actions. **No cream page
background, no neon, electric blue or cyan** is used in any app. Reduced-motion support,
verified photographs with honest unavailable states, and no fabricated ratings, prices or
availability.

## Integrity rules

- All bookings/orders persist; status and price are server-authoritative (server-priced
  cart quotes and checkout; stock decremented server-side).
- Payments are sandbox-only in development; client-side "success" never confirms a
  booking. Capture requires a signature-verified webhook; refunds are server-side;
  unavailable payment methods are visibly disabled with reasons.
- Demo OTP and demo driver/partner verification are clearly labelled as development
  adapters and never claim to be real verification.
- No service-role key, webhook secret or provider credential is bundled into a client or
  the repo (enforced by `npm run scan:secrets` in CI).
- Real-place photographs only with verified exact subject + licence.

## Verification status

`npm run verify` runs: root + mobile strict typecheck, 68 unit tests, 25 dev-API HTTP
integration tests, 16 PGlite/PostgreSQL schema tests, Deno typecheck + runtime tests for
both Edge Functions, repo secret scan, and production builds of all three web apps.
