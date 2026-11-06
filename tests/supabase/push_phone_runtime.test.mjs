import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, createUser, asUser } from './harness.mjs';

const phone = '+919876543210';

test('phone OTP guards enforce cooldown and verified finalization creates only a customer profile', async () => {
  const context = await createDatabase({ withSeed: false });
  const { db } = context;
  try {
    assert.deepEqual(context.errors, []);
    await assert.rejects(() => db.query(`SELECT public.rpc_phone_otp_request_guard('9876543210')`), /INVALID_PHONE/);
    const accepted = (await db.query(`SELECT public.rpc_phone_otp_request_guard($1) AS value`, [phone])).rows[0].value;
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.resendAfterSeconds, 60);
    await assert.rejects(() => db.query(`SELECT public.rpc_phone_otp_request_guard($1)`, [phone]), /OTP_RESEND_TOO_SOON/);
    // Verification is allowed; repeated requests are rate-limited by
    // the dedicated verification bucket rather than by the resend cooldown.
    const verify = (await db.query(`SELECT public.rpc_phone_otp_verify_guard($1) AS value`, [phone])).rows[0].value;
    assert.equal(verify.accepted, true);

    const auth = (await db.query(`INSERT INTO auth.users (email) VALUES (NULL) RETURNING id`)).rows[0];
    const finalized = (await db.query(`SELECT public.rpc_finalize_phone_auth($1::jsonb) AS value`, [JSON.stringify({ authUserId: auth.id, phone, firstName: 'Phone', lastName: 'Traveller' })])).rows[0].value;
    assert.equal(finalized.createdProfile, true);
    const profile = (await db.query(`SELECT first_name, last_name, phone FROM public.profiles WHERE id = $1`, [auth.id])).rows[0];
    assert.deepEqual(profile, { first_name: 'Phone', last_name: 'Traveller', phone });
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.user_roles WHERE user_id = $1 AND role = 'customer'`, [auth.id])).rows[0].count, 1);
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.user_roles WHERE user_id = $1 AND role IN ('admin','seller')`, [auth.id])).rows[0].count, 0);

    await db.query(`SELECT public.rpc_finalize_phone_auth($1::jsonb)`, [JSON.stringify({ authUserId: auth.id, phone, firstName: 'Changed', lastName: 'Name' })]);
    assert.equal((await db.query(`SELECT first_name FROM public.profiles WHERE id = $1`, [auth.id])).rows[0].first_name, 'Phone', 'replay must not overwrite existing names');
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.notifications WHERE user_id = $1 AND type = 'welcome'`, [auth.id])).rows[0].count, 1);
  } finally { await context.close(); }
});

test('push tokens, preferences, durable retry and provider revocation are atomic and owner-scoped', async () => {
  const context = await createDatabase({ withSeed: false });
  const { db } = context;
  try {
    assert.deepEqual(context.errors, []);
    const user = await createUser(db, 'push-owner@example.test');
    const other = await createUser(db, 'push-other@example.test');
    await asUser(db, user);
    await assert.rejects(() => db.query(`SELECT public.rpc_register_push_token($1::jsonb)`, [JSON.stringify({ installationId: 'android-test-0001', provider: 'expo', platform: 'android', token: 'not-a-token' })]), /INVALID_EXPO_PUSH_TOKEN/);
    const android = (await db.query(`SELECT public.rpc_register_push_token($1::jsonb) AS value`, [JSON.stringify({ installationId: 'android-test-0001', provider: 'expo', platform: 'android', token: 'ExponentPushToken[runtime-test-token]' })])).rows[0].value;
    assert.equal(android.registered, true);
    assert.equal(android.token, undefined, 'registration never echoes a device token');
    const web = (await db.query(`SELECT public.rpc_register_push_token($1::jsonb) AS value`, [JSON.stringify({ installationId: 'browser-test-0001', provider: 'web_push', platform: 'web', token: 'https://push.example.test/subscription/one', subscription: { endpoint: 'https://push.example.test/subscription/one', keys: { auth: 'auth-secret-test', p256dh: 'p256dh-key-material-test' } } })])).rows[0].value;
    assert.equal(web.provider, 'web_push');
    assert.equal(web.subscription, undefined);

    await asUser(db, other);
    await db.query(`SELECT public.rpc_unregister_push_token('android-test-0001')`);
    await asUser(db, user);
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.device_push_tokens WHERE revoked_at IS NULL`)).rows[0].count, 2, 'another account cannot revoke the token');

    await db.query(`SELECT public.rpc_notification_preferences($1::jsonb)`, [JSON.stringify({ orderUpdates: false })]);
    const orderNotification = (await db.query(`INSERT INTO public.notifications (user_id,type,title,body,dedupe_key) VALUES ($1,'order.created','Order','Order body','push-order-test') RETURNING id`, [user])).rows[0];
    const bookingNotification = (await db.query(`INSERT INTO public.notifications (user_id,type,title,body,dedupe_key) VALUES ($1,'booking.confirmed','Booking','Booking body','push-booking-test') RETURNING id`, [user])).rows[0];
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.push_deliveries WHERE notification_id = $1`, [orderNotification.id])).rows[0].count, 0, 'disabled category must not queue');
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.push_deliveries WHERE notification_id = $1`, [bookingNotification.id])).rows[0].count, 2);

    const claimed = (await db.query(`SELECT public.rpc_claim_push_deliveries(10) AS value`)).rows[0].value;
    assert.equal(claimed.length, 2);
    assert.ok(claimed.every((row) => row.attempts === 1 && row.title === 'Booking'));
    assert.equal((await db.query(`SELECT public.rpc_claim_push_deliveries(10) AS value`)).rows[0].value.length, 0, 'claimed rows cannot be sent twice concurrently');
    await db.query(`SELECT public.rpc_finish_push_delivery($1, 'retry', 'temporary provider failure', NULL, false)`, [claimed[0].id]);
    await db.query(`SELECT public.rpc_finish_push_delivery($1, 'sent', NULL, 'provider-message-1', false)`, [claimed[1].id]);
    assert.equal((await db.query(`SELECT status FROM public.push_deliveries WHERE id = $1`, [claimed[0].id])).rows[0].status, 'retry');
    assert.equal((await db.query(`SELECT provider_message_id FROM public.push_deliveries WHERE id = $1`, [claimed[1].id])).rows[0].provider_message_id, 'provider-message-1');
    assert.equal((await db.query(`SELECT public.rpc_claim_push_deliveries(10) AS value`)).rows[0].value.length, 0, 'backoff is respected');

    await db.query(`UPDATE public.push_deliveries SET next_attempt_at = now() - interval '1 second' WHERE id = $1`, [claimed[0].id]);
    const retried = (await db.query(`SELECT public.rpc_claim_push_deliveries(10) AS value`)).rows[0].value;
    assert.equal(retried.length, 1);
    assert.equal(retried[0].attempts, 2);
    await db.query(`SELECT public.rpc_finish_push_delivery($1, 'failed', 'DeviceNotRegistered', NULL, true)`, [claimed[0].id]);
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.device_push_tokens WHERE id = $1 AND revoked_at IS NOT NULL`, [retried[0].tokenId])).rows[0].count, 1);

    await db.query(`SELECT public.rpc_unregister_push_token('browser-test-0001')`);
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM public.device_push_tokens WHERE revoked_at IS NULL`)).rows[0].count, 0);
  } finally { await context.close(); }
});
