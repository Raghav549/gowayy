# Testing

```bash
npm run verify                 # typecheck web + mobile, all tests, Edge check, web build
npm test                       # Vitest unit tests (8 files / 68 tests)
npm run test:integration       # node:test against the real dev API (18 tests)
npm run test:supabase          # PGlite migrations + seed + schema behaviour (16 tests)
npm run test:edge              # deno check for both Edge Functions + 5 runtime shared-logic tests
npm run typecheck:mobile       # strict TypeScript for apps/mobile
npm run scan:secrets           # high-confidence credential pattern scan
npm run bundle:mobile:web      # Metro web export
npm run bundle:mobile:android  # Metro Android Hermes export
```

## Coverage

| Layer | Tests |
| --- | --- |
| Unit | pricing/quotes/refunds, validation/password strength, design tokens, notifications, API-client transports, web flows (onboarding, auth, splash), catalog provenance, location |
| Integration (dev API) | registration/OTP, login/logout/forgot/reset/delete, search, cab/shared taxi/hotel/tourism/experience/parcel bookings, food/grocery checkout, payment sandbox capture, cancellation refund, order-state and partner gating, driver verification/dispatch incompatibility, notification dedupe, support tickets, disk persistence |
| SQL (PGlite) | migrations apply, required tables/RLS/PK, FKs/indexes/checks/policies, no admin table or service secret, seed + licensing, search/recommendations/route, journey, cab idempotent replay + server pricing, illegal transitions, grocery stock, hotel date availability, `requires_action` payment until verified capture, demo-labelled sandbox capture, refund on cancellation, owner-only notifications/payments under `SET ROLE authenticated`, demo OTP, partner claim, driver verification, dispatch active-task conflict, verified-booking-only reviews |
| Mobile/Edge parity | route/config coverage, no admin interface, no exposed service-role key, gateway op coverage, icon/dependency compatibility; plus 5 Deno runtime tests for normalization and Zod validation |

## Gaps

A source-level secret scan passes with 0 high-confidence credential patterns. No automated browser E2E suite, no on-device Android instrumentation, no visual
regression suite and no load test. `docs/PHASES.md` lists everything not verified.

Test data is seeded demo data. Listings are labelled `demo-listing` with
`seeded-inventory` availability; ratings only appear from verified-booking reviews.
