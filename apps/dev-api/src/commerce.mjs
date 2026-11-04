/**
 * GOWAYY commerce module — marketplace product detail, cart, wishlist,
 * checkout and payment-method availability for the dev-api reference backend.
 * Wired in from server.mjs. All prices/stock are recomputed server-side.
 */
import { catalogue, getProduct as catalogGetProduct, searchCatalog } from '@gowayy/catalog';
import {
  assembleProductDetail, quoteCheckout, paymentMethodOptions, discountPercent,
  couponDiscountPaise, assertVariantAvailable,
} from '@gowayy/commerce';
import { makeId, nowIso, formatINR } from '@gowayy/shared-utils';

export function createCommerceModule(ctx) {
  const { db, bad, auth, rateLimit, notify, audit, placeOrderFromCart } = ctx;
  /** Database-first product resolver so partner-created products behave exactly like seeded ones. */
  const getProduct = (idOrSlug) => (db().catalogProducts ?? []).find((p) => p.id === idOrSlug || p.slug === idOrSlug) ?? catalogGetProduct(idOrSlug);
  const allProducts = () => (db().catalogProducts ?? []).filter((p) => p.active !== false && p.published !== false);

  function stockOf(productId, variantId) {
    const key = `${productId}:${variantId}`;
    if (db().productStock[key] === undefined) {
      const p = getProduct(productId);
      const v = p?.variants.find((x) => x.id === variantId);
      db().productStock[key] = v ? v.stock : 0;
    }
    return db().productStock[key];
  }
  function cartOf(userId) {
    if (!db().carts[userId]) db().carts[userId] = { lines: [], updatedAt: nowIso() };
    return db().carts[userId];
  }
  function lineView(line) {
    const p = getProduct(line.productId);
    const v = p?.variants.find((x) => x.id === line.variantId);
    return {
      id: line.id, productId: line.productId, variantId: line.variantId,
      productName: p?.name ?? 'Unknown product', brand: p?.brand ?? '',
      variantLabel: v?.label ?? '', quantity: line.quantity,
      unitPricePaise: v?.pricePaise ?? 0, mrpPaise: v?.mrpPaise ?? 0,
      stock: v ? stockOf(line.productId, line.variantId) : 0,
      discountPercent: v ? discountPercent(v.mrpPaise, v.pricePaise) : 0,
      image: p?.images[0] ?? null, dataClass: p?.dataClass ?? 'demo-listing',
      protectionPlanId: line.protectionPlanId ?? null,
      lineTotalPaise: (v?.pricePaise ?? 0) * line.quantity,
    };
  }
  function reviewStatsFor(productId) {
    const rs = db().reviews.filter((r) => r.productId === productId && r.source === 'verified-purchase');
    if (!rs.length) return undefined;
    return { average: Math.round((rs.reduce((s, r) => s + r.rating, 0) / rs.length) * 10) / 10, count: rs.length };
  }

  async function handle(req, res, method, tail, body, q, send, ok) {
    // ---- catalogue browsing ----
    if (method === 'GET' && tail[0] === 'commerce' && tail[1] === 'categories') {
      const items = (db().categories ?? []).filter((c) => c.active).map((c) => ({ id: c.id, name: c.name, slug: c.slug, image: c.image, count: allProducts().filter((p) => p.categoryId === c.id || p.category === c.name).length }));
      const extra = [...new Set(allProducts().map((p) => p.category))].filter((name) => !items.some((i) => i.name === name)).map((name) => ({ id: null, name, slug: name.toLowerCase(), image: null, count: allProducts().filter((p) => p.category === name).length }));
      return send(res, 200, { items: [...items, ...extra] });
    }
    if (method === 'GET' && tail[0] === 'commerce' && tail[1] === 'products' && tail.length === 2) {
      let items = allProducts();
      if (q.get('categoryId')) items = items.filter((p) => p.categoryId === q.get('categoryId'));
      if (q.get('category')) items = items.filter((p) => p.category.toLowerCase() === String(q.get('category')).toLowerCase());
      if (q.get('storeId')) items = items.filter((p) => p.storeId === q.get('storeId'));
      if (q.get('featured') === 'true') items = items.filter((p) => p.featured);
      if (q.get('q')) {
        const term = String(q.get('q')).toLowerCase();
        items = items.filter((p) => `${p.name} ${p.brand} ${p.category} ${(p.tags ?? []).join(' ')}`.toLowerCase().includes(term));
      }
      return send(res, 200, { items: items.map((p) => assembleProductDetail(p, [], reviewStatsFor(p.id))) });
    }
    if (method === 'GET' && tail[0] === 'commerce' && tail[1] === 'stores') {
      return send(res, 200, { items: (db().stores ?? []).filter((s) => s.status === 'active').map((s) => ({ id: s.id, name: s.name, categoryName: s.categoryName, destinationId: s.destinationId, productCount: allProducts().filter((p) => p.storeId === s.id).length, deliveryCoverageKm: s.deliveryCoverageKm, image: s.image, slots: s.slots, openingHours: s.openingHours, openingHoursVerified: s.openingHoursVerified, verified: s.verified, address: s.address, logo: s.logo ?? null, banner: s.banner ?? null })) });
    }
    if (method === 'GET' && tail[0] === 'commerce' && tail[1] === 'products' && tail[2] && tail.length === 3) {
      const p = getProduct(tail[2]);
      if (!p || p.active === false || p.published === false) bad('PRODUCT_NOT_FOUND', 'Product not found', 404);
      const related = (p.relatedProductIds ?? []).map((id) => allProducts().find((x) => x.id === id)).filter(Boolean);
      const detail = assembleProductDetail(p, related, reviewStatsFor(p.id));
      detail.variants = detail.variants.map((v) => ({ ...v, stock: stockOf(p.id, v.id) }));
      detail.store = (db().stores ?? []).find((s) => s.id === p.storeId) ?? null;
      detail.offers = (db().offers ?? []).filter((o) => o.active && ((o.productIds ?? []).includes(p.id) || (o.categoryIds ?? []).includes(p.categoryId) || o.scope === 'platform'));
      return send(res, 200, { product: detail });
    }
    if (method === 'POST' && tail[0] === 'products' && tail[2] === 'view') {
      const { user } = auth(req); const p = getProduct(tail[1]);
      if (!p) bad('PRODUCT_NOT_FOUND', 'Product not found', 404);
      db().productViews[user.id] ??= [];
      db().productViews[user.id] = [p.id, ...db().productViews[user.id].filter((x) => x !== p.id)].slice(0, 12);
      return ok(res, { recorded: true });
    }
    if (method === 'GET' && tail[0] === 'products' && tail[1] === 'recently-viewed') {
      const { user } = auth(req);
      const ids = db().productViews[user.id] ?? [];
      return send(res, 200, { items: ids.map((id) => getProduct(id)).filter(Boolean).map((p) => assembleProductDetail(p, [], reviewStatsFor(p.id))) });
    }

    // ---- search recents ----
    if (method === 'GET' && tail[0] === 'search' && tail[1] === 'recent') {
      const { user } = auth(req);
      return send(res, 200, { items: (db().searchHistory[user.id] ?? []).slice(0, 10) });
    }
    if (method === 'POST' && tail[0] === 'search' && tail[1] === 'recent') {
      const { user } = auth(req); const query = String(body.q ?? '').trim().slice(0, 80);
      if (!query) bad('EMPTY_QUERY', 'Enter a search term');
      db().searchHistory[user.id] = [query, ...(db().searchHistory[user.id] ?? []).filter((x) => x !== query)].slice(0, 10);
      return ok(res, { recorded: true });
    }

    // ---- cart ----
    if (tail[0] === 'cart') {
      const { user } = auth(req);
      if (method === 'GET' && tail.length === 1) {
        const cart = cartOf(user.id);
        return send(res, 200, { lines: cart.lines.map(lineView), itemCount: cart.lines.reduce((s, l) => s + l.quantity, 0) });
      }
      if (method === 'POST' && tail[1] === 'items') {
        rateLimit(req, 'cart', 120);
        const p = getProduct(String(body.productId ?? ''));
        if (!p) bad('PRODUCT_NOT_FOUND', 'Product not found', 404);
        const variant = p.variants.find((v) => v.id === body.variantId);
        if (!variant) bad('VARIANT_NOT_FOUND', 'Variant not found', 404);
        const quantity = Math.max(1, Math.min(10, Number(body.quantity ?? 1)));
        assertVariantAvailable({ ...variant, stock: stockOf(p.id, variant.id) }, quantity);
        if (body.protectionPlanId && !p.protectionPlans.some((pl) => pl.id === body.protectionPlanId)) bad('PLAN_NOT_FOUND', 'Protection plan not offered for this product', 404);
        const cart = cartOf(user.id);
        const existing = cart.lines.find((l) => l.productId === p.id && l.variantId === variant.id && (l.protectionPlanId ?? null) === (body.protectionPlanId ?? null));
        if (existing) existing.quantity = Math.min(10, existing.quantity + quantity);
        else cart.lines.push({ id: makeId('ln'), productId: p.id, variantId: variant.id, quantity, protectionPlanId: body.protectionPlanId ?? null, addedAt: nowIso() });
        cart.updatedAt = nowIso();
        audit(user.id, 'cart.updated', { lines: cart.lines.length });
        return ok(res, { lines: cart.lines.map(lineView) }, 201);
      }
      if (method === 'PATCH' && tail[1] === 'items' && tail[2]) {
        const cart = cartOf(user.id);
        const line = cart.lines.find((l) => l.id === tail[2]);
        if (!line) bad('LINE_NOT_FOUND', 'Cart line not found', 404);
        if (body.quantity !== undefined) {
          const quantity = Math.max(0, Math.min(10, Number(body.quantity)));
          const p = getProduct(line.productId);
          const v = p?.variants.find((x) => x.id === line.variantId);
          if (quantity > 0) assertVariantAvailable({ ...(v ?? {}), stock: stockOf(line.productId, line.variantId) }, quantity);
          if (quantity === 0) cart.lines = cart.lines.filter((l) => l.id !== line.id);
          else line.quantity = quantity;
        }
        if (body.protectionPlanId !== undefined) {
          const p = getProduct(line.productId);
          if (body.protectionPlanId && !p?.protectionPlans.some((pl) => pl.id === body.protectionPlanId)) bad('PLAN_NOT_FOUND', 'Protection plan not offered', 404);
          line.protectionPlanId = body.protectionPlanId || null;
        }
        cart.updatedAt = nowIso();
        return ok(res, { lines: cart.lines.map(lineView) });
      }
      if (method === 'DELETE' && tail[1] === 'items' && tail[2]) {
        const cart = cartOf(user.id);
        cart.lines = cart.lines.filter((l) => l.id !== tail[2]);
        return ok(res, { lines: cart.lines.map(lineView) });
      }
      if (method === 'POST' && tail[1] === 'clear') { db().carts[user.id] = { lines: [], updatedAt: nowIso() }; return ok(res, { cleared: true }); }
      if (method === 'POST' && tail[1] === 'quote') {
        const cart = cartOf(user.id);
        if (!cart.lines.length) bad('CART_EMPTY', 'Your cart is empty', 409);
        const lines = cart.lines.map((l) => {
          const p = getProduct(l.productId); const v = p?.variants.find((x) => x.id === l.variantId);
          if (!p || !v) bad('ITEM_UNAVAILABLE', 'A cart item is no longer available', 409);
          assertVariantAvailable({ ...v, stock: stockOf(p.id, v.id) }, l.quantity);
          return { unitPricePaise: v.pricePaise, quantity: l.quantity, protectionPlanId: l.protectionPlanId, mrpPaise: v.mrpPaise };
        });
        const coupon = body.coupon ? (db().coupons ?? []).find((c) => c.code === String(body.coupon).trim().toUpperCase() && c.active) : null;
        if (body.coupon && !coupon) bad('INVALID_COUPON', 'This coupon code is not valid');
        const deliveryFeePaise = body.deliverySlot === 'express' ? 9900 : 0;
        const allPlans = allProducts().flatMap((p) => p.protectionPlans ?? []);
        const quote = quoteCheckout({ lines, protectionPlans: allPlans, deliveryFeePaise, coupon });
        const mrpTotalPaise = lines.reduce((s, l) => s + (l.mrpPaise ?? l.unitPricePaise) * l.quantity, 0);
        return send(res, 200, {
          quote: { ...quote, mrpTotalPaise, savingsPaise: Math.max(0, mrpTotalPaise - quote.itemsPaise) + quote.discountPaise },
          lines: cart.lines.map(lineView),
          deliveryOptions: [
            { id: 'standard', label: 'Standard delivery', feePaise: 0, eta: '2–4 days within store coverage' },
            { id: 'express', label: 'Express delivery', feePaise: 9900, eta: 'Next-day where coverage allows' },
          ],
        });
      }
    }

    // ---- wishlist ----
    if (tail[0] === 'wishlist') {
      const { user } = auth(req);
      db().wishlist[user.id] ??= [];
      if (method === 'GET' && tail.length === 1) {
        return send(res, 200, { items: db().wishlist[user.id].map((id) => getProduct(id)).filter(Boolean).map((p) => assembleProductDetail(p, [], reviewStatsFor(p.id))) });
      }
      if (method === 'POST' && tail.length === 1) {
        const p = getProduct(String(body.productId ?? ''));
        if (!p) bad('PRODUCT_NOT_FOUND', 'Product not found', 404);
        if (!db().wishlist[user.id].includes(p.id)) db().wishlist[user.id].push(p.id);
        return ok(res, { saved: true }, 201);
      }
      if (method === 'DELETE' && tail[1]) {
        db().wishlist[user.id] = db().wishlist[user.id].filter((x) => x !== tail[1]);
        return ok(res, { removed: true });
      }
    }

    // ---- checkout ----
    if (method === 'GET' && tail[0] === 'checkout' && tail[1] === 'payment-methods') {
      const { user } = auth(req);
      const totalPaise = Math.max(0, Number(q.get('totalPaise') ?? 0));
      // In this dev environment only wallet + sandbox UPI are genuinely wired;
      // card/netbanking/emi require a real gateway; COD is allowed under a cap.
      const methods = paymentMethodOptions({
        codAllowed: true, totalPaise, codMaxPaise: 1000000,
        upiIntegrated: true, cardIntegrated: false,
        walletBalancePaise: db().wallet?.[user.id] ?? 0,
        walletCashbackPaise: Math.min(1000, Math.round(totalPaise * 0.003)),
        upiCashbackPaise: Math.min(2500, Math.round(totalPaise * 0.01)),
      });
      return send(res, 200, { items: methods, note: 'Only genuinely integrated methods are selectable; others are shown disabled with the reason.' });
    }
    if (method === 'POST' && tail[0] === 'checkout') {
      const { user } = auth(req); rateLimit(req, 'checkout', 30);
      const order = placeOrderFromCart(user, body);
      return ok(res, { order }, 201);
    }
    return false;
  }
  return { handle };
}
