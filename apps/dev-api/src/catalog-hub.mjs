/**
 * GOWAYY catalogue hub — the shared, database-driven commerce catalogue used by
 * the customer Shop, the partner catalogue manager and the admin console.
 *
 * Categories and products are records, not hardcoded lists: a partner can create
 * a category (with an image) and publish products into it, and the same records
 * immediately power storefront sections, search and product detail pages.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogue } from '@gowayy/catalog';
import { makeId, nowIso, slugify } from '@gowayy/shared-utils';
import { transitionOrderStatus } from '@gowayy/booking-engine';

const HERE = dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = join(HERE, '../data/uploads');
const ALLOWED_IMAGE_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const MAX_IMAGE_BYTES = 2_500_000;

export function ensureUploadDir() { mkdirSync(UPLOAD_DIR, { recursive: true }); }

export function readUpload(name) {
  // Reject traversal, unknown extensions and missing files before touching disk.
  if (!/^[a-zA-Z0-9_-]+\.[a-z0-9]{2,5}$/.test(name)) return null;
  const file = join(UPLOAD_DIR, name);
  if (!existsSync(file)) return null;
  const ext = extname(file).toLowerCase();
  const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return { data: readFileSync(file), contentType: type };
}

export function sanitiseImages(input) {
  const list = Array.isArray(input) ? input : [];
  return list.slice(0, 5).map((entry, index) => {
    const raw = typeof entry === 'string' ? { path: entry } : entry ?? {};
    const rawPath = String(raw.path ?? raw.url ?? '');
    const allowed = rawPath.startsWith('/uploads/') || rawPath.startsWith('/images/') || /^https:\/\//.test(rawPath);
    if (!allowed) return null;
    return {
      status: 'verified', path: rawPath.replace(/^\/+/, '/'),
      alt: String(raw.alt ?? `Product image ${index + 1}`).slice(0, 160),
      credit: raw.credit ? String(raw.credit).slice(0, 160) : undefined,
      license: raw.license ? String(raw.license).slice(0, 80) : undefined,
      sourceUrl: raw.sourceUrl && /^https:\/\//.test(raw.sourceUrl) ? raw.sourceUrl : undefined,
      providedBy: String(raw.providedBy ?? 'partner').slice(0, 40),
    };
  }).filter(Boolean);
}

export function createCategoryRecord(db, body, ownerUserId) {
  const name = String(body.name ?? '').trim().slice(0, 60);
  if (name.length < 2) throw Object.assign(new Error('Category name needs at least 2 characters'), { status: 422, code: 'VALIDATION_FAILED' });
  const slug = slugify(name);
  if (db.categories.some((c) => c.slug === slug)) throw Object.assign(new Error('A category with this name already exists'), { status: 409, code: 'CATEGORY_EXISTS' });
  const images = sanitiseImages(body.images ?? (body.image ? [body.image] : []));
  const category = {
    id: makeId('cat'), name, slug, ownerUserId: ownerUserId ?? null, active: true, createdAt: nowIso(),
    image: images[0] ?? { status: 'unavailable', alt: `${name} category image not supplied yet` },
  };
  db.categories.push(category);
  return category;
}

export function createProductRecord(db, body, ownerUserId) {
  const name = String(body.name ?? '').trim().slice(0, 140);
  if (name.length < 2) throw Object.assign(new Error('Product name is required'), { status: 422, code: 'VALIDATION_FAILED' });
  const pricePaise = Math.round(Number(body.pricePaise ?? 0));
  const mrpPaise = Math.round(Number(body.mrpPaise ?? pricePaise));
  if (!Number.isFinite(pricePaise) || pricePaise < 0) throw Object.assign(new Error('Price must be a positive amount'), { status: 422, code: 'VALIDATION_FAILED' });
  if (mrpPaise < pricePaise) throw Object.assign(new Error('MRP cannot be lower than the selling price'), { status: 422, code: 'VALIDATION_FAILED' });
  const store = db.stores.find((s) => s.id === body.storeId) ?? null;
  if (!store) throw Object.assign(new Error('Choose a store for this product'), { status: 422, code: 'STORE_REQUIRED' });
  let category = body.categoryId ? db.categories.find((c) => c.id === body.categoryId) : null;
  if (!category && body.categoryName) category = createCategoryRecord(db, { name: body.categoryName, images: body.categoryImages }, ownerUserId ?? store.ownerUserId ?? null);
  if (!category) category = db.categories.find((c) => c.id === store.categoryId) ?? db.categories[0];
  const stock = Math.max(0, Math.round(Number(body.stock ?? body.quantity ?? 0)));
  const variantsInput = Array.isArray(body.variants) && body.variants.length
    ? body.variants.slice(0, 20)
    : [{ id: 'var_std', label: String(body.variantLabel ?? 'Standard'), pricePaise, mrpPaise, stock }];
  const variants = variantsInput.map((v, i) => ({
    id: String(v.id ?? `var_${i + 1}`), label: String(v.label ?? `Option ${i + 1}`).slice(0, 60),
    pricePaise: Math.max(0, Math.round(Number(v.pricePaise ?? pricePaise))),
    mrpPaise: Math.max(0, Math.round(Number(v.mrpPaise ?? mrpPaise))),
    stock: Math.max(0, Math.round(Number(v.stock ?? stock))),
  }));
  const slugBase = slugify(name) || `product-${Date.now()}`;
  let slug = slugBase; let n = 2;
  while (db.catalogProducts.some((p) => p.slug === slug)) slug = `${slugBase}-${n++}`;
  const product = {
    id: makeId('prd'), slug, storeId: store.id, brand: String(body.brand ?? store.name).slice(0, 60),
    name, category: category.name, categoryId: category.id, dataClass: 'demo-listing',
    highlights: Array.isArray(body.highlights) ? body.highlights.slice(0, 6).map((h) => String(h).slice(0, 160)) : [],
    description: String(body.description ?? '').slice(0, 2000),
    specifications: Array.isArray(body.specifications) ? body.specifications.slice(0, 20).map((s) => ({ label: String(s.label ?? '').slice(0, 60), value: String(s.value ?? '').slice(0, 120) })) : [],
    inTheBox: Array.isArray(body.inTheBox) ? body.inTheBox.slice(0, 10).map((s) => String(s).slice(0, 120)) : [],
    faq: [], images: sanitiseImages(body.images),
    variants, protectionPlans: [], relatedProductIds: [],
    deliveryNote: String(body.deliveryNote ?? `Delivered by ${store.name} within its coverage area.`).slice(0, 240),
    tags: Array.isArray(body.tags) ? body.tags.slice(0, 12).map((t) => String(t).slice(0, 30)) : [],
    couponEligible: body.couponEligible !== false,
    active: body.active !== false, published: body.published !== false,
    featured: false, ownerUserId: ownerUserId ?? null, createdAt: nowIso(),
    demo: true, categorySlug: category.slug,
  };
  db.catalogProducts.push(product);
  return product;
}

export function createOfferRecord(db, body, ownerUserId) {
  const kind = body.kind === 'flat' ? 'flat' : 'percent';
  const value = Number(body.value ?? 0);
  if (!Number.isFinite(value) || value <= 0) throw Object.assign(new Error('Offer value must be greater than zero'), { status: 422, code: 'VALIDATION_FAILED' });
  if (kind === 'percent' && value > 90) throw Object.assign(new Error('Percentage discount cannot exceed 90%'), { status: 422, code: 'VALIDATION_FAILED' });
  const code = body.code ? String(body.code).trim().toUpperCase().slice(0, 20) : null;
  if (code && db.coupons.some((c) => c.code === code)) throw Object.assign(new Error('This coupon code already exists'), { status: 409, code: 'COUPON_EXISTS' });
  const offer = {
    id: makeId('off'), scope: ['product', 'category', 'store', 'platform'].includes(body.scope) ? body.scope : 'product',
    productIds: Array.isArray(body.productIds) ? body.productIds.slice(0, 100) : [],
    categoryIds: Array.isArray(body.categoryIds) ? body.categoryIds.slice(0, 50) : [],
    title: String(body.title ?? 'Offer').slice(0, 100), code, kind, value,
    maxDiscountPaise: Math.max(0, Number(body.maxDiscountPaise ?? 0)) || null,
    minOrderPaise: Math.max(0, Number(body.minOrderPaise ?? 0)),
    startAt: body.startAt ?? null, endAt: body.endAt ?? null,
    usageLimit: body.usageLimit ? Math.max(1, Number(body.usageLimit)) : null,
    usedCount: 0, active: body.active !== false, ownerUserId: ownerUserId ?? null, createdAt: nowIso(),
  };
  db.offers.push(offer);
  if (code) {
    db.coupons.push({
      code, kind, valuePaise: kind === 'flat' ? Math.round(value * 100) : undefined,
      valuePercent: kind === 'percent' ? value : undefined, maxPaise: offer.maxDiscountPaise ?? undefined,
      minSubtotalPaise: offer.minOrderPaise, active: true, ownerUserId: ownerUserId ?? null,
      offerId: offer.id, createdAt: nowIso(),
    });
  }
  return offer;
}

function partnerServices(user) {
  const map = {
    driver: ['cab', 'shared_taxi', 'parcel', 'food', 'grocery', 'marketplace'],
    restaurant: ['food'], grocery: ['grocery', 'marketplace'], seller: ['marketplace', 'grocery'],
    property: ['hotel', 'homestay', 'tourism', 'experience', 'package'],
    tour_operator: ['tourism', 'package', 'experience'],
  };
  return [...new Set((user.roles ?? []).flatMap((r) => map[r] ?? []))];
}

export function createCatalogHub(ctx) {
  const { db, bad, auth, rateLimit, notify, audit, delivery, publicOrder, save } = ctx;

  const liveBanners = () => (db().banners ?? [])
    .filter((b) => b.active)
    .filter((b) => (!b.startAt || b.startAt <= nowIso()) && (!b.endAt || b.endAt >= nowIso()))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  function storeView(store, withProducts = false) {
    const products = (db().catalogProducts ?? []).filter((p) => p.storeId === store.id && p.active && p.published);
    const groceryItems = catalogue.groceryStores.find((s) => s.id === store.id)?.products ?? [];
    const view = {
      ...store,
      productCount: products.length + groceryItems.length,
      logo: store.logo ?? null,
      banner: store.banner ?? null,
      products: withProducts ? products.map((p) => ({ id: p.id, slug: p.slug, name: p.name, pricePaise: p.variants?.[0]?.pricePaise ?? 0, mrpPaise: p.variants?.[0]?.mrpPaise, stock: p.variants?.[0]?.stock ?? 0, images: p.images, category: p.category })) : undefined,
      groceryItems: withProducts ? groceryItems.map((p) => ({ id: p.id, name: p.name, pricePaise: p.pricePaise, unit: p.unit, stock: db().inventory[`${store.id}:${p.id}`] ?? p.stock, category: p.category })) : undefined,
      offers: (db().offers ?? []).filter((o) => o.active && (o.scope === 'platform' || o.productIds.some((pid) => products.some((p) => p.id === pid)))),
    };
    return view;
  }

  async function handle(req, res, method, tail, body, q, send, ok) {
    // ------------------------------------------------------------- storefront
    if (method === 'GET' && tail[0] === 'storefront') {
      const products = (db().catalogProducts ?? []).filter((p) => p.active && p.published);
      const categories = (db().categories ?? []).filter((c) => c.active).map((c) => ({
        ...c, productCount: products.filter((p) => p.categoryId === c.id || p.category === c.name).length,
      }));
      return send(res, 200, {
        banners: liveBanners(),
        categories,
        stores: (db().stores ?? []).filter((s) => s.status === 'active').map((s) => storeView(s)),
        featuredProducts: products.filter((p) => p.featured).slice(0, 8),
        newProducts: products.slice(-6).reverse(),
        offers: (db().offers ?? []).filter((o) => o.active),
        posters: {
          grocery: (db().posters ?? []).filter((p) => p.kind === 'grocery' && p.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
          food: (db().posters ?? []).filter((p) => p.kind === 'food' && p.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        },
        services: db().settings?.services ?? {},
        appConfig: db().settings?.appConfig ?? {},
      });
    }
    if (method === 'GET' && tail[0] === 'banners') return send(res, 200, { items: liveBanners() });

    // ------------------------------------------------- promotional posters
    if (method === 'GET' && tail[0] === 'posters') {
      const kind = q.get('kind');
      const now = nowIso();
      const items = (db().posters ?? [])
        .filter((p) => p.active !== false)
        .filter((p) => !p.startAt || p.startAt <= now)
        .filter((p) => !p.endAt || p.endAt >= now)
        .filter((p) => !kind || p.kind === kind)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return send(res, 200, { items, grocery: items.filter((p) => p.kind === 'grocery'), food: items.filter((p) => p.kind === 'food') });
    }

    // ----------------------------------------------------- service coverage
    if (method === 'GET' && tail[0] === 'service-areas') {
      const areas = (db().serviceAreas ?? []).filter((a) => a.active !== false);
      const pincode = String(q.get('pincode') ?? '').trim();
      const service = String(q.get('service') ?? '');
      if (/^\d{6}$/.test(pincode)) {
        const matches = (list) => areas.filter((a) => (list(a) ?? []).includes(pincode));
        return send(res, 200, {
          pincode,
          food: { supported: matches((a) => a.foodPincodes).length > 0, cities: matches((a) => a.foodPincodes).map((a) => a.city) },
          grocery: { supported: matches((a) => a.groceryPincodes).length > 0, cities: matches((a) => a.groceryPincodes).map((a) => a.city) },
          areas: areas.map((a) => ({ id: a.id, city: a.city, state: a.state })),
        });
      }
      return send(res, 200, {
        items: areas,
        services: service ? { supported: areas.some((a) => (service === 'food' ? a.foodPincodes : a.groceryPincodes).includes(pincode)) } : undefined,
      });
    }

    // --------------------------------------------------- destination content
    if (method === 'GET' && tail[0] === 'destinations' && tail.length === 1) {
      return send(res, 200, { items: (db().destinations ?? []).filter((d) => d.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) });
    }
    if (method === 'GET' && tail[0] === 'destinations' && tail[1]) {
      const destination = (db().destinations ?? []).find((d) => d.slug === tail[1] || d.id === tail[1]);
      if (!destination || destination.active === false) bad('DESTINATION_NOT_FOUND', 'Destination not found', 404);
      return send(res, 200, { destination });
    }
    if (method === 'GET' && tail[0] === 'categories') return send(res, 200, { items: (db().categories ?? []).filter((c) => c.active) });

    if (method === 'GET' && tail[0] === 'stores' && tail.length === 1) {
      return send(res, 200, { items: (db().stores ?? []).filter((s) => s.status === 'active').map((s) => storeView(s)) });
    }
    if (method === 'GET' && tail[0] === 'stores' && tail[1]) {
      const store = (db().stores ?? []).find((s) => s.id === tail[1]);
      if (!store || store.status !== 'active') bad('STORE_NOT_FOUND', 'Store not found', 404);
      return send(res, 200, { store: storeView(store, true) });
    }

    // ----------------------------------------------------------------- uploads
    if (method === 'POST' && tail[0] === 'uploads') {
      const { user } = auth(req); rateLimit(req, 'upload', 40);
      const mime = String(body.mimeType ?? '');
      const ext = ALLOWED_IMAGE_TYPES[mime];
      if (!ext) bad('UNSUPPORTED_FILE', 'Upload a PNG, JPEG or WebP image', 422);
      const raw = String(body.dataBase64 ?? '').replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(raw, 'base64');
      if (!buffer.length) bad('EMPTY_FILE', 'The uploaded file is empty', 422);
      if (buffer.length > MAX_IMAGE_BYTES) bad('FILE_TOO_LARGE', 'Images must be 2.5 MB or smaller', 413);
      // Verify magic bytes so a renamed text/HTML file cannot be served as an image.
      const isPng = buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
      const isWebp = buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP';
      if ((ext === '.png' && !isPng) || (ext === '.jpg' && !isJpeg) || (ext === '.webp' && !isWebp)) bad('INVALID_IMAGE', 'The file content does not match its image type', 422);
      ensureUploadDir();
      const name = `${makeId('img')}${ext}`;
      writeFileSync(join(UPLOAD_DIR, name), buffer);
      audit(user.id, 'upload.created', { name, bytes: buffer.length });
      return ok(res, { url: `/uploads/${name}`, bytes: buffer.length }, 201);
    }

    // ------------------------------------------------------- partner catalogue
    if (tail[0] !== 'partner') return false;
    const { user } = auth(req);
    const isPartner = ['restaurant', 'grocery', 'seller', 'property', 'tour_operator', 'driver'].some((r) => user.roles.includes(r)) || user.roles.includes('admin');

    if (tail[1] === 'catalog' || tail[1] === 'offers' || tail[1] === 'coupons' || tail[1] === 'deliveries' || tail[1] === 'orders' || tail[1] === 'stores') {
      if (!isPartner) bad('ROLE_REQUIRED', 'A partner role is required for catalogue management', 403);
    }

    if (tail[1] === 'catalog' && tail[2] === 'categories') {
      if (method === 'GET') return send(res, 200, { items: (db().categories ?? []).filter((c) => c.active), mine: (db().categories ?? []).filter((c) => c.ownerUserId === user.id) });
      if (method === 'POST') {
        rateLimit(req, 'catalog', 60);
        const category = createCategoryRecord(db(), body, user.id);
        audit(user.id, 'partner.category.created', { categoryId: category.id, name: category.name });
        return ok(res, { category }, 201);
      }
    }
    if (tail[1] === 'catalog' && tail[2] === 'products') {
      const mine = (db().catalogProducts ?? []).filter((p) => p.ownerUserId === user.id || (db().stores ?? []).some((s) => s.id === p.storeId && s.ownerUserId === user.id));
      if (method === 'GET') return send(res, 200, { items: mine });
      if (method === 'POST') {
        rateLimit(req, 'catalog', 60);
        const storeId = body.storeId ?? (db().stores ?? []).find((s) => s.ownerUserId === user.id)?.id;
        const store = (db().stores ?? []).find((s) => s.id === storeId);
        if (!store) bad('STORE_REQUIRED', 'Create or claim a store before adding products', 422);
        if (store.ownerUserId && store.ownerUserId !== user.id && !user.roles.includes('admin')) bad('FORBIDDEN', 'This store belongs to another partner', 403);
        const product = createProductRecord(db(), { ...body, storeId: store.id }, user.id);
        audit(user.id, 'partner.product.created', { productId: product.id, name: product.name });
        return ok(res, { product }, 201);
      }
      if (tail[3] && (method === 'PATCH' || method === 'DELETE')) {
        const product = (db().catalogProducts ?? []).find((p) => p.id === tail[3] && (p.ownerUserId === user.id || user.roles.includes('admin')));
        if (!product) bad('PRODUCT_NOT_FOUND', 'Product not found in your catalogue', 404);
        if (method === 'DELETE') {
          product.active = false; product.published = false;
          audit(user.id, 'partner.product.unpublished', { productId: product.id });
          return ok(res, { unpublished: true });
        }
        if (body.name) product.name = String(body.name).slice(0, 140);
        if (body.description !== undefined) product.description = String(body.description).slice(0, 2000);
        if (body.categoryId) {
          const category = db().categories.find((c) => c.id === body.categoryId);
          if (!category) bad('CATEGORY_NOT_FOUND', 'Unknown category', 404);
          product.categoryId = category.id; product.category = category.name;
        }
        if (body.images) product.images = sanitiseImages(body.images);
        if (body.tags) product.tags = body.tags.slice(0, 12).map((t) => String(t).slice(0, 30));
        if (body.pricePaise !== undefined || body.mrpPaise !== undefined || body.stock !== undefined) {
          const variant = product.variants[0];
          if (body.pricePaise !== undefined) variant.pricePaise = Math.max(0, Math.round(Number(body.pricePaise)));
          if (body.mrpPaise !== undefined) variant.mrpPaise = Math.max(variant.pricePaise, Math.round(Number(body.mrpPaise)));
          if (body.stock !== undefined) variant.stock = Math.max(0, Math.round(Number(body.stock)));
        }
        if (Array.isArray(body.variants)) product.variants = body.variants.slice(0, 20).map((v, i) => ({ id: String(v.id ?? `var_${i + 1}`), label: String(v.label ?? 'Option'), pricePaise: Math.max(0, Math.round(Number(v.pricePaise ?? 0))), mrpPaise: Math.max(0, Math.round(Number(v.mrpPaise ?? 0))), stock: Math.max(0, Math.round(Number(v.stock ?? 0))) }));
        if (body.published !== undefined) product.published = Boolean(body.published);
        if (body.active !== undefined) product.active = Boolean(body.active);
        product.updatedAt = nowIso();
        audit(user.id, 'partner.product.updated', { productId: product.id });
        return ok(res, { product });
      }
    }
    if (tail[1] === 'catalog' && tail[2] === 'stores' && method === 'GET') {
      return send(res, 200, { items: (db().stores ?? []).filter((s) => s.ownerUserId === user.id) });
    }

    if (tail[1] === 'stores' && tail[2] && method === 'PATCH') {
      const store = (db().stores ?? []).find((s) => s.id === tail[2]);
      if (!store) bad('STORE_NOT_FOUND', 'Store not found', 404);
      if (store.ownerUserId !== user.id && !user.roles.includes('admin')) bad('FORBIDDEN', 'This store belongs to another partner', 403);
      for (const key of ['name', 'description', 'address', 'phone', 'openingHours']) {
        if (body[key] !== undefined) store[key] = String(body[key]).slice(0, 300);
      }
      if (body.deliveryCoverageKm !== undefined) store.deliveryCoverageKm = Math.max(0, Number(body.deliveryCoverageKm));
      if (body.image) store.image = sanitiseImages([body.image])[0] ?? store.image;
      if (body.logo !== undefined) store.logo = sanitiseImages([body.logo])[0] ?? null;
      if (body.banner !== undefined) store.banner = sanitiseImages([body.banner])[0] ?? null;
      if (body.status && ['active', 'paused'].includes(body.status)) store.status = body.status;
      store.updatedAt = nowIso();
      audit(user.id, 'partner.store.updated', { storeId: store.id });
      return ok(res, { store: storeView(store, true) });
    }

    if (tail[1] === 'offers') {
      if (method === 'GET') return send(res, 200, { items: (db().offers ?? []).filter((o) => o.ownerUserId === user.id || o.ownerUserId === null) });
      if (method === 'POST') {
        rateLimit(req, 'offers', 40);
        const offer = createOfferRecord(db(), body, user.id);
        audit(user.id, 'partner.offer.created', { offerId: offer.id, code: offer.code ?? null });
        return ok(res, { offer }, 201);
      }
      if (tail[2] && method === 'PATCH') {
        const offer = (db().offers ?? []).find((o) => o.id === tail[2] && (o.ownerUserId === user.id || user.roles.includes('admin')));
        if (!offer) bad('OFFER_NOT_FOUND', 'Offer not found', 404);
        if (body.active !== undefined) offer.active = Boolean(body.active);
        audit(user.id, 'partner.offer.updated', { offerId: offer.id, active: offer.active });
        return ok(res, { offer });
      }
    }
    if (tail[1] === 'coupons' && method === 'GET') {
      return send(res, 200, { items: (db().coupons ?? []).filter((c) => c.ownerUserId === user.id || user.roles.includes('admin')) });
    }

    // ------------------------------------------------------ order operations
    if (tail[1] === 'orders' && tail[3] === 'status' && method === 'POST') {
      const services = partnerServices(user);
      const order = (db().orders ?? []).find((o) => o.id === tail[2]);
      if (!order) bad('ORDER_NOT_FOUND', 'Order not found', 404);
      if (!services.includes(order.service) && !user.roles.includes('admin')) bad('FORBIDDEN', 'This order is not part of your service', 403);
      const to = String(body.status ?? '');
      if (to === 'delivered') {
        const rec = delivery.recordFor(order.id);
        if (rec && !rec.verifiedAt) bad('DELIVERY_CODE_REQUIRED', 'Enter the customer delivery verification code before completing delivery', 409);
      }
      if (!transitionOrderStatus(order.status, to)) bad('ILLEGAL_TRANSITION', `Cannot move ${order.status} → ${to}`, 409);
      if (to === 'cancelled' && order.service === 'grocery') {
        for (const it of order.items) db().inventory[`${order.listingId}:${it.id}`] = (db().inventory[`${order.listingId}:${it.id}`] ?? 0) + it.quantity;
      }
      order.status = to; order.updatedAt = nowIso();
      if (to === 'accepted') notify(order.userId, { type: 'restaurant.accepted', reference: order.reference, restaurant: db().stores.find((s) => s.id === order.listingId)?.name ?? 'Store' });
      notify(order.userId, { type: 'delivery.tracking', reference: order.reference, status: to.replace(/_/g, ' ') });
      audit(user.id, 'partner.order.status', { orderId: order.id, status: to });
      return ok(res, { order: publicOrder ? publicOrder(order) : order });
    }

    if (tail[1] === 'deliveries') {
      const services = partnerServices(user);
      const relevant = (db().orders ?? []).filter((o) => services.includes(o.service) && ['packed', 'out_for_delivery'].includes(o.status));
      if (method === 'GET') {
        return send(res, 200, {
          items: relevant.map((o) => ({
            id: o.id, reference: o.reference, status: o.status, service: o.service,
            deliveryAddress: o.deliveryAddress, customerName: o.deliveryAddress?.name ?? null,
            customerPhone: o.deliveryAddress?.phone ?? null, items: o.items,
            deliveryVerification: delivery.maskedFor(o.id),
          })),
        });
      }
      if (method === 'POST' && tail[3] === 'verify') {
        rateLimit(req, 'delivery-verify', 30);
        const order = (db().orders ?? []).find((o) => o.id === tail[2]);
        if (!order) bad('ORDER_NOT_FOUND', 'Order not found', 404);
        if (!services.includes(order.service) && !user.roles.includes('admin')) bad('FORBIDDEN', 'This order is not part of your service', 403);
        if (!['packed', 'out_for_delivery'].includes(order.status)) bad('INVALID_ORDER_STATE', 'Delivery can only be verified when the order is packed or out for delivery', 409);
        const result = delivery.verify(order.id, body.code);
        audit(user.id, 'delivery.verify', { orderId: order.id, ok: result.ok, code: result.code });
        if (!result.ok) {
          if (result.code === 'INCORRECT_CODE') return ok(res, { verified: false, ...result }, 422);
          bad(result.code, result.message, 409);
        }
        order.status = 'delivered'; order.updatedAt = nowIso();
        notify(order.userId, { type: 'delivery.tracking', reference: order.reference, status: 'delivered' });
        return ok(res, { verified: true, order: publicOrder ? publicOrder(order) : order });
      }
    }
    return false;
  }

  return { handle, storeView, liveBanners, partnerServices };
}
