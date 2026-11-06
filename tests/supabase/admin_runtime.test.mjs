import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, createUser, asUser } from './harness.mjs';

test('admin read models execute for every control-centre resource and require admin', async () => {
  const context = await createDatabase({ withSeed: true });
  const { db } = context;
  try {
    assert.deepEqual(context.errors, []);
    const admin = await createUser(db, 'admin-runtime@example.com');
    const customer = await createUser(db, 'customer-runtime@example.com');
    await db.query(`INSERT INTO user_roles(user_id, role) VALUES ($1, 'admin')`, [admin]);
    await asUser(db, customer);
    await assert.rejects(() => db.query(`SELECT rpc_admin_read('overview', '{}')`), /ADMIN_REQUIRED/);
    await asUser(db, admin);
    const resources = ['overview', 'customers', 'partners', 'stores', 'categories', 'products', 'orders', 'bookings',
      'payments', 'settlements', 'banners', 'offers', 'posters', 'service-areas', 'destinations', 'support', 'audit', 'analytics', 'settings'];
    for (const resource of resources) {
      const result = await db.query(`SELECT rpc_admin_read($1, '{}') value`, [resource]);
      assert.ok(result.rows[0].value && typeof result.rows[0].value === 'object', `${resource} must return an object`);
    }
    const partners = (await db.query(`SELECT rpc_admin_read('partners', '{}') value`)).rows[0].value;
    assert.ok(partners.items.every((item) => item.claims.every((claim) => claim.claimedAt)));
    await assert.rejects(() => db.query(`SELECT rpc_admin_read('not-a-resource', '{}')`), /NOT_FOUND/);
  } finally {
    await context.close();
  }
});
