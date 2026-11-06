import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, createUser, asUser } from './harness.mjs';

test('marketplace capture, settlement and provider-confirmed refunds are atomic and honest', async () => {
  const context = await createDatabase({ withSeed: true });
  const { db } = context;
  try {
    assert.deepEqual(context.errors, []);
    const customer = await createUser(db, 'buyer@example.com');
    const seller = await createUser(db, 'seller@example.com');
    await db.query(`INSERT INTO user_roles(user_id, role) VALUES ($1, 'seller')`, [seller]);
    await db.query(`INSERT INTO grocery_stores(id, destination_id, owner_user_id, name, lat, lng, address, published, status)
      VALUES ('str_pay', 'dst_darjeeling', $1, 'Payment Store', 27.04, 88.26, 'Darjeeling', true, 'active')`, [seller]);
    await db.query(`INSERT INTO marketplace_categories(id, slug, name) VALUES ('cat_pay', 'payment-category', 'Payment Category')`);
    await db.query(`INSERT INTO marketplace_products(id, store_id, category_id, brand, name, category, slug, published)
      VALUES ('prd_pay', 'str_pay', 'cat_pay', 'GOWAYY', 'Payment Product', 'Payment Category', 'payment-product', true)`);
    await db.query(`INSERT INTO product_variants(id, product_id, label, price_paise, mrp_paise, stock)
      VALUES ('var_pay', 'prd_pay', 'Default', 10000, 10000, 5)`);
    await asUser(db, customer);
    const address = (await db.query(`SELECT rpc_address_create($1::jsonb) value`, [JSON.stringify({
      name: 'Buyer', phone: '9876543210', line: '1 Payment Road', city: 'Darjeeling', pincode: '734101', house: '1', road: 'Payment Road',
    })])).rows[0].value;
    assert.equal(address.name, 'Buyer');
    assert.equal(address.line, '1 Payment Road');
    assert.equal(address.pincode, '734101');
    assert.equal(address.phone, '9876543210');
    await db.query(`SELECT rpc_cart_upsert($1, 'prd_pay', 'var_pay', 1, null)`, [customer]);
    const order = (await db.query(`SELECT rpc_marketplace_checkout($1, $2::jsonb, 'cod', 'standard', null, '', null, 'checkout_pay') value`,
      [customer, JSON.stringify({ addressId: address.id })])).rows[0].value;
    const payment = (await db.query(`SELECT rpc_init_payment($1::jsonb) value`, [JSON.stringify({
      orderId: order.id, method: 'upi', amountPaise: order.price.totalPaise, idempotencyKey: 'payment_test_123',
    })])).rows[0].value;
    const reused = (await db.query(`SELECT rpc_init_payment($1::jsonb) value`, [JSON.stringify({
      orderId: order.id, method: 'upi', amountPaise: order.price.totalPaise, idempotencyKey: 'payment_test_different_key',
    })])).rows[0].value;
    assert.equal(reused.id, payment.id, 'a new browser key must reuse the pending server attempt');
    const captured = (await db.query(`SELECT rpc_capture_sandbox_payment($1) value`, [payment.id])).rows[0].value;
    assert.equal(captured.payment.status, 'captured');
    assert.deepEqual((await db.query(`SELECT status, payment_status FROM marketplace_orders WHERE id = $1`, [order.id])).rows[0],
      { status: 'accepted', payment_status: 'captured' });
    const duplicate = (await db.query(`SELECT rpc_webhook_capture('event_duplicate_2', $1::jsonb) value`,
      [JSON.stringify({ paymentId: payment.id, signatureVerified: true, providerReference: `sandbox-${payment.id}` })])).rows[0].value;
    assert.equal(duplicate.duplicate, true);
    await assert.rejects(() => db.query(`SELECT rpc_init_payment($1::jsonb)`, [JSON.stringify({
      orderId: order.id, method: 'upi', amountPaise: order.price.totalPaise, idempotencyKey: 'payment_after_capture',
    })]), /PAYMENT_ALREADY_CAPTURED/);
    assert.equal((await db.query(`SELECT count(*)::int count FROM settlements WHERE payment_id = $1`, [payment.id])).rows[0].count, 1);
    const requested = (await db.query(`SELECT rpc_refund_payment($1, true, 'Customer request') value`, [payment.id])).rows[0].value;
    assert.equal(requested.refund.status, 'pending');
    assert.equal(requested.payment.status, 'captured');
    assert.equal((await db.query(`SELECT count(*)::int count FROM transactions WHERE payment_id = $1 AND type = 'refund'`, [payment.id])).rows[0].count, 0);
    const completed = (await db.query(`SELECT rpc_provider_refund_update($1, 'rfnd_test', 'processed', '{}') value`, [requested.refund.id])).rows[0].value;
    assert.equal(completed.refund.status, 'succeeded');
    assert.equal(completed.payment.status, 'refunded');
    assert.equal((await db.query(`SELECT status FROM marketplace_orders WHERE id = $1`, [order.id])).rows[0].status, 'refunded');
    assert.equal((await db.query(`SELECT amount_paise FROM transactions WHERE payment_id = $1 AND type = 'refund'`, [payment.id])).rows[0].amount_paise, -order.price.totalPaise);
    await db.query(`SELECT rpc_provider_refund_update($1, 'rfnd_test', 'processed', '{}')`, [requested.refund.id]);
    assert.equal((await db.query(`SELECT count(*)::int count FROM settlements WHERE payment_id = $1`, [payment.id])).rows[0].count, 2);
    assert.equal((await db.query(`SELECT coalesce(sum(net_paise), 0)::int total FROM settlements WHERE payment_id = $1`, [payment.id])).rows[0].total, 0);
    await asUser(db, seller);
    const earnings = (await db.query(`SELECT rpc_partner_earnings($1) value`, [seller])).rows[0].value;
    assert.equal(earnings.totalNetPaise, 0);
    assert.equal(earnings.pendingPayoutPaise, 0);
  } finally {
    await context.close();
  }
});
