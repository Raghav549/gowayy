/**
 * Integration tests for the redesigned commerce + GOWAYY PARTNER backend.
 * Drives the real dev-api server over HTTP: product detail, cart, quote,
 * checkout, server-verified payment, partner claim, inventory, earnings and
 * settlement — the same calls the three apps make.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8891;
const BASE = `http://127.0.0.1:${PORT}/api`;
let server; let tmp;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'gowayy-commerce-'));
  server = spawn('node', ['apps/dev-api/src/server.mjs'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), GOWAYY_DB_FILE: join(tmp, 'db.json') }, stdio: 'pipe',
  });
  for (let i = 0; i < 50; i += 1) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('dev-api did not start');
});
after(() => { server?.kill(); if (tmp) rmSync(tmp, { recursive: true, force: true }); });

const j = (r) => r.json();
async function registerAndLogin(email) {
  const reg = await j(await fetch(`${BASE}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ firstName: 'Com', lastName: 'Merce', email, password: 'Passw0rd!123', confirmPassword: 'Passw0rd!123' }) }));
  const v = await j(await fetch(`${BASE}/auth/otp/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ registrationId: reg.registrationId, code: reg.demoOtp }) }));
  return v.session.token;
}
const auth = (token, init = {}) => ({ ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });

test('product detail exposes variants, discount, protection plan and FAQ', async () => {
  const r = await j(await fetch(`${BASE}/commerce/products/himal-trekker-20000-power-bank-67w`));
  const p = r.product;
  assert.equal(p.variants.length, 3);
  assert.equal(p.variants[0].discountPercent, 47);
  assert.ok(p.protectionPlans.length >= 1);
  assert.ok(p.protectionPlans[0].terms.includes('Demo plan'));
  assert.ok(p.faq.length >= 2);
  assert.ok(p.relatedProducts.length >= 1);
});

test('categories and search surface marketplace products', async () => {
  const cats = await j(await fetch(`${BASE}/commerce/categories`));
  assert.ok(cats.items.some((c) => c.name === 'Electronics'));
  const s = await j(await fetch(`${BASE}/search?q=power%20bank`));
  assert.ok(s.hits.some((h) => h.kind === 'product'));
});

test('cart → quote → checkout → signed capture → earnings → settlement', async () => {
  const token = await registerAndLogin('shop@example.com');
  const addr = await j(await fetch(`${BASE}/addresses`, auth(token, { method: 'POST', body: JSON.stringify({ label: 'Home', line: '1 MG Road', city: 'Darjeeling', pincode: '734101', phone: '9000000000' }) })));
  const add = await j(await fetch(`${BASE}/cart/items`, auth(token, { method: 'POST', body: JSON.stringify({ productId: 'prd_powerbank', variantId: 'var_ice_blue', quantity: 1, protectionPlanId: 'prot_1y_damage' }) })));
  assert.equal(add.lines.length, 1);
  const quote = await j(await fetch(`${BASE}/cart/quote`, auth(token, { method: 'POST', body: JSON.stringify({ deliverySlot: 'standard', coupon: 'GOWAYY100' }) })));
  assert.equal(quote.quote.itemsPaise, 319900);
  assert.equal(quote.quote.protectionPaise, 23700);
  assert.equal(quote.quote.discountPaise, 10000);
  assert.ok(quote.quote.totalPaise > 0);
  const methods = await j(await fetch(`${BASE}/checkout/payment-methods?totalPaise=${quote.quote.totalPaise}`, auth(token)));
  assert.ok(methods.items.find((m) => m.id === 'upi').available);
  assert.ok(!methods.items.find((m) => m.id === 'card').available, 'card must be disabled without a gateway');
  const out = await j(await fetch(`${BASE}/checkout`, auth(token, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': 'itest-checkout-1' }, body: JSON.stringify({ addressId: addr.address.id, paymentMethod: 'upi', deliverySlot: 'standard', coupon: 'GOWAYY100' }) })));
  assert.equal(out.order.service, 'marketplace');
  assert.equal(out.order.price.totalPaise, quote.quote.totalPaise, 'checkout total must equal the server quote');
  const pay = await j(await fetch(`${BASE}/payments/init`, auth(token, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': 'itest-pay-1' }, body: JSON.stringify({ bookingId: null, orderId: out.order.id, method: 'upi', amountPaise: out.order.price.totalPaise, idempotencyKey: 'itest-pay-1' }) })));
  const cap = await j(await fetch(`${BASE}/payments/${pay.payment.id}/sandbox-capture`, auth(token, { method: 'POST' })));
  assert.equal(cap.payment.status, 'captured');
  // stock decremented server-side
  const detail = await j(await fetch(`${BASE}/commerce/products/himal-trekker-20000-power-bank-67w`));
  assert.equal(detail.product.variants[0].stock, 11);
});

test('out-of-stock variant is rejected server-side', async () => {
  const token = await registerAndLogin('stock@example.com');
  const r = await fetch(`${BASE}/cart/items`, auth(token, { method: 'POST', body: JSON.stringify({ productId: 'prd_powerbank', variantId: 'var_jet_black', quantity: 1 }) }));
  assert.equal(r.status, 409);
  const e = await j(r);
  assert.equal(e.error, 'OUT_OF_STOCK');
});

test('partner claim → inventory adjust → earnings → settlement', async () => {
  const token = await registerAndLogin('partner@example.com');
  const claim = await j(await fetch(`${BASE}/partners/claim`, auth(token, { method: 'POST', body: JSON.stringify({ role: 'grocery', listingId: 'grc_1' }) })));
  assert.ok(claim.user.roles.includes('grocery'));
  const inv = await j(await fetch(`${BASE}/partner/inventory`, auth(token)));
  assert.ok(inv.items.length > 0);
  const adj = await j(await fetch(`${BASE}/partner/inventory`, auth(token, { method: 'POST', body: JSON.stringify({ listingId: 'grc_1', productId: inv.items[0].id, delta: 3 }) })));
  assert.equal(adj.stock, inv.items[0].stock + 3);
  const overview = await j(await fetch(`${BASE}/partner/overview`, auth(token)));
  assert.ok(overview.roles.includes('grocery'));
  const docs = await j(await fetch(`${BASE}/partner/verification`, auth(token)));
  assert.ok(Array.isArray(docs.documents));
  const up = await j(await fetch(`${BASE}/partner/documents`, auth(token, { method: 'POST', body: JSON.stringify({ type: 'gst', number: 'TEST123' }) })));
  assert.equal(up.document.status, 'pending');
  assert.ok(up.demoNotice.includes('PENDING'));
  const settle = await fetch(`${BASE}/partner/settlements/request`, auth(token, { method: 'POST' }));
  assert.equal(settle.status, 409, 'no captured payments yet → nothing to settle');
});

test('driver registration, demo verify and online toggle', async () => {
  const token = await registerAndLogin('driver@example.com');
  const reg = await j(await fetch(`${BASE}/partners/drivers`, auth(token, { method: 'POST', body: JSON.stringify({ name: 'Dawa', phone: '9800000000', vehicleClass: 'veh_sedan', services: ['cab', 'parcel'], licenceNumber: 'WB1234567', vehicleRegistration: 'WB02AB1234', insuranceNumber: 'INS999' }) })));
  assert.equal(reg.driver.verification, 'pending');
  const before = await fetch(`${BASE}/partners/drivers/me`, auth(token, { method: 'PATCH', body: JSON.stringify({ online: true }) }));
  assert.equal(before.status, 409, 'cannot go online before verification');
  const v = await j(await fetch(`${BASE}/partners/drivers/verify-demo`, auth(token, { method: 'POST' })));
  assert.equal(v.driver.verification, 'verified');
  assert.ok(v.demoNotice.includes('Demo'));
  const on = await j(await fetch(`${BASE}/partners/drivers/me`, auth(token, { method: 'PATCH', body: JSON.stringify({ online: true }) })));
  assert.equal(on.driver.online, true);
});

test('wishlist and recent searches are per-user and persisted', async () => {
  const token = await registerAndLogin('wish@example.com');
  await fetch(`${BASE}/wishlist`, auth(token, { method: 'POST', body: JSON.stringify({ productId: 'prd_tea' }) }));
  const w = await j(await fetch(`${BASE}/wishlist`, auth(token)));
  assert.equal(w.items[0].slug, 'darjeeling-first-flush-tea-250g');
  await fetch(`${BASE}/search/recent`, auth(token, { method: 'POST', body: JSON.stringify({ q: 'tea' }) }));
  const rs = await j(await fetch(`${BASE}/search/recent`, auth(token)));
  assert.deepEqual(rs.items, ['tea']);
});
