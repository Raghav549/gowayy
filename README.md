# GOWAYY

One connected journey for travel, transport, hospitality and local commerce. Customer-facing
Android and Web applications only — **no admin panel**.

GOWAYY connects cab booking, shared taxis, food ordering, grocery shopping, hotels and
homestays, tourism/sightseeing, local experiences, parcel delivery, destination discovery
and local business discovery through a single shared journey context. Pick Bagdogra
Airport → Darjeeling and the app surfaces stays, attractions, sightseeing packages,
local taxis, restaurants and grocery coverage while keeping the journey attached to
every subsequent booking.

## Quick start

```bash
npm install
npm run dev        # development API :8787 + responsive web app :5173
npm run verify     # all typechecks, tests, Edge checks, and web build
```

See [`docs/SETUP.md`](docs/SETUP.md) for Android/Expo, Supabase deployment, environment
variables and secrets.

## What is in the repository

| Path | Contents |
| --- | --- |
| `apps/web` | React + TypeScript Vite PWA: Three.js G splash, four animated onboarding scenes, auth, home, explore, service flows, journey dashboard, checkout, partner mode, profile, credits |
| `apps/mobile` | Expo SDK 58 / Expo Router Android app: Reanimated splash, four animated onboarding scenes, 5-tab navigation, 8 dedicated service routes, journey dashboard, checkout, partner mode, credits |
| `apps/dev-api` | Real Node HTTP API with JSON persistence — auth, pricing, availability, bookings, orders, payments, refunds, notifications, dispatch, audit |
| `packages/*` | Shared types, Zod validation, API client, design system, UI, pricing/booking/location/notification engines and catalog (imported by both apps) |
| `supabase/migrations`, `seed` | Ten ordered SQL migrations (69 tables, 35 RPCs, RLS everywhere) + generated catalog seed |
| `supabase/functions` | `gowayy-api` Edge gateway (JWT verification, full client contract, field normalization) and HMAC-verified `payment-webhook` |
| `assets/brand` | Original layered 2.5D G symbol, wordmark, app/adaptive/monochrome icons, splash logo, colour tokens, typography |
| `assets/images` | Verified exact-place photographs, WebP derivatives, source/licence manifest and attribution |
| `tests` | Vitest unit, dev-API integration, PGlite schema/behaviour tests |
| `docs` | Architecture, setup, API, security, licensing, image research, backup, testing, phase report |

## Design rules

Deep charcoal, graphite, warm white, soft ivory, muted silver and restrained champagne.
No neon/blue-dominated palette, no generic pin or car logos, no decorative buttons.
Both themes, reduced-motion support, real photographs with honest unavailable states,
and no fabricated ratings or availability.

## Integrity rules

- All bookings persist; status and price are server-authoritative.
- Payments are sandbox-only in development; client-side "success" never confirms a
  booking. Capture requires a signature-verified server event.
- Demo OTP and demo driver/partner verification are clearly labelled as development
  adapters and never claim to be real verification.
- No service-role key, webhook secret or provider credential is bundled into a client.
- Real-place photographs are used only when the exact subject and licence were verified.

## Verification status

Run in this workspace: root + mobile strict typecheck, 68 unit tests, 18 dev-API
integration tests, 16 PGlite/PostgreSQL 17.5 SQL tests, Deno typecheck and 5 runtime tests for both Edge Functions, Vite web build, Metro web export (36 bundles), Metro Android Hermes export,
and live HTTP 200 checks for web + API.

Not run: EAS build/APK/AAB, on-device Android test, hosted Supabase deployment,
PostGIS-enabled migration run, real payment/OTP/map providers, browser E2E automation,
or production deployment. Full detail: [`docs/PHASES.md`](docs/PHASES.md).
