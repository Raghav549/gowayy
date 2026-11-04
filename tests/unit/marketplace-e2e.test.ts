import { beforeAll, describe, expect, it } from 'vitest';

/**
 * End-to-end commerce test against a running development API.
 * Skipped unless GOWAYY_LIVE_API points at one, so the default suite stays hermetic.
 *
 * It exercises the same contract the customer web app uses:
 * login → catalogue → cart → server quote → address → checkout → sandbox UPI
 * capture → server-verified payment status → server-generated PDF invoice.
 */
const API = process.env.GOWAYY_LIVE_API ?? '';
const live = Boolean(API);

interface Variant { id: string; label: string; pricePaise: number; stock: number }
interface Product { id: string; slug: string; name: string; variants: Variant[] }

describe.skipIf(!live)('marketplace order lifecycle (live API)', () => {
  let client: any;
  let token = '';
  let product: Product;
  let variant: Variant;

  beforeAll(async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' && input.startsWith('/') ? `${API}${input}` : input;
      return realFetch(url, init);
    }) as typeof fetch;

    const clientModule = await import('../../apps/gowayy-customer/web/src/lib/client');
    client = clientModule.client;
    const login = await client.login('customer@gowayy.app', 'Gw@yCustomer2026');
    token = login.session.token;
    clientModule.tokenStore.set(token);

    const res = await client.commerceProducts();
    const products = res.items as Product[];
    for (const candidate of products) {
      const v = candidate.variants.find((x) => x.stock > 0);
      if (v) { product = candidate; variant = v; break; }
    }
    expect(product, 'seeded catalogue should contain an in-stock product').toBeTruthy();
  }, 60_000);

  it('quotes the cart on the server, captures a sandbox UPI payment and issues a PDF invoice', async () => {
    await client.clearCart();
    await client.addToCart({ productId: product.id, variantId: variant.id, quantity: 1 });

    const quote = await client.cartQuote({ deliverySlot: 'standard' }) as { quote: { totalPaise: number; itemsPaise: number }; lines: Array<{ quantity: number }> };
    expect(quote.quote.itemsPaise).toBeGreaterThan(0);
    expect(quote.quote.totalPaise).toBeGreaterThanOrEqual(quote.quote.itemsPaise);
    expect(quote.lines[0]?.quantity).toBe(1);

    const address = await client.createAddress({
      label: 'Home', line: '12 Gandhi Road, near Chowk Bazaar', city: 'Darjeeling', pincode: '734101',
      state: 'West Bengal', name: 'Demo Customer', phone: '9800000001', isDefault: true,
    }) as { id: string };

    const methods = await client.paymentMethods(quote.quote.totalPaise) as { items: Array<{ id: string; available: boolean }> };
    expect(methods.items.some((m) => m.id === 'upi' && m.available)).toBe(true);
    expect(methods.items.some((m) => m.id === 'card')).toBe(true); // listed, but gateway-backed availability is enforced server-side

    const order = await client.checkout({
      addressId: address.id, paymentMethod: 'upi', deliverySlot: 'standard', instructions: 'Call on arrival',
    }, `e2e-${Date.now()}`) as { id: string; reference: string; status: string; price: { totalPaise: number } };
    expect(order.reference).toMatch(/^GW-O\d+/);
    expect(order.price.totalPaise).toBeGreaterThan(0);

    const payment = await client.initPayment({
      bookingId: null, orderId: order.id, method: 'upi', amountPaise: order.price.totalPaise, idempotencyKey: `pay-${Date.now()}`,
    }) as { id: string; status: string };
    expect(payment.status).not.toBe('captured');

    const captured = await client.captureSandboxPayment(payment.id) as { payment: { status: string } };
    expect(captured.payment.status).toBe('captured');

    const detail = await client.orderDetail(order.id) as { order: { paymentStatus?: string; status: string } };
    expect(['paid', 'captured']).toContain(detail.order.paymentStatus);
    expect(detail.order.status).not.toBe('cancelled');

    const invoice = await fetch(`${API}/api/orders/${order.id}/invoice`, { headers: { authorization: `Bearer ${token}` } });
    expect(invoice.status).toBe(200);
    expect(invoice.headers.get('content-type')).toContain('application/pdf');
    const buffer = new Uint8Array(await invoice.arrayBuffer());
    expect(new TextDecoder().decode(buffer.slice(0, 5))).toBe('%PDF-');
    expect(buffer.byteLength).toBeGreaterThan(1500);

    const unauthenticated = await fetch(`${API}/api/orders/${order.id}/invoice`);
    expect(unauthenticated.status).toBe(401);

    await client.clearCart();
  }, 90_000);
});
