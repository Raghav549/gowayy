# GOWAYY — implementation report

**Date:** 4 November 2026 · **Branch:** `arena/9fff2983-gowayy` · **Base:** `1c92baf`
**Scope:** the 19-item customer UI, admin CMS, payments, serviceability and handover request.
**Companion document:** `docs/HANDOVER_GUIDE.md` (sections A–L, full setup and manual actions).

Every result below was run in this checkout. Anything that needs external credentials, a phone
or the Android toolchain is listed as a manual action rather than claimed as working.

---

## 1. Completed work

### Theme, splash and layout (items 1–3)
- Removed the cream/clarified-butter background and restored the original lavender brand tokens
  from the base commit: page gradient `145deg #FBF8FD → #F4ECFA 52% → #FFF9F2`, purple accent
  `#421080`, lilac/lavender surfaces, champagne `#FFA500`.
- Restored the same lavender/purple system in the admin console too (its stylesheet still held the
  cream/gold palette); the admin nav is purple and the cream login wash is gone.
- Restored the purple splash: every Android `app.json` now uses
  `assets/branding/splash-mark.png` (inverse white mark) on `#421080`; the in-app animated splash
  in customer and partner uses the same asset. No cream, sky-blue or charcoal splash remains.
- Converted the customer "Skip to content" link into a keyboard/screen-reader-only skip link
  (visually hidden until focused, never part of the normal page).
- Fixed page-width and overflow root causes: the app shell is full-width, the desktop content is
  centered beside the sidebar instead of left-pinned with an empty right strip, `#root`/`.main`
  cannot overflow, and responsive grids collapse at tablet and phone breakpoints. The skip link is
  visually clipped (screen-reader/keyboard only) rather than relying on a transform.
- Admin/partner media previews now work: their dev servers proxy `/uploads` to the API and
  `/images` to the customer asset library; the Vercel prep step copies that library into their
  build output. Partner custom CSS is imported (it previously shipped unused).

### Service visuals, offers and discovery (items 4–9)
- Replaced emoji/cartoon category art with photographic/3D-style service images at
  `/images/categories/{cabs,shared-taxi,hotels,food,groceries,tourism,experiences,packages,shop,parcels}.webp`;
  `CategoryArt.tsx` renders them with correct aspect ratio and fallbacks. Real-vehicle imagery is
  used for cabs and shared taxis.
- Admin navigation is limited to Destinations, Posters, Cities & service areas and Audit; the
  admin stylesheet was retoned from cream/gold to the same lavender/purple identity.
- Running Offers rebuilt as two side-by-side rounded poster carousels (grocery left, food right).
  Slides are image-first posters with the copy baked into the artwork (6 posters, 1200×500),
  auto-advance + manual controls, and only admin-active posters are returned by `/api/posters`.
  "Shop all"/"See all" links are black by default and invert to white-on-black on
  hover/focus/press; this now applies to the shared `.link` treatment across the customer app.
- Search suggestions are database-backed, service-scoped, keyboard navigable (combobox with
  arrow/Enter/Escape), and rendered in an unclipped portal-like layer. Search buttons execute.
- Shops & Products rebuilt: store logo, name, category, banner, location/delivery radius,
  delivery availability with hours, Visit Store, and product image/name/price. Only stores that
  actually have products are shown. Partner logos and banners are uploadable from a multi-store
  selector and are saved to the store record; a neutral lavender cover is used when absent.
- Popular Food items are photo cards (image, name, restaurant, price, ordering state) instead of
  pill cards; Local Experiences are photo cards (name, location, duration, price) that open the
  real detail/booking flow.
- `useDestinations()` merges the bundled catalogue with live DB destination records, so
  admin-created destinations and their uploaded images appear in Explore and detail pages.

### Payments (item 11)
- Server-side initiation with amount tamper check, idempotency, signed sandbox capture through
  the same HMAC webhook verifier used by real webhooks, replay protection, transaction ledger,
  refunds (customer and admin), reconciliation totals, and `cod` eligibility.
- `card` and `netbanking` now return **503 `GATEWAY_NOT_CONFIGURED`** unless
  `GOWAYY_PAYMENT_GATEWAY_KEY` is set, instead of pretending to work. No raw card data is stored
  or accepted anywhere. UPI is a sandbox intent plus server-verified capture, not a live PSP.

### Admin CMS, serviceability and RBAC (items 12–15)
- Admin console is now scoped to **Destinations**, **Posters**, **Cities & service areas** and an
  **audit log**. Legacy sections remain in the codebase for API compatibility but are not
  routable from the console; all `/api/admin/*` calls require an `admin` role server-side and
  customer/partner tokens receive 401/403.
- Destinations CMS: create/edit, activate/deactivate, ordering, cover image, multiple images,
  gallery reordering, replace image, remove image; existing seeded destinations remain editable and
  nothing was deleted. Cover-first ordering is honoured by the customer merge hook.
- Posters CMS: upload or URL, edit, replace, delete, reorder, schedule window, active toggle,
  preview, validation, upload progress.
- Cities and serviceability are DB records, with **independent food and grocery pincode lists**.
  Both customer entry points and server-side checkout validate them; out-of-area orders return
  `SERVICE_UNAVAILABLE` and the UI shows "Service unavailable in your area". Changes take effect
  without an app rebuild.

### Data, images and demo account (items 16–18)
- Product photography seeded only where a product had no image, never overwriting partner
  uploads; 8 WebP packshots and category art ship in the customer public directory. Image sources
  and licences remain tracked in `assets/images/IMAGE_SOURCES.json` / `ATTRIBUTION.md`.
- One shared demo identity works in all three apps: `demo@gowayy.app / Gw@yDemo2026` (customer,
  restaurant, grocery, property, tour operator, driver and admin roles). It is seeded
  idempotently, labelled DEMO/TEST ONLY, and `seedDemoData()` throws when `GOWAYY_ENV` or
  `NODE_ENV` is `production` (verified). Separate customer/partner/admin demo logins remain.
- Demo payments stay in sandbox; the seed and UI never claim live charging.

### Verification (item 17)
| Check | Result |
| --- | --- |
| `npm run typecheck` | 0 errors |
| `npm test` | **71 passed, 5 skipped** |
| `npm run test:integration` | 25/25 |
| `npm run test:supabase` | 16/16 |
| `npm run test:edge` | 5/5 |
| `npm run build:customer` / `build:partner` / `build:admin` | all pass |
| Live API smoke | health 200; posters 6; 5 service areas; 15 destinations; demo login all roles |
| Admin auth | `/api/admin/overview` 401 unauthenticated; customer token rejected |
| Poster CRUD | create → update → delete verified |
| Destination gallery | image add → `verified` record → image delete verified |
| Partner store branding | `POST /api/uploads` → `PATCH /api/partner/stores/:id` → logo appears in `/api/commerce/stores` |
| Production seed guard | refuses with `GOWAYY_ENV=production` |

### Handover (item 19)
`docs/HANDOVER_GUIDE.md` covers A–L: structure, required software and accounts with versions,
per-app env vars with templates and local/staging/production split, database and seeds, run/build/
test/deploy (web, API, APK), payment gateway setup, maps/email/push, demo logins, exact commands,
troubleshooting and a final manual-action checklist. New `.env.example` files were added for the
dev API and all three web apps; the mobile examples were already present.

---

## 2. Files and modules changed

**API (`apps/dev-api/src`)**
- `server.mjs` — gateway guard for card/net-banking, COD eligibility fix, service-area checkout
  enforcement, payment/refund/transaction routes.
- `admin.mjs` — poster, service-area and destination CRUD plus nested destination image routes;
  server-side admin RBAC.
- `catalog-hub.mjs` — partner store PATCH accepts `logo` and `banner`.
- `commerce.mjs` — `/api/commerce/stores` returns `logo` and `banner`.
- `seed.mjs` — production guard, content image seeding, service areas, posters, db stores.

**Customer web**
- `screens/Home.tsx`, `LocalMarket.tsx`, `Explore.tsx`, `DestinationDetail.tsx`,
  `screens/shared.tsx` (`useDestinations`), `Profile.tsx`.
- `components/PosterCarousel.tsx`, `SearchSelect.tsx`, `CategoryArt.tsx`, `Splash.tsx`,
  `Layout.tsx`; `store/useServiceArea.ts`; `styles/global.css`.

**Partner web**
- `screens/Manage.tsx` (store logo/banner upload + preview), `styles.css`.

**Admin web**
- `sections/content.tsx` (Posters, ServiceAreas, Destinations), `App.tsx` (scoped navigation),
  `styles.css`.

**Shared / design**
- `packages/api-client/src/http.ts` — poster, service-area and destination methods.
- `packages/design-system/src/tokens.ts`, `packages/ui/src/web.css`,
  `assets/brand/brand-tokens.json` — restored lavender theme.

**Mobile**
- Three `app.json` splash blocks, customer `app/_layout.tsx`, partner `app/index.tsx`, three
  `assets/branding/splash-mark.png` files.

**Tests and docs**
- `tests/unit/design-and-notifications.test.ts`, `tests/unit/mobile-and-edge.test.ts` updated to
  the restored palette and purple splash asset.
- `docs/IMPLEMENTATION_REPORT.md` (this file), `docs/HANDOVER_GUIDE.md` (new), `docs/SETUP.md`
  splash line, `.env.example` files, `.gitignore` uploads entry.

---

## 3. Remaining issues and honest limitations

1. **Live card/net-banking acquiring is not implemented.** The safe guard is in place (503), the
   webhook verifier, ledger, refunds and reconciliation are implemented, but a provider-specific
   order/intent adapter must be added once merchant credentials exist. UPI remains a sandbox
   intent. No claim of live payment success is made anywhere.
2. **Push notifications and embedded maps are not configured.** In-app notifications work; FCM/
   Expo push credentials and a map SDK key have not been supplied.
3. **Real email OTP requires a provider.** Development uses a clearly labelled demo adapter that
   refuses to pretend an email was sent.
4. **Store art is partly neutral by design.** Only demo records with verified imagery show a
   banner/logo; others use the neutral lavender fallback. Real partner branding must be uploaded.
5. **Android APKs could not be built in this sandbox** (no Android SDK/keystore). CI workflow is
   ready; signed builds need the `ANDROID_*` secrets.
6. **Legacy admin screens still exist in source** for API compatibility but are not reachable from
   the scoped console navigation. Their APIs remain admin-only; remove them in a future cleanup
   if the reduced scope is permanent.
7. **Demo password constants live in the dev seed.** They are development-only and blocked in
   production by the seed guard, but rotate/delete the demo accounts before a public launch.

---

## 4. Exact manual actions for you

1. **Payment gateway** — create a merchant account, supply key id/secret and webhook secret
   server-side, then add the provider order/intent adapter and run one real sandbox payment +
   refund. Until then, leave `GOWAYY_PAYMENT_GATEWAY_KEY` empty.
2. **Email OTP** — supply an HTTPS provider URL and API key; verify one registration.
3. **Supabase** — create the project, set `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, run `supabase db push`, deploy `gowayy-api` and
   `payment-webhook`, then set `VITE_GOWAYY_BACKEND=supabase` and the two public keys.
4. **Vercel** — supply `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and the three project ids; set each
   project's API/Supabase env vars.
5. **Android signing** — supply `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`; trigger the Mobile APK workflow and install on a
   device.
6. **Optional** — Firebase/Expo push credentials, a map SDK key if embedded maps are wanted, and
   production photography with documented rights.
7. **Launch hygiene** — rotate or delete demo accounts, set `GOWAYY_ENV=production`, a strong
   `GOWAYY_WEBHOOK_SECRET`, backups and monitoring.

Full step-by-step commands, troubleshooting and the pre-launch checklist are in
`docs/HANDOVER_GUIDE.md`.
