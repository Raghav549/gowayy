# GOWAYY architecture

```
apps/
  web/        React 18 + Vite PWA; Three.js splash, four animated SVG onboarding scenes
  mobile/     Expo SDK 58 + Expo Router; Reanimated splash/onboarding; Zustand + Query
  dev-api/    Node HTTP development API (real persistence, pricing, auth, dispatch)
packages/
  types/ validation/ api-client/ design-system/ ui/ shared-utils/
  booking-engine/ location-engine/ pricing-engine/ notification-engine/ catalog/
supabase/
  migrations/ 001–010 (schema, RLS, RPCs, finance, read models)
  seed/       generated 0001_catalog.sql
  functions/  gowayy-api gateway, payment-webhook, _shared helpers
tests/
  unit/ integration/ supabase/
assets/ brand/ images/ (brand assets + verified photographs + manifest)
docs/   this documentation set
```

## One contract, two platforms

`packages/api-client/src/http.ts` defines `GowayyClient` — the single contract used by
both apps. Two transports implement it:

| Transport | Backend | Notes |
| --- | --- | --- |
| `createHttpTransport` | development Node API | `/api/*` REST, bearer token, idempotency key header |
| `createSupabaseTransport` | `gowayy-api` Edge Function | public anon key + caller JWT only; every mutation is an RPC |

`packages/validation` (Zod), `packages/pricing-engine`, `booking-engine`,
`location-engine`, `notification-engine`, `design-system` and `types` are imported by
both apps. Mobile resolves them via `tsconfig.json` paths and a monorepo Metro config;
web resolves them via Vite aliases. No business rule is duplicated per platform.

## Server-authoritative rules

- Prices, taxes, commissions, refunds and fare breakdowns are computed on the server
  from integer paise. The client never sends a total it expects to be trusted.
- Booking/order status transitions are validated by a state machine on the server.
- Room availability and grocery stock are checked and mutated inside the same
  transaction; cancellation restores them.
- Payment stays `requires_action` until a **verified** server event captures it.
  Sandbox capture is explicitly labelled as a development adapter.
- Idempotency keys are stored and replayed; duplicate submission returns the original
  record rather than creating a second charge.
- OTP demo adapter is labelled; the Edge gateway can call a real email provider via
  `GOWAYY_EMAIL_PROVIDER_URL` and refuses to claim an email was sent if none is set.

## Connected journey

`journeys` holds active destination, pickup, drop-off, dates, travellers, preferences
and service ids. `rpc_journey_components` (or `/api/journeys/:id` in development)
returns the status of each service component. Every booking/order accepts `journeyId`
and is attached to the journey; `rpc_recommendations` returns properties, restaurants,
attractions, packages, experiences, grocery coverage and taxi routes for the active
destination. Opening any of them keeps the same journey, so data is not re-entered.

## Data integrity

- 69 public tables, 35 `rpc_*` functions, RLS on every public table, 60+ foreign keys,
  60+ indexes, 30+ checks, 30+ policies.
- Soft deletion via `deleted_at` on user-address/saved-place style records.
- `catalog_documents` holds the generated catalogue document consumed by `rpc_catalog`.
- Listing records are tagged `dataClass: 'demo-listing'` and
  `availabilitySource: 'seeded-inventory'`. `rating` is optional and only populated
  from audited verified-booking reviews — no fabricated ratings.
- Images: see `docs/LICENSING.md`.

## No admin panel

There is no admin application, admin dashboard, admin login, admin navigation or
admin-facing interface anywhere. Partner functions (driver, restaurant, grocery,
property) are role-specific sections inside the same customer app: web `/partner`,
mobile `app/partner.tsx`.
