import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, createUser, asUser } from './harness.mjs';

/**
 * Production posture.
 *
 * Migration 202611040013 turns the development adapters off by default. These
 * tests pin that behaviour so a future migration cannot silently re-enable them:
 * a live deployment must never return an OTP to a client, never auto-approve a
 * partner claim and never capture a payment without a verified gateway webhook.
 */

let ship;   // migrations only, no harness override: what a fresh deploy gets
let prod;   // production posture, forced
test.before(async () => {
  ship = await createDatabase({ withSeed: true, demoMode: null });
  prod = await createDatabase({ withSeed: true, demoMode: false });
});
test.after(async () => { await ship?.close(); await prod?.close(); });

const one = async (ctx, sql, params = []) => (await ctx.db.query(sql, params)).rows[0];

test('migrations execute cleanly and ship demo_mode = false', async () => {
  assert.deepEqual(ship.errors, []);
  assert.deepEqual(prod.errors, []);
  assert.equal((await one(ship, `SELECT public.gowayy_demo_mode() AS demo`)).demo, false,
    'a freshly migrated database must not start in demo mode');
  const mode = (await one(ship, `SELECT public.gowayy_runtime_mode() AS m`)).m;
  assert.equal(mode.demo_mode, false);
  assert.equal(mode.payment_provider, 'unconfigured');
  assert.equal(mode.otp_mode, 'provider_required');
  assert.match(mode.posture, /^PRODUCTION/);
});

test('registration never leaks an OTP when demo mode is off', async () => {
  const email = 'prod-signup@example.test';
  const authUser = await one(prod, `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [email]);
  const reg = (await one(prod,
    `SELECT public.rpc_register($1::jsonb) AS r`,
    [JSON.stringify({ email, firstName: 'Prod', lastName: 'Signup', authUserId: authUser.id })])).r;

  assert.equal(reg.demoMode, false);
  assert.equal(reg.demoOtp, null, 'the live code must never leave the database');
  assert.match(reg.demoNotice, /sent by the configured email provider/i);
  assert.equal(reg.otpRequired, true, 'verification is still mandatory');
  assert.equal(reg.mode, 'provider_required');

  // The code is stored hashed, so it cannot be recovered from the row either.
  const stored = await one(prod,
    `SELECT code_hash, demo_mode FROM registration_otps WHERE id = $1`, [reg.registrationId]);
  assert.equal(stored.demo_mode, false);
  assert.match(stored.code_hash, /^[0-9a-f]{64}$/, 'OTP must be stored as a salted hash');
});

test('sandbox payment capture is refused outside demo mode', async () => {
  const uid = await createUser(prod.db, 'prod-payer@example.test');
  await asUser(prod.db, uid);
  await prod.db.query(`SET ROLE authenticated`);
  await assert.rejects(
    () => prod.db.query(`SELECT public.rpc_capture_sandbox_payment(gen_random_uuid())`),
    /SANDBOX_DISABLED/,
    'a payment must only be captured through the verified gateway webhook',
  );
  await prod.db.query(`RESET ROLE`);
});

test('partner claims stay pending and demo driver verification is refused', async () => {
  const uid = await createUser(prod.db, 'prod-partner@example.test');
  await asUser(prod.db, uid);
  const listing = await one(prod, `SELECT id FROM restaurants ORDER BY id LIMIT 1`);
  assert.ok(listing?.id, 'the seed must provide a restaurant to claim');

  const claim = (await one(prod, `SELECT public.rpc_claim_partner('restaurant', $1) AS r`, [listing.id])).r;
  assert.equal(claim.state, 'pending', 'a partner claim must await document review');
  assert.equal(claim.demoNotice, 'Verification pending.');
  assert.match(claim.demoNotice, /^(?!DEMO)/, 'no demo notice in production');

  await assert.rejects(
    () => prod.db.query(`SELECT public.rpc_verify_driver_demo()`),
    /DEMO_DISABLED/,
    'the demo driver-verification shortcut must be unavailable in production',
  );
});

test('app_config cannot be read or written by a client', async () => {
  const uid = await createUser(prod.db, 'prod-attacker@example.test');
  await asUser(prod.db, uid);
  await prod.db.query(`SET ROLE authenticated`);

  // Two independent layers stop a client here: no table privilege is granted to
  // anon/authenticated, and Row Level Security is enabled with no policies. Either
  // one on its own is sufficient; accept whichever fires first.
  const denied = /permission denied|row-level security/i;
  let readable = 0;
  try {
    readable = (await prod.db.query(`SELECT count(*)::int c FROM public.app_config`)).rows[0].c;
  } catch (error) {
    assert.match(error.message, denied, 'reading app_config must be refused');
    readable = 0;
  }
  assert.equal(readable, 0, 'RLS must hide app_config from clients');

  await assert.rejects(
    () => prod.db.query(`UPDATE public.app_config SET value='true'::jsonb WHERE key='demo_mode'`),
    denied,
    'a client must not be able to switch demo mode back on',
  );
  await prod.db.query(`RESET ROLE`);

  assert.equal((await one(prod, `SELECT public.gowayy_demo_mode() AS demo`)).demo, false,
    'demo mode must still be off after the attempted write');
});
