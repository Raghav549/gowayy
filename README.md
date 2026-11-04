# GOWAYY

One connected journey for travel, transport, hospitality and local commerce — **three apps,
one shared backend, no admin panel**.

1. **GOWAYY** (customer) — Expo Android app (`app.gowayy.customer`) + responsive web PWA:
   cabs, shared taxis, hotels/homestays, food, groceries, tourism, experiences, parcels,
   shopping/marketplace, all attached to a shared journey context.
2. **GOWAYY PARTNER** — own Android app (`app.gowayy.partner`) + web app: drivers, delivery
   partners, restaurant / grocery / hotel / homestay / tour operators (claims, verification,
   inventory, menu, rooms, tours, inbox, earnings, settlements).
3. **GOWAYY EXPLORE** — own Android app (`app.gowayy.explore`) + web PWA: destination
   discovery with verified-only imagery, hidden gems, route and safety info, and booking
   handoff into the GOWAYY customer app.

All three share one PostgreSQL + PostGIS + Supabase backend (one DB, one auth, real-time
cross-app sync), one design system and shared engine packages.

## Quick start

```bash
npm install                 # workspace deps (three web apps + dev-api + packages)
cd apps/gowayy-customer/mobile && npm install   # Expo deps
npm run dev:all             # dev API :8787 + customer :5173 + partner :5174 + explore :5175
npm run verify              # typecheck (web+mobile), all tests, edge checks, secret scan, builds
```

See [`docs/SETUP.md`](docs/SETUP.md) for environment variables and secrets,
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for Vercel + EAS + Supabase deployment, and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full map.

## Repository map

| Path | Contents |
| --- | --- |
| `apps/gowayy-customer/web` | Customer React+Vite PWA (port 5173): splash, 4-scene onboarding, auth w/ OTP, home, services, marketplace (products/cart/checkout), journey dashboard, profile |
| `apps/gowayy-customer/mobile` | GOWAYY Expo SDK 58 Android app (EAS project `gowayy`, OTA channel production) |
| `apps/gowayy-partner/web` + `/mobile` | PARTNER web (5174) + Android (`app.gowayy.partner`, own EAS project/channels): auth, onboarding, driver mode, manage, inbox, earnings, profile + verification |
| `apps/gowayy-explore/web` + `/mobile` | EXPLORE PWA (5175) + Android (`app.gowayy.explore`, own EAS project/channels): destinations, hidden gems, booking handoff, offline shell |
| `apps/dev-api` | Real Node HTTP API with JSON persistence — auth, pricing, availability, bookings, orders, server-priced commerce, verified payments, refunds, dispatch, partner hub, audit |
| `packages/*` | Shared types, Zod validation, API client (supabase + dev transports), design system, UI kit, pricing/booking/location/notification engines, commerce, catalog |
| `supabase/migrations` | Twelve ordered SQL migrations (80+ tables, RLS everywhere, server-priced checkout RPCs) + generated seed |
| `supabase/functions` | `gowayy-api` Edge gateway (JWT verification, full client contract incl. commerce + partner ops) and HMAC-verified `payment-webhook` |
| `assets/brand` | Original layered 2.5D G symbol + per-app marks, wordmarks, splash logos, colour tokens |
| `assets/mascot` | Original "Kanchu" monkey mascot, 12 SVG poses (from the reference image), lightweight static fallbacks |
| `assets/images` | Verified exact-place photographs, WebP derivatives, `IMAGE_SOURCES.json` licence manifest, `ATTRIBUTION.md` |
| `tests` | Vitest unit, dev-API HTTP integration, PGlite schema/behaviour tests, Deno Edge tests |
| `.github/workflows` | CI (typecheck+tests+secrets+builds), per-app Vercel deploys, EAS Android build |
| `docs` | Architecture, setup, deployment, API, security, licensing, image research, backup, testing, phases, screenshot analysis |

## Design rules (v2 — "Himalayan Morning")

Light-only system: warm paper `#FAF4E9`, white surfaces, espresso-ink text, honey-gold
accents — **no black, charcoal, grey, dark, neon, electric, steel, metallic or chrome
anywhere** (enforced by unit tests on the token file). Each app has its own accent:
GOWAYY meadow green `#1E6B4F`, PARTNER clay terracotta `#C2502A`, EXPLORE rhododendron
plum `#6D3B5E`. Original geometric G logo + per-app marks; original 12-pose monkey mascot
used sparingly. Reduced-motion support, real verified photographs with honest unavailable
states, no fabricated ratings, prices or availability.

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
