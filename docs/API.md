# GOWAYY API

## Development REST API (`apps/dev-api`)

Base path `/api`. All authenticated requests use `Authorization: Bearer <session token>`;
booking/order/payment mutations also send `Idempotency-Key`.

| Area | Endpoints |
| --- | --- |
| Health/catalog | `GET /health`, `/catalog`, `/search?q=`, `/recommendations?destinationId=`, `/credits`, `/routes/estimate` |
| Auth | `POST /auth/register`, `/auth/otp/send`, `/auth/otp/verify`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `GET/PATCH /auth/me`, `POST /auth/logout`, `DELETE /auth/account` |
| Journeys | `GET/POST /journeys`, `GET/PATCH /journeys/:id` |
| Bookings | `POST /bookings/{cab,shared-taxi,hotels,tourism,parcel}`, `GET /bookings`, `GET /bookings/:id`, `POST /bookings/:id/{transition,cancel,review}` |
| Orders | `POST /orders`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/transition` |
| Payments | `POST /payments/init`, `/payments/:id/sandbox-capture`, `/payments/:id/refund`, `GET /payments`, `/transactions` |
| Account | `/notifications`, `/support/tickets`, `/addresses`, `/saved-places`, `/reviews`, `/coupons` |
| Partner | `POST /partners/claim`, `/partners/drivers`, `GET/PATCH /partners/drivers/me`, `/partners/drivers/verify-demo`, `/partners/requests`, `/partners/jobs`, `/partners/jobs/:id/accept` |

## Supabase Edge gateway

`POST {SUPABASE_URL}/functions/v1/gowayy-api` with
`{ "op": "<operation>", "args": { … } }` and `Authorization: Bearer <user JWT>` (anon
key for public ops). Response: `{ "data": … }`; errors:
`{ "error": "CODE", "message": "…" }`.

Public ops: `health, catalog, search, recommendations, credits, estimateRoute,
register, resendOtp, verifyOtp, login, forgotPassword, resetPassword`.

Everything else requires a verified caller. The gateway verifies the JWT with
`/auth/v1/user`, then calls `SECURITY DEFINER` RPCs with that same JWT so `auth.uid()`
is authoritative, or reads through PostgREST so RLS applies. Operations cover
`me, updateProfile, logout, deleteAccount`, journeys, all booking/order flows,
payments/refunds/transactions, notifications, support, addresses/saved places,
reviews/coupons, partner claims/driver registration/dispatch and job acceptance.
`resetDev` returns 501 — the development-only reset endpoint does not exist on the
Supabase backend.

`payment-webhook` accepts `POST` with a raw body and `x-gowayy-signature` HMAC-SHA256
hex digest over the raw body using `GOWAYY_PAYMENT_WEBHOOK_SECRET`. It calls
`rpc_webhook_capture` with `signatureVerified: true` only after a timing-safe comparison.

## Field-name compatibility

The customer apps submit one payload vocabulary (`pickupId`, `dropoffId`,
`vehicleClassId`, `scheduledAt`, `listingId`, `items`, `deliveryAddress`, `offeringId`,
`guests`, `date`, …). `_shared/normalize.ts` maps these to the SQL RPC argument names
(`fromPlaceId`, `toPlaceId`, `vehicleId`, `offeringId`, `travellers`, `visitDate`,
`restaurantId`/`storeId`, `productId`, …) and `camelize()` maps database rows back to
the shared camelCase types. This keeps both transports interchangeable.
