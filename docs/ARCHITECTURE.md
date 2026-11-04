# GOWAYY architecture

```
apps/
  gowayy-customer/
    web/       React + Vite PWA (port 5173); splash, 4-scene onboarding, auth+OTP,
               home, services, marketplace (products/cart/checkout), journey, profile
    mobile/    Expo SDK 58 + Expo Router Android (EAS build + OTA); same flows
  gowayy-partner/
    web/       React + Vite partner app (port 5174): auth, onboarding, driver mode,
               manage (inventory/menu/rooms/tours), inbox, earnings, profile/verification
  gowayy-explore/
    web/       React + Vite explore PWA (port 5175): destinations, hidden gems,
               safety/routes, booking handoff into the customer app, offline shell
  dev-api/     Node HTTP development API (real persistence, pricing, auth, dispatch,
               commerce, partner hub)
packages/
  types/ validation/ api-client/ design-system/ ui/ shared-utils/ commerce/
  booking-engine/ location-engine/ pricing-engine/ notification-engine/ catalog/
supabase/
  migrations/ 202611040001–0012 (schema, RLS, RPCs, finance, commerce + partner hub)
  seed/       generated catalog seed
  functions/  gowayy-api gateway (full client contract), payment-webhook, _shared
tests/
  unit/ integration/ supabase/  + Deno tests under supabase/functions/tests/
assets/ brand/ mascot/ images/ (brand assets, 12-pose mascot, verified photos + manifest)
docs/   this documentation set
.github/workflows/  ci.yml, deploy-web.yml (3 Vercel projects), mobile-build.yml (EAS)
```

## Three apps, one contract

`packages/api-client` defines `GowayyClient` — the single contract used by all three
apps. Two transports implement it:

| Transport | Backend | Notes |
| --- | --- | --- |
| `createHttpTransport` | development Node API (`apps/dev-api`) | `/api/*` REST, bearer token, idempotency-key header |
| `createSupabaseTransport` | `gowayy-api` Edge Function | anon key + caller JWT only; every mutation is an RPC |

The customer app, the partner app and the explore app all import the same client,
validation (Zod), engines (`pricing`, `booking`, `location`, `notification`, `commerce`)
and the shared UI kit (`@gowayy/ui`). Web apps resolve them via Vite aliases; mobile via
tsconfig paths + Metro. No business rule is duplicated per app.

## Cross-app real-time sync

One Supabase project = one PostgreSQL + PostGIS database and one auth. Partner actions
(claim a listing, adjust stock, accept a job, upload a verification document) are rows
in the same database the customer app subscribes to via Supabase Realtime, so customer
facing availability, inbox and earnings stay in sync without polling.

## Server-authoritative rules

- Prices, taxes, commissions, refunds, fare breakdowns **and marketplace cart quotes /
  checkout totals** are computed on the server from integer paise. The client never
  sends a total it expects to be trusted; checkout re-prices every line, checks stock,
  applies the coupon, adds 5% GST and decrements stock in one transaction.
- Booking/order status transitions are validated by a state machine on the server;
  dispatch validation forbids food/grocery delivery while carrying a passenger.
- Payment stays `requires_action` until a **HMAC-verified** webhook captures it.
  Sandbox capture and demo OTP are explicitly labelled development adapters.
- Idempotency keys are stored and replayed; duplicate submission returns the original
  record rather than creating a second charge.
- Unavailable payment methods (card/netbanking/EMI without a gateway) are returned as
  visibly disabled with reasons; no card data is ever stored client-side.

## Connected journey

`journeys` holds destination, pickup, drop-off, dates, travellers and service ids.
`rpc_journey_components` returns each service component's state; every booking/order
accepts `journeyId`. Marketplace orders can attach to the active journey too.
`rpc_recommendations` returns properties, restaurants, attractions, packages,
experiences, grocery coverage and taxi routes for the destination. Explore hands off to
the customer app with `?source=explore` so the journey context survives the handoff.

## Data integrity

- 80+ public tables, 50+ `rpc_*` functions, RLS on every table, 60+ FKs, 60+ indexes.
- Soft deletion via `deleted_at`; listings tagged `dataClass: 'demo-listing'`.
- `rating` is optional and only from audited verified-booking reviews — no fabricated
  ratings, prices, availability or photos.
- Images: verified exact-place photographs only, see `docs/LICENSING.md` and
  `assets/images/IMAGE_SOURCES.json`.

## No admin panel

There is no admin application, dashboard, login or admin-facing interface anywhere.
Partner capabilities live in the dedicated **GOWAYY PARTNER** app
(`apps/gowayy-partner/web`), gated by role claims — not in any admin UI.
