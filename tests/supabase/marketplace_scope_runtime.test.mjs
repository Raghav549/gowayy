import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, createUser, asUser } from './harness.mjs';

test('marketplace carts enforce one public store and scoped coupon eligibility', async () => {
  const context = await createDatabase({ withSeed: true });
  const { db } = context;
  try {
    assert.deepEqual(context.errors, []);
    const customer = await createUser(db, 'scope@example.com');
    await db.query(`INSERT INTO marketplace_categories(id, slug, name) VALUES ('cat_scope', 'scope-category', 'Scope Category')`);
    for (const suffix of [1, 2]) {
      await db.query(`INSERT INTO grocery_stores(id, destination_id, name, lat, lng, address, published, status)
        VALUES ($1, 'dst_darjeeling', $2, 27.04, 88.26, 'Darjeeling', true, 'active')`, [`str_scope${suffix}`, `Scope Store ${suffix}`]);
      await db.query(`INSERT INTO marketplace_products(id, store_id, category_id, brand, name, category, slug, published)
        VALUES ($1, $2, 'cat_scope', 'GOWAYY', $3, 'Scope Category', $4, true)`,
        [`prd_scope${suffix}`, `str_scope${suffix}`, `Scope Product ${suffix}`, `scope-product-${suffix}`]);
      await db.query(`INSERT INTO product_variants(id, product_id, label, price_paise, mrp_paise, stock)
        VALUES ($1, $2, 'Default', 10000, 10000, 5)`, [`var_scope${suffix}`, `prd_scope${suffix}`]);
    }
    const products = [
      { id: 'prd_scope1', store_id: 'str_scope1', variant_id: 'var_scope1' },
      { id: 'prd_scope2', store_id: 'str_scope2', variant_id: 'var_scope2' },
    ];
    await db.query(`INSERT INTO marketplace_offers(id, scope, product_ids, title, code, kind, value)
      VALUES ('off_scope_test', 'product', jsonb_build_array($1::text), 'One product only', 'ONLYONE', 'percent', 10)`, [products[0].id]);
    await assert.rejects(() => db.query(`SELECT gowayy_marketplace_discount('ONLYONE', 10000, $1::jsonb, '[]', '[]')`,
      [JSON.stringify(products.map((product) => product.id))]), /INVALID_COUPON/);
    const eligible = (await db.query(`SELECT gowayy_marketplace_discount('ONLYONE', 10000, jsonb_build_array($1::text), '[]', '[]') value`, [products[0].id])).rows[0].value;
    assert.equal(eligible.discountPaise, 1000);
    await asUser(db, customer);
    for (const product of products) {
      await db.query(`SELECT rpc_cart_upsert($1, $2, $3, 1, null)`, [customer, product.id, product.variant_id]);
    }
    await assert.rejects(() => db.query(`SELECT rpc_cart_quote($1, '{}')`, [customer]), /MULTI_STORE_CART/);
    const address = (await db.query(`SELECT rpc_address_create($1::jsonb) value`, [JSON.stringify({
      name: 'Scope Test', phone: '9876543210', line: '1 Scope Road', city: 'Darjeeling', pincode: '734101', house: '1', road: 'Scope Road',
    })])).rows[0].value;
    await assert.rejects(() => db.query(`SELECT rpc_marketplace_checkout($1, $2::jsonb, 'cod', 'standard', null, '', null, 'mixed_scope_1')`,
      [customer, JSON.stringify({ addressId: address.id })]), /MULTI_STORE_CART/);
    await db.query(`DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2`, [customer, products[1].id]);
    await db.query(`UPDATE grocery_stores SET status = 'paused', published = false WHERE id = $1`, [products[0].store_id]);
    await assert.rejects(() => db.query(`SELECT rpc_cart_quote($1, '{}')`, [customer]), /ITEM_UNAVAILABLE/);
  } finally {
    await context.close();
  }
});
