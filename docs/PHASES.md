# Phase report — 2026-11-04

The specification defines nine phases. This report states what is implemented and
verified, and what is not. Nothing below claims a build or deployment that was not run.

## Phase 1 — brand, design system, images, splash, onboarding, auth, navigation ✅

- Original layered 2.5D **G** SVG + wordmark, Android icon, adaptive icon, monochrome
  icon, splash logo, colour tokens and typography system in `assets/brand/`.
- Web: custom Three.js splash with reduced-motion path; four animated SVG onboarding
  scenes; multi-step registration with six-box OTP, forgot/reset, session persistence;
  five-area navigation; light/dark themes; PWA manifest + service worker.
- Mobile: layered Reanimated splash, four Reanimated/Gesture Handler onboarding scenes,
  four-step registration with OTP auto-focus/backspace/paste/resend/expiry, login,
  forgot/reset, five bottom tabs (Home, Explore, Bookings, Orders, Profile).
- Verified: web typecheck, 59 unit tests, web build (1707 modules), mobile strict
  typecheck, Android Hermes bundle, web Metro bundle (36 chunks).

## Phase 2 — Supabase backend, auth, profiles, roles, location ✅ (schema + local SQL)

- Ten ordered migrations, generated seed, PGlite harness, 16 SQL integration tests.
- 69 public tables, 35 RPCs, RLS on every public table, FKs/indexes/checks/policies,
  soft deletion, guarded PostGIS attachment, audit logs, rate limits.
- Deno Edge Functions: `gowayy-api` gateway (full `GowayyClient` contract, JWT
  verification, Zod validation, field-name normalization) and `payment-webhook`
  (HMAC-SHA256, timing-safe). Both pass `deno check`.
- `createSupabaseTransport` is now a real implementation; no operation throws
  `SUPABASE_NOT_IMPLEMENTED` any more.
- Verified: `node --test tests/supabase/schema.test.mjs` → 16/16; `npx deno check` clean.

## Phase 3 — destination discovery, tourism, maps, journey engine ✅

- 15 destinations, hidden gems, attractions, places, routes, packages, experiences;
  data-driven so new destinations need no app changes.
- Web destination detail with real-image provenance; mobile `destinations/[slug]`.
- Journey engine (`rpc_create_journey`, `rpc_update_journey`,
  `rpc_journey_components`, `rpc_recommendations`) preserves destination, pickup,
  drop-off, dates, travellers and service ids. Mobile journey dashboard and web
  equivalent show component status and connected recommendations.
- Map/location provider architecture: `packages/location-engine` (web) and
  `apps/gowayy-customer/mobile/src/lib/location.ts` (Expo Location + reverse geocode + navigation
  handoff). Honest fallback: where no tile provider key exists, the app opens verified
  coordinates in the device map app instead of drawing a fake map.

## Phase 4 — cab, shared taxi, driver, dispatch ✅ (flows + server rules)

- Full cab/shared-taxi forms with route estimate, fare breakdown, scheduling,
  navigation handoff, server-priced booking, cancellation and refund.
- Driver registration, demo verification (labelled), online/offline, eligible services,
  configurable dispatch rules, active-task conflict rejection. Partner mode is a
  role-specific section, not an admin panel.

## Phase 5 — restaurant marketplace / food ordering ✅

- Menu browse, customisations, cart, coupons, delivery address/instructions, order
  placement, status transitions, order history, complaints/support tickets, refunds.
- Partner section handles incoming orders and preparation status.

## Phase 6 — grocery marketplace / independent inventory ✅

- Multiple stores, independent stock and coverage, search/filter, variants/quantity,
  substitution preference, delivery slots, stock decrement and out-of-stock rejection
  tested in SQL and dev API.

## Phase 7 — hotel & homestay marketplace / availability ✅

- Properties, room types, date availability across every night, house rules,
  cancellation policy, taxes, guest details, server-side booking and cancellation with
  inventory restoration. Tested in SQL and dev API.

## Phase 8 — payments, notifications ✅ (sandbox + in-app)

- Initiation, idempotency, `requires_action` until verified capture, sandbox capture
  clearly labelled, refunds, transactions, commissions, tax breakdown.
- In-app notifications with polling on mobile, notifications centre on web, push
  permission handling via Expo Notifications; Supabase Realtime publication is declared
  in SQL. No real push gateway is configured.

## Phase 9 — integration, security, performance, testing — partially complete

Verified in this workspace:

| Check | Result |
| --- | --- |
| Root typecheck (`tsc --noEmit`) | pass |
| Mobile strict typecheck | pass |
| Unit tests (Vitest) | 68 pass, 8 files |
| Dev API integration tests | 18 pass |
| Supabase SQL tests (PGlite/PostgreSQL 17.5) | 16 pass |
| Deno Edge typecheck + runtime tests | pass, 2 functions + 5 shared-logic tests |
| Web build (Vite) | pass, 1707 modules |
| Metro web export | pass, 36 bundles |
| Metro Android export | pass, 5.2 MB Hermes bundle |
| Live web + API | HTTP 200 on `:5173`, `:5174`, `:8787` |
| Source secret scan | pass, 0 high-confidence credential patterns |

**Not verified / remaining work:**

- No EAS build, development APK, production AAB or on-device Android test.
- No hosted Supabase project: migrations, seed, Edge Functions and RLS have not been
  applied to a live project; only PGlite/PostgreSQL 17.5 locally.
- PostGIS geography columns/GiST indexes guarded but not confirmed on a PostGIS-enabled
  instance.
- No real email OTP provider, real payment gateway, live interactive map tiles,
  real-time Supabase subscription in the clients, or partner document upload flow.
- Image research is incomplete for 11 destinations and all business/vehicle-specific
  photography; those records intentionally show "photograph unavailable".
- No browser E2E automation (Playwright/Cypress), visual regression, or load/performance
  measurement on a mid-range Android device. A local source secret scan passes with 0
  high-confidence credential patterns, but no hosted scanner has been run.
- No deployment. No admin panel was created at any point.

## Phase 8 — three-app monorepo completion (2026-11-04)

- **GOWAYY PARTNER** web app delivered (`apps/gowayy-partner/web`, port 5174): auth,
  onboarding, driver mode, manage (inventory/menu/rooms/tours), inbox, earnings,
  profile with document verification, support/sign-out/delete-account.
- **GOWAYY EXPLORE** PWA delivered (`apps/gowayy-explore/web`, port 5175): destination
  discovery with verified-only imagery, hidden gems with routes/safety, and booking
  handoff into the GOWAYY customer app (`?source=explore`), offline shell + manifest.
- **Commerce + partner backend** wired end-to-end: Edge gateway ops for all commerce
  and partner-hub calls, SQL migrations `202611040011`/`0012` (marketplace, carts,
  wishlists, orders, partner profiles/documents/inventory/menu/rooms/tours, server-priced
  checkout RPC, payment-method RPC, 15%-commission earnings RPC, settlement requests),
  and dev-api modules live-verified over HTTP.
- CI/CD added: `.github/workflows/ci.yml` (typecheck web+mobile, unit, integration,
  PGlite schema, Deno edge tests, secret scan, builds), `deploy-web.yml` (three Vercel
  projects), `mobile-build.yml` (EAS Android). Per-app `vercel.json` ×3, `eas.json`
  channels, `docs/DEPLOYMENT.md`.
- `npm run verify` green: 68 unit + 25 integration + 16 supabase + 5 edge tests, secret
  scan clean, all three web apps build.

## Phase 9 — full visual redesign v2 + three Android apps (2026-11-04)

- **Light-only redesign ("Himalayan Morning")**: new `brand-tokens.json` v2 (warm paper
  #FAF4E9, espresso ink, honey gold; NO black/charcoal/grey/dark/neon/metallic anywhere —
  enforced by unit tests), per-app accents (customer meadow #1E6B4F, partner clay #C2502A,
  explore plum #6D3B5E), regenerated per-app SVG brand assets + Android PNG icons/splash
  (pure-Node rasterizer, no new deps), splash/onboarding/map/placeholders re-themed.
- **GOWAYY PARTNER Android app** (`apps/gowayy-partner/mobile`, `app.gowayy.partner`):
  splash → 3-scene onboarding → OTP auth → pill-rail tabs (Home/Inbox/Manage/Earnings/
  Profile) wired to the shared partner ops (claims, profile, inbox, earnings, settlements).
- **GOWAYY EXPLORE Android app** (`apps/gowayy-explore/mobile`, `app.gowayy.explore`):
  splash → onboarding → Discover/Gems/Search/Saved + destination detail with booking
  handoff to GOWAYY (`?source=explore`).
- **CI/CD repaired**: `denoland/setup-deno@v1` (the old slug did not exist), explicit
  `permissions: contents: read`, mobile installs + typechecks for all three apps in CI,
  three EAS build jobs in `mobile-build.yml`, permissions on `deploy-web.yml`.
- `npm run verify` green incl. typecheck of all three Expo apps; 68 unit + 25 integration
  + 16 supabase + 5 edge tests; all three web apps build.
