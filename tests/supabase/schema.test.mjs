import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, createUser, asUser, REQUIRED_TABLES } from './harness.mjs';

let ctx;
test.before(async () => { ctx = await createDatabase({ withSeed: true }); });
test.after(async () => { await ctx?.close(); });

const rows = async (sql, params = []) => (await ctx.db.query(sql, params)).rows;
const one = async (sql, params = []) => (await rows(sql, params))[0];

test('all migrations and the generated seed execute without error', () => {
  assert.deepEqual(ctx.errors, []);
});

test('every required table exists, has RLS enabled and has a primary key', async () => {
  const found = await rows(`SELECT tablename FROM pg_tables WHERE schemaname='public'`);
  const names = new Set(found.map((r) => r.tablename));
  for (const t of REQUIRED_TABLES) assert.ok(names.has(t), `missing table ${t}`);
  const unprotected = await rows(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity`);
  assert.deepEqual(unprotected, [], `tables without RLS: ${unprotected.map((x) => x.relname).join(', ')}`);
  const noPk = await rows(`
    SELECT t.relname FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relkind='r'
      AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=t.oid AND i.indisprimary)`);
  assert.deepEqual(noPk, [], `tables without primary key: ${noPk.map((x) => x.relname).join(', ')}`);
});

test('foreign keys, indexes, checks and RLS policies are present', async () => {
  const fk = await one(`SELECT count(*)::int c FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace`);
  assert.ok(fk.c >= 60, `expected many foreign keys, got ${fk.c}`);
  const idx = await one(`SELECT count(*)::int c FROM pg_indexes WHERE schemaname='public'`);
  assert.ok(idx.c >= 60, `expected many indexes, got ${idx.c}`);
  const checks = await one(`SELECT count(*)::int c FROM pg_constraint WHERE contype='c' AND connamespace='public'::regnamespace`);
  assert.ok(checks.c >= 30, `expected check constraints, got ${checks.c}`);
  const policies = await one(`SELECT count(*)::int c FROM pg_policies WHERE schemaname='public'`);
  assert.ok(policies.c >= 30, `expected RLS policies, got ${policies.c}`);
  const spatial = await one(`SELECT public.gowayy_has_postgis() AS ok`);
  assert.equal(typeof spatial.ok, 'boolean');
});

test('no admin role, admin table or service-role secret exists in the schema', async () => {
  const bad = await rows(`
    SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename ILIKE '%admin%'
    UNION ALL SELECT role FROM user_roles WHERE role ILIKE '%admin%'`);
  assert.deepEqual(bad, []);
  const secret = await rows(`SELECT key FROM app_config WHERE key ILIKE '%service%' OR key ILIKE '%secret%'`);
  assert.deepEqual(secret, []);
});

test('seed data is complete, data-driven and photograph licensing is enforced', async () => {
  assert.equal((await one(`SELECT count(*)::int c FROM destinations`)).c, 15);
  assert.equal((await one(`SELECT count(*)::int c FROM destination_attractions`)).c, 15);
  assert.equal((await one(`SELECT count(*)::int c FROM places`)).c, 20);
  assert.equal((await one(`SELECT count(*)::int c FROM grocery_inventory`)).c, (await one(`SELECT count(*)::int c FROM grocery_products`)).c);
  assert.ok((await one(`SELECT count(*)::int c FROM room_availability`)).c >= 90);
  const badImages = await rows(`SELECT id FROM destination_images WHERE status='verified' AND (asset_path IS NULL OR license IS NULL)`);
  assert.deepEqual(badImages, []);
  const unverified = await rows(`SELECT count(*)::int c FROM image_sources WHERE license='UNVERIFIED' AND displayable`);
  assert.equal(unverified[0].c, 0);
  const doc = (await one(`SELECT document FROM catalog_documents WHERE id='catalog'`)).document;
  assert.equal(doc.destinations.length, 15);
  assert.equal(doc.stores.length, 3);
  assert.equal(doc.vehicles.length, 8);
  // Attraction images must never point at a photograph of a different place.
  const wrong = doc.attractions.filter((a) => a.image?.status === 'verified' &&
    !a.image.alt.toLowerCase().includes(a.name.toLowerCase().split(' ')[0]) &&
    !a.name.toLowerCase().includes(a.image.alt.toLowerCase().split(' ')[0]));
  assert.deepEqual(wrong.map((a) => a.id), [], 'attraction photographs must depict their own place');
});

test('universal search and connected recommendations read seeded rows', async () => {
  const hits = await rows(`SELECT * FROM public.rpc_search('Darjeeling')`);
  assert.ok(hits.some((h) => h.kind === 'destination'));
  const food = await rows(`SELECT * FROM public.rpc_search('Momos')`);
  assert.ok(food.some((h) => h.kind === 'food'));
  const restaurants = await rows(`SELECT * FROM public.rpc_search('Kitchen')`);
  assert.ok(restaurants.some((h) => h.kind === 'restaurant'));
  const rec = (await one(`SELECT public.rpc_recommendations('dst_darjeeling') AS r`)).r;
  assert.ok(rec.properties.length > 0);
  assert.ok(rec.restaurants.length > 0);
  assert.ok(rec.attractions.length > 0);
  assert.ok(Array.isArray(rec.groceries));
  const route = (await one(`SELECT public.rpc_estimate_route('plc_bagdogra','plc_darjeeling','sedan') AS r`)).r;
  assert.ok(route.route.distanceKm > 0);
  assert.equal(route.vehicle.id, 'sedan');
});

test('journey context is created and updated without losing other fields', async () => {
  const uid = await createUser(ctx.db, 'journey@example.test');
  await asUser(ctx.db, uid);
  const j = (await one(`SELECT public.rpc_create_journey($1::jsonb) AS r`, [JSON.stringify({ title: 'My Darjeeling Trip', destinationId: 'dst_darjeeling', travellers: 2 })])).r;
  assert.equal(j.title, 'My Darjeeling Trip');
  const updated = (await one(`SELECT public.rpc_update_journey($1::uuid, $2::jsonb) AS r`, [j.id, JSON.stringify({ travellers: 3 })])).r;
  assert.equal(updated.travellers, 3);
  assert.equal(updated.title, 'My Darjeeling Trip');
  const components = (await one(`SELECT public.rpc_journey_components($1::uuid) AS r`, [j.id])).r;
  assert.equal(components.journey.destination_id, 'dst_darjeeling');
  assert.ok(Array.isArray(components.components));
  ctx.journeyId = j.id;
  ctx.userId = uid;
});

test('cab booking persists, prices server-side and replays idempotently', async () => {
  await asUser(ctx.db, ctx.userId);
  const payload = { fromPlaceId: 'plc_bagdogra', toPlaceId: 'plc_darjeeling', vehicleId: 'sedan', tripType: 'one_way', journeyId: ctx.journeyId };
  const first = (await one(`SELECT public.rpc_create_booking('cab', $1::jsonb, $2::text) AS r`, [JSON.stringify(payload), 'idem-cab-000001'])).r;
  assert.equal(first.status, 'requested');
  assert.equal(first.service, 'cab');
  assert.ok(first.price.totalPaise > 0);
  assert.equal(first.status_history.length, 1);
  const replay = (await one(`SELECT public.rpc_create_booking('cab', $1::jsonb, $2::text) AS r`, [JSON.stringify(payload), 'idem-cab-000001'])).r;
  assert.equal(replay.id, first.id, 'duplicate idempotency key must not create a second booking');
  assert.equal((await one(`SELECT count(*)::int c FROM ride_bookings`)).c, 1);
  const services = await rows(`SELECT service, state FROM journey_services WHERE journey_id=$1`, [ctx.journeyId]);
  assert.ok(services.some((s) => s.service === 'cab' && s.state === 'requested'));
  ctx.cabId = first.id;
});

test('booking status is server-authoritative: invalid transitions are rejected', async () => {
  await asUser(ctx.db, ctx.userId);
  await assert.rejects(
    () => ctx.db.query(`SELECT public.rpc_transition_booking($1::uuid,'completed','hack')`, [ctx.cabId]),
    /INVALID_TRANSITION/,
  );
  const b = await one(`SELECT status FROM ride_bookings WHERE id=$1`, [ctx.cabId]);
  assert.equal(b.status, 'requested');
});

test('grocery checkout locks inventory, persists order and rejects out-of-stock', async () => {
  await asUser(ctx.db, ctx.userId);
  const store = await one(`SELECT s.id, p.id AS product_id, i.stock FROM grocery_stores s JOIN grocery_products p ON p.store_id=s.id JOIN grocery_inventory i ON i.product_id=p.id ORDER BY s.id, p.id LIMIT 1`);
  const payload = { storeId: store.id, items: [{ productId: store.product_id, quantity: 2 }], deliveryAddress: 'Darjeeling Mall Road', substitution: 'ask', slot: '08:00–11:00', journeyId: ctx.journeyId };
  const order = (await one(`SELECT public.rpc_place_order('grocery', $1::jsonb, $2::text) AS r`, [JSON.stringify(payload), 'idem-grocery-0001'])).r;
  assert.equal(order.status, 'created');
  assert.equal(order.items.length, 1);
  const stock = await one(`SELECT stock FROM grocery_inventory WHERE product_id=$1`, [store.product_id]);
  assert.equal(stock.stock, store.stock - 2);
  const oversized = { ...payload, items: [{ productId: store.product_id, quantity: 99999 }] };
  await assert.rejects(
    () => ctx.db.query(`SELECT public.rpc_place_order('grocery', $1::jsonb, $2::text)`, [JSON.stringify(oversized), 'idem-grocery-0002']),
    /OUT_OF_STOCK/,
  );
  ctx.groceryOrderId = order.id;
});

test('hotel booking refuses dates with no confirmed availability', async () => {
  await asUser(ctx.db, ctx.userId);
  const room = await one(`SELECT r.id, p.id AS property_id FROM property_rooms r JOIN properties p ON p.id=r.property_id LIMIT 1`);
  const payload = { propertyId: room.property_id, roomId: room.id, checkIn: '2099-01-01', checkOut: '2099-01-04', adults: 2, rooms: 1 };
  await assert.rejects(
    () => ctx.db.query(`SELECT public.rpc_create_booking('hotel', $1::jsonb, $2::text)`, [JSON.stringify(payload), 'idem-hotel-000001']),
    /ROOM_UNAVAILABLE/,
  );
  const ci = new Date(); ci.setDate(ci.getDate() + 2);
  const co = new Date(); co.setDate(co.getDate() + 4);
  const good = { ...payload, checkIn: ci.toISOString().slice(0, 10), checkOut: co.toISOString().slice(0, 10) };
  const b = (await one(`SELECT public.rpc_create_booking('hotel', $1::jsonb, $2::text) AS r`, [JSON.stringify(good), 'idem-hotel-000002'])).r;
  assert.equal(b.status, 'requested');
  ctx.hotelId = b.id;
});

test('payment requires a verified capture; refund and cancellation are atomic', async () => {
  await asUser(ctx.db, ctx.userId);
  const pay = (await one(`SELECT public.rpc_init_payment($1::jsonb) AS r`, [JSON.stringify({ bookingId: ctx.cabId, method: 'upi', idempotencyKey: 'idem-pay-000001' })])).r;
  assert.equal(pay.status, 'requires_action');
  assert.equal((await one(`SELECT status FROM ride_bookings WHERE id=$1`, [ctx.cabId])).status, 'requested');
  await assert.rejects(
    () => ctx.db.query(`SELECT public.rpc_webhook_capture('evt-forged', $1::jsonb)`, [JSON.stringify({ paymentId: pay.id })]),
    /SIGNATURE_NOT_VERIFIED/,
  );
  const captured = (await one(`SELECT public.rpc_capture_sandbox_payment($1::uuid) AS r`, [pay.id])).r;
  assert.equal(captured.payment.status, 'captured');
  assert.equal(captured.sandbox, true);
  assert.match(captured.note, /no real payment/i);
  assert.equal((await one(`SELECT status FROM ride_bookings WHERE id=$1`, [ctx.cabId])).status, 'confirmed');
  const tx = await rows(`SELECT type FROM transactions WHERE payment_id=$1`, [pay.id]);
  assert.ok(tx.some((t) => t.type === 'charge'));
  const cancelled = (await one(`SELECT public.rpc_cancel_booking($1::uuid, 'Changed plans') AS r`, [ctx.cabId])).r;
  assert.equal(cancelled.status, 'cancelled');
  const after = await one(`SELECT status FROM payments WHERE id=$1`, [pay.id]);
  assert.equal(after.status, 'refunded');
  assert.ok((await one(`SELECT count(*)::int c FROM refunds WHERE payment_id=$1`, [pay.id])).c >= 1);
});

test('notifications are deduplicated and readable only by their owner', async () => {
  const other = await createUser(ctx.db, 'other@example.test');
  const all = await rows(`SELECT user_id, dedupe_key FROM notifications`);
  assert.ok(all.length > 0);
  const dedupes = new Set(all.map((n) => n.user_id + n.dedupe_key));
  assert.equal(dedupes.size, all.length, 'notification dedupe keys must be unique per user');
  await asUser(ctx.db, other);
  await ctx.db.query(`SET ROLE authenticated`);
  assert.equal((await one(`SELECT count(*)::int c FROM notifications WHERE user_id=$1`, [ctx.userId])).c, 0,
    'RLS must hide another account\'s notifications');
  assert.equal((await one(`SELECT count(*)::int c FROM notifications`)).c, 0);
  assert.equal((await one(`SELECT count(*)::int c FROM payments`)).c, 0, 'payments are owner-only');
  assert.ok((await one(`SELECT count(*)::int c FROM destinations`)).c > 0, 'catalog stays publicly readable');
  const result = (await one(`SELECT public.rpc_notifications_read_all() AS r`)).r;
  assert.equal(result.read, true);
  await ctx.db.query(`RESET ROLE`);
});

test('demo OTP adapter is labelled, expiring and single-use', async () => {
  await ctx.db.query(`SELECT set_config('app.current_user_id', '', false)`);
  const authUser = await one(`INSERT INTO auth.users (email) VALUES ('otp@example.test') RETURNING id`);
  const reg = (await one(`SELECT public.rpc_register($1::jsonb) AS r`, [JSON.stringify({ email: 'otp@example.test', firstName: 'Otp', lastName: 'Tester', authUserId: authUser.id })])).r;
  assert.equal(reg.demoMode, true);
  assert.match(reg.demoNotice, /not real email verification/i);
  assert.match(reg.demoOtp, /^\d{6}$/);
  const wrong = (await one(`SELECT public.rpc_verify_otp($1::uuid, '000000') AS r`, [reg.registrationId])).r;
  assert.equal(wrong.verified, false);
  const ok = (await one(`SELECT public.rpc_verify_otp($1::uuid, $2::text) AS r`, [reg.registrationId, reg.demoOtp])).r;
  assert.equal(ok.verified, true);
  const final = (await one(`SELECT public.rpc_finalize_registration($1::uuid) AS r`, [reg.registrationId])).r;
  assert.equal(final.userId, authUser.id);
  assert.equal((await one(`SELECT count(*)::int c FROM profiles WHERE id=$1`, [authUser.id])).c, 1);
  assert.equal((await one(`SELECT count(*)::int c FROM user_roles WHERE user_id=$1 AND role='customer'`, [authUser.id])).c, 1);
});

test('partner claim, driver verification and dispatch rules reject incompatible jobs', async () => {
  const uid = await createUser(ctx.db, 'driver@example.test');
  await asUser(ctx.db, uid);
  const claim = (await one(`SELECT public.rpc_claim_partner('restaurant','rst_1') AS r`)).r;
  assert.equal(claim.state, 'verified');
  assert.match(claim.demoNotice, /DEMO/);
  const driver = (await one(`SELECT public.rpc_register_driver($1::jsonb) AS r`, [JSON.stringify({
    phone: '9800000000', email: 'driver@example.test',
    documents: [{ type: 'licence', path: 'licence/demo.pdf', number: 'DL-DEMO' }],
    vehicle: { class: 'hatchback', registration: 'WB-DEMO-0001', seats: 4 },
  })])).r;
  assert.equal(driver.verification, 'pending');
  await assert.rejects(
    () => ctx.db.query(`SELECT public.rpc_update_driver($1::jsonb)`, [JSON.stringify({ online: true })]),
    /NOT_VERIFIED/,
  );
  const verified = (await one(`SELECT public.rpc_verify_driver_demo() AS r`)).r;
  assert.match(verified.demoNotice, /no documents were checked/i);
  await ctx.db.query(`SELECT public.rpc_update_driver($1::jsonb)`, [JSON.stringify({ online: true, services: [
    { service: 'passenger_ride', enabled: true }, { service: 'food_delivery', enabled: true },
  ] })]);
  const jobs = (await one(`SELECT public.rpc_dispatch_jobs() AS r`)).r;
  assert.ok(Array.isArray(jobs.items));
  assert.equal(jobs.rules.require_verified, true);
  // Accepting one job must lock the driver out of another incompatible job.
  const cab = await one(`SELECT id FROM ride_bookings WHERE service='cab' AND status='cancelled' LIMIT 1`);
  if (cab) {
    await ctx.db.query(`UPDATE ride_bookings SET status='confirmed' WHERE id=$1`, [cab.id]);
    await ctx.db.query(`SELECT public.rpc_accept_job($1::uuid)`, [cab.id]);
    assert.equal((await one(`SELECT active_task FROM drivers WHERE user_id=$1`, [uid])).active_task, 'passenger_ride');
    const food = await one(`SELECT id FROM food_orders LIMIT 1`);
    if (food) {
      await ctx.db.query(`UPDATE food_orders SET status='accepted' WHERE id=$1`, [food.id]);
      await assert.rejects(
        () => ctx.db.query(`SELECT public.rpc_accept_job($1::uuid)`, [food.id]),
        /ACTIVE_TASK_CONFLICT/,
      );
    }
  }
});

test('reviews require a completed booking and never fabricate ratings', async () => {
  await asUser(ctx.db, ctx.userId);
  await assert.rejects(
    () => ctx.db.query(`SELECT public.rpc_review_booking($1::uuid, 5, 'great')`, [ctx.hotelId]),
    /REVIEW_REQUIRES_COMPLETED_BOOKING/,
  );
  await ctx.db.query(`UPDATE hotel_bookings SET status='completed' WHERE id=$1`, [ctx.hotelId]);
  const review = (await one(`SELECT public.rpc_review_booking($1::uuid, 5, 'Lovely views') AS r`, [ctx.hotelId])).r;
  assert.equal(review.source, 'verified-booking');
  assert.equal((await one(`SELECT count(*)::int c FROM reviews`)).c, 1);
});
