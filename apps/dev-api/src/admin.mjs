/**
 * GOWAYY ADMIN API — the secured control-centre backend.
 *
 * Every route requires an authenticated session whose account carries the
 * `admin` role. Customer and partner sessions are rejected server-side (403),
 * not merely hidden in the UI. Every mutation is written to the audit log.
 */
import { catalogue } from '@gowayy/catalog';
import { makeId, nowIso } from '@gowayy/shared-utils';
import { createCategoryRecord, sanitiseImages } from './catalog-hub.mjs';

const PARTNER_ROLES = ['restaurant', 'grocery', 'seller', 'property', 'tour_operator', 'driver'];
const CSV_DATE = (iso) => String(iso ?? '').slice(0, 10);

export function createAdminHub(ctx) {
  const { db, bad, auth, audit, publicOrder, delivery } = ctx;

  function requireAdmin(user) {
    if (!user) bad('UNAUTHORIZED', 'Sign in to continue', 401);
    if (!user.roles.includes('admin')) bad('ADMIN_REQUIRED', 'Administrator authorisation is required for this action', 403);
  }
  const usersOf = () => db().users.filter((u) => !u.deletedAt);
  const money = (paise) => `₹${((paise ?? 0) / 100).toLocaleString('en-IN')}`;

  function customerView(u) {
    const orders = db().orders.filter((o) => o.userId === u.id);
    const bookings = db().bookings.filter((b) => b.userId === u.id);
    const payments = db().payments.filter((p) => p.userId === u.id && p.status === 'captured');
    return {
      id: u.id, name: `${u.firstName} ${u.lastName}`, firstName: u.firstName, lastName: u.lastName, email: u.email,
      roles: u.roles, createdAt: u.createdAt, status: u.accountStatus ?? 'active', demo: Boolean(u.demo),
      orders: orders.length, bookings: bookings.length, spendPaise: payments.reduce((s, p) => s + p.amountPaise, 0),
      tickets: db().tickets.filter((t) => t.userId === u.id).length,
    };
  }

  function partnerView(u) {
    const claims = db().partners.filter((p) => p.userId === u.id);
    const docs = db().partnerDocuments?.[u.id] ?? [];
    const driver = db().drivers.find((d) => d.userId === u.id);
    const services = [...new Set(u.roles.filter((r) => PARTNER_ROLES.includes(r)))];
    const approval = u.partnerApproval ?? (driver?.verification === 'verified' ? 'verified' : claims.length ? 'pending' : 'unverified');
    return {
      id: u.id, name: `${u.firstName} ${u.lastName}`, email: u.email, roles: services,
      businessName: db().partnerProfiles?.[u.id]?.businessName ?? null,
      phone: db().partnerProfiles?.[u.id]?.phone ?? null,
      claims: claims.map((c) => ({ role: c.role, listingId: c.listingId, claimedAt: c.claimedAt })),
      documents: docs, driver: driver ? { verification: driver.verification, vehicleClass: driver.vehicleClass, online: driver.online } : null,
      approval, status: u.accountStatus ?? 'active', createdAt: u.createdAt, demo: Boolean(u.demo),
      orders: db().orders.filter((o) => claims.some((c) => c.listingId === o.listingId)).length,
    };
  }

  function analytics() {
    const days = [];
    for (let i = 13; i >= 0; i -= 1) {
      const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const payments = db().payments.filter((p) => p.status === 'captured' && CSV_DATE(p.updatedAt) === date);
      days.push({
        date,
        customers: usersOf().filter((u) => CSV_DATE(u.createdAt) === date && u.roles.includes('customer')).length,
        partners: usersOf().filter((u) => CSV_DATE(u.createdAt) === date && u.roles.some((r) => PARTNER_ROLES.includes(r))).length,
        orders: db().orders.filter((o) => CSV_DATE(o.createdAt) === date).length,
        bookings: db().bookings.filter((b) => CSV_DATE(b.createdAt) === date).length,
        revenuePaise: payments.reduce((s, p) => s + p.amountPaise, 0),
      });
    }
    const byService = {};
    for (const rec of [...db().orders, ...db().bookings]) {
      byService[rec.service] ??= { count: 0, valuePaise: 0 };
      byService[rec.service].count += 1;
      byService[rec.service].valuePaise += rec.price?.totalPaise ?? 0;
    }
    const byDestination = {};
    for (const b of db().bookings) {
      const dest = b.details?.dropoff?.name ?? b.details?.destinationName ?? 'Unassigned';
      byDestination[dest] ??= 0; byDestination[dest] += 1;
    }
    return { days, byService, byDestination };
  }

  async function handle(req, res, method, tail, body, q, send, ok) {
    if (tail[0] !== 'admin') return false;
    const { user } = auth(req);
    requireAdmin(user);
    const resource = tail[1];

    if (method === 'GET' && resource === 'overview') {
      const users = usersOf();
      const captured = db().payments.filter((p) => p.status === 'captured');
      return send(res, 200, {
        totals: {
          customers: users.filter((u) => u.roles.includes('customer')).length,
          partners: users.filter((u) => u.roles.some((r) => PARTNER_ROLES.includes(r))).length,
          activePartners: users.filter((u) => u.roles.some((r) => PARTNER_ROLES.includes(r)) && (u.accountStatus ?? 'active') === 'active').length,
          pendingApprovals: users.filter((u) => u.roles.some((r) => PARTNER_ROLES.includes(r)) && (u.partnerApproval ?? 'pending') === 'pending').length,
          stores: db().stores.length,
          properties: catalogue.properties.length,
          products: db().catalogProducts.length,
          orders: db().orders.length,
          bookings: db().bookings.length,
          revenuePaise: captured.reduce((s, p) => s + p.amountPaise, 0),
          refundsPaise: db().transactions.filter((t) => t.type === 'refund').reduce((s, t) => s + t.amountPaise, 0),
          openTickets: db().tickets.filter((t) => t.status === 'open').length,
        },
        // Match the Supabase camelCased read contract consumed by Admin.
        recentActivity: [...db().audit].slice(-12).reverse().map((entry) => ({ ...entry, createdAt: entry.at })),
        recentOrders: [...db().orders].slice(-5).reverse().map((o) => publicOrder(o)),
        serviceAvailability: db().settings.services,
      });
    }

    if (resource === 'customers') {
      if (method === 'GET') {
        const term = String(q.get('q') ?? '').toLowerCase();
        const items = usersOf().filter((u) => u.roles.includes('customer'))
          .filter((u) => !term || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(term))
          .map(customerView);
        return send(res, 200, { items });
      }
      if (method === 'PATCH' && tail[2]) {
        const target = usersOf().find((u) => u.id === tail[2] && u.roles.includes('customer'));
        if (!target) bad('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
        if (['active', 'suspended'].includes(body.status)) target.accountStatus = body.status;
        if (body.status === 'suspended') db().sessions = db().sessions.filter((s) => s.userId !== target.id);
        audit(user.id, 'admin.customer.updated', { customerId: target.id, status: target.accountStatus });
        return ok(res, { customer: customerView(target) });
      }
    }

    if (resource === 'partners') {
      if (method === 'GET') {
        const term = String(q.get('q') ?? '').toLowerCase();
        return send(res, 200, {
          items: usersOf().filter((u) => u.roles.some((r) => PARTNER_ROLES.includes(r)))
            .filter((u) => !term || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(term))
            .map(partnerView),
        });
      }
      if (method === 'PATCH' && tail[2]) {
        const target = usersOf().find((u) => u.id === tail[2]);
        if (!target || !target.roles.some((r) => PARTNER_ROLES.includes(r))) bad('PARTNER_NOT_FOUND', 'Partner not found', 404);
        if (['verified', 'pending', 'rejected'].includes(body.approval)) {
          target.partnerApproval = body.approval;
          const driver = db().drivers.find((d) => d.userId === target.id);
          if (driver) driver.verification = body.approval === 'verified' ? 'verified' : body.approval;
          const docs = db().partnerDocuments?.[target.id] ?? [];
          for (const doc of docs) doc.status = body.approval === 'verified' ? 'verified' : body.approval;
        }
        if (['active', 'suspended'].includes(body.status)) target.accountStatus = body.status;
        audit(user.id, 'admin.partner.reviewed', { partnerId: target.id, approval: target.partnerApproval, status: target.accountStatus });
        return ok(res, { partner: partnerView(target) });
      }
    }

    if (resource === 'stores') {
      if (method === 'GET') return send(res, 200, { items: db().stores.map((s) => ({ ...s, productCount: db().catalogProducts.filter((p) => p.storeId === s.id).length })) });
      if (method === 'POST') {
        const name = String(body.name ?? '').trim();
        if (name.length < 2) bad('VALIDATION_FAILED', 'Store name is required', 422);
        const store = {
          id: makeId('str'), name, categoryId: body.categoryId ?? null,
          categoryName: db().categories.find((c) => c.id === body.categoryId)?.name ?? 'General',
          ownerUserId: body.ownerUserId ?? null, destinationId: body.destinationId ?? null,
          description: String(body.description ?? '').slice(0, 500), image: null,
          deliveryCoverageKm: Number(body.deliveryCoverageKm ?? 5), slots: [], address: String(body.address ?? ''),
          phone: String(body.phone ?? ''), openingHours: String(body.openingHours ?? '09:00–20:00'),
          status: 'active', verified: false, createdAt: nowIso(),
        };
        db().stores.push(store);
        audit(user.id, 'admin.store.created', { storeId: store.id });
        return ok(res, { store }, 201);
      }
      if (method === 'PATCH' && tail[2]) {
        const store = db().stores.find((s) => s.id === tail[2]);
        if (!store) bad('STORE_NOT_FOUND', 'Store not found', 404);
        for (const key of ['name', 'description', 'address', 'phone', 'openingHours']) if (body[key] !== undefined) store[key] = String(body[key]).slice(0, 500);
        if (body.status && ['active', 'paused', 'suspended'].includes(body.status)) store.status = body.status;
        if (body.verified !== undefined) store.verified = Boolean(body.verified);
        audit(user.id, 'admin.store.updated', { storeId: store.id, status: store.status });
        return ok(res, { store });
      }
    }

    if (resource === 'categories') {
      if (method === 'GET') return send(res, 200, { items: db().categories.map((c) => ({ ...c, productCount: db().catalogProducts.filter((p) => p.categoryId === c.id).length })) });
      if (method === 'POST') {
        const category = createCategoryRecord(db(), body, user.id);
        audit(user.id, 'admin.category.created', { categoryId: category.id });
        return ok(res, { category }, 201);
      }
      if (method === 'PATCH' && tail[2]) {
        const category = db().categories.find((c) => c.id === tail[2]);
        if (!category) bad('CATEGORY_NOT_FOUND', 'Category not found', 404);
        if (body.name) category.name = String(body.name).slice(0, 60);
        if (body.active !== undefined) category.active = Boolean(body.active);
        audit(user.id, 'admin.category.updated', { categoryId: category.id });
        return ok(res, { category });
      }
    }

    if (resource === 'products') {
      if (method === 'GET') return send(res, 200, { items: db().catalogProducts.map((p) => ({ ...p, stock: p.variants?.[0]?.stock ?? 0 })) });
      if (method === 'PATCH' && tail[2]) {
        const product = db().catalogProducts.find((p) => p.id === tail[2]);
        if (!product) bad('PRODUCT_NOT_FOUND', 'Product not found', 404);
        for (const key of ['active', 'published', 'featured']) if (body[key] !== undefined) product[key] = Boolean(body[key]);
        if (body.categoryId) {
          const cat = db().categories.find((c) => c.id === body.categoryId);
          if (!cat) bad('CATEGORY_NOT_FOUND', 'Unknown category', 404);
          product.categoryId = cat.id; product.category = cat.name;
        }
        audit(user.id, 'admin.product.updated', { productId: product.id, featured: product.featured, active: product.active });
        return ok(res, { product });
      }
    }

    if (resource === 'orders') {
      if (method === 'GET') {
        const term = String(q.get('service') ?? '');
        return send(res, 200, { items: db().orders.filter((o) => !term || o.service === term).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((o) => ({ ...publicOrder(o), userId: o.userId, deliveryVerification: delivery.maskedFor(o.id) })) });
      }
      if (method === 'GET' && tail[2] === 'detail') {
        const order = db().orders.find((o) => o.id === tail[1]);
        if (!order) bad('ORDER_NOT_FOUND', 'Order not found', 404);
        return send(res, 200, { order: publicOrder(order), payment: db().payments.find((p) => p.id === order.paymentId) ?? null });
      }
    }

    if (resource === 'bookings' && method === 'GET') {
      return send(res, 200, { items: [...db().bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
    }

    if (resource === 'payments') {
      if (method === 'GET') {
        return send(res, 200, {
          items: db().payments.slice().reverse(),
          transactions: db().transactions.slice().reverse(),
          reconciliation: {
            capturedPaise: db().payments.filter((p) => p.status === 'captured').reduce((s, p) => s + p.amountPaise, 0),
            refundedPaise: db().transactions.filter((t) => t.type === 'refund').reduce((s, t) => s + t.amountPaise, 0),
            pendingPaise: db().payments.filter((p) => p.status === 'requires_action').reduce((s, p) => s + p.amountPaise, 0),
          },
        });
      }
      if (method === 'POST' && tail[3] === 'refund') {
        const payment = db().payments.find((p) => p.id === tail[2]);
        if (!payment) bad('PAYMENT_NOT_FOUND', 'Payment not found', 404);
        if (payment.status !== 'captured') bad('NOT_REFUNDABLE', 'Only captured payments can be refunded', 409);
        const amount = body.full ? payment.amountPaise : Math.round(payment.amountPaise * 0.8);
        payment.status = 'refunded'; payment.updatedAt = nowIso();
        db().transactions.push({ id: makeId('txn'), paymentId: payment.id, type: 'refund', amountPaise: amount, note: body.reason ?? 'Admin refund', createdAt: nowIso() });
        const ref = db().orders.find((o) => o.id === payment.orderId)?.reference ?? db().bookings.find((b) => b.id === payment.bookingId)?.reference ?? payment.id;
        db().notifications.push({ id: makeId('ntf'), userId: payment.userId, type: 'refund.issued', title: 'Refund issued', body: `A refund of ${money(amount)} was recorded for ${ref}.`, dedupeKey: `refund:${payment.id}`, createdAt: nowIso() });
        audit(user.id, 'admin.payment.refunded', { paymentId: payment.id, amountPaise: amount });
        return ok(res, { payment, refundPaise: amount });
      }
    }

    if (resource === 'settlements') {
      if (method === 'GET') {
        const rows = db().settlements.map((s) => ({ ...s, partner: db().users.find((u) => u.id === s.userId)?.email ?? null }));
        return send(res, 200, { items: rows, commissionPercent: 15 });
      }
      if (method === 'POST' && tail[3] === 'pay') {
        const settlement = db().settlements.find((s) => s.id === tail[2]);
        if (!settlement) bad('SETTLEMENT_NOT_FOUND', 'Settlement not found', 404);
        if (settlement.status === 'paid') return ok(res, { settlement });
        settlement.status = 'paid'; settlement.paidAt = nowIso();
        audit(user.id, 'admin.settlement.paid', { settlementId: settlement.id, amountPaise: settlement.amountPaise });
        return ok(res, { settlement });
      }
    }

    if (resource === 'banners') {
      if (method === 'GET') return send(res, 200, { items: db().banners.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) });
      if (method === 'POST') {
        const title = String(body.title ?? '').trim();
        if (!title) bad('VALIDATION_FAILED', 'Banner title is required', 422);
        const banner = {
          id: makeId('bnr'), title: title.slice(0, 80), subtitle: String(body.subtitle ?? '').slice(0, 160),
          href: String(body.href ?? '/').slice(0, 200), destinationId: body.destinationId ?? null,
          image: body.image ?? null, order: Number(body.order ?? db().banners.length + 1),
          active: body.active !== false, startAt: body.startAt ?? null, endAt: body.endAt ?? null,
          createdAt: nowIso(), updatedAt: nowIso(),
        };
        db().banners.push(banner);
        audit(user.id, 'admin.banner.created', { bannerId: banner.id });
        return ok(res, { banner }, 201);
      }
      if (method === 'PATCH' && tail[2]) {
        const banner = db().banners.find((b) => b.id === tail[2]);
        if (!banner) bad('BANNER_NOT_FOUND', 'Banner not found', 404);
        for (const key of ['title', 'subtitle', 'href']) if (body[key] !== undefined) banner[key] = String(body[key]).slice(0, 200);
        for (const key of ['order', 'destinationId', 'startAt', 'endAt']) if (body[key] !== undefined) banner[key] = body[key];
        if (body.active !== undefined) banner.active = Boolean(body.active);
        if (body.image !== undefined) banner.image = body.image;
        banner.updatedAt = nowIso();
        audit(user.id, 'admin.banner.updated', { bannerId: banner.id });
        return ok(res, { banner });
      }
      if (method === 'DELETE' && tail[2]) {
        db().banners = db().banners.filter((b) => b.id !== tail[2]);
        audit(user.id, 'admin.banner.deleted', { bannerId: tail[2] });
        return ok(res, { deleted: true });
      }
    }

    if (resource === 'offers') {
      if (method === 'GET') return send(res, 200, { items: db().offers, coupons: db().coupons });
      if (method === 'PATCH' && tail[2]) {
        const offer = db().offers.find((o) => o.id === tail[2]);
        if (!offer) bad('OFFER_NOT_FOUND', 'Offer not found', 404);
        if (body.active !== undefined) offer.active = Boolean(body.active);
        audit(user.id, 'admin.offer.updated', { offerId: offer.id, active: offer.active });
        return ok(res, { offer });
      }
    }

    if (resource === 'destinations') {
      db().destinations ??= [];
      if (method === 'GET') {
        return send(res, 200, {
          items: db().destinations.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((d) => ({
            ...d,
            featured: (db().featuredDestinations ?? []).includes(d.id) || Boolean(d.featured),
            images: [...(d.images ?? [])].sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)) || Number(a.order ?? 0) - Number(b.order ?? 0)),
            imagesVerified: (d.images ?? []).filter((i) => i.status === 'verified').length,
            listings: catalogue.properties.filter((p) => p.destinationId === d.id).length + catalogue.restaurants.filter((r) => r.destinationId === d.id).length + catalogue.groceryStores.filter((s) => s.destinationId === d.id).length,
          })),
        });
      }
      if (method === 'POST' && tail.length === 2) {
        const name = String(body.name ?? '').trim().slice(0, 80);
        if (name.length < 2) bad('VALIDATION_FAILED', 'Destination name is required', 422);
        const slug = String(body.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 80);
        if (db().destinations.some((d) => d.slug === slug)) bad('DESTINATION_EXISTS', 'A destination with this slug already exists', 409);
        const images = sanitiseImages(body.images ?? []).map((i, n) => ({ ...i, id: makeId('dimg'), primary: n === 0, thumbPath: i.path }));
        const destination = {
          id: makeId('dst'), slug, name, region: String(body.region ?? 'Darjeeling Himalaya').slice(0, 80),
          summary: String(body.summary ?? '').slice(0, 240), description: String(body.description ?? '').slice(0, 4000),
          coords: body.coords && Number.isFinite(Number(body.coords.lat)) ? { lat: Number(body.coords.lat), lng: Number(body.coords.lng) } : null,
          images, active: body.active !== false, featured: Boolean(body.featured),
          order: Number(body.order ?? (db().destinations.length + 1)), source: 'admin',
          createdAt: nowIso(), updatedAt: nowIso(),
        };
        db().destinations.push(destination);
        if (destination.featured) db().featuredDestinations = [...new Set([...(db().featuredDestinations ?? []), destination.id])];
        audit(user.id, 'admin.destination.created', { destinationId: destination.id });
        return ok(res, { destination }, 201);
      }
      if (method === 'PATCH' && tail[2] && tail[3] !== 'images') {
        const destination = db().destinations.find((d) => d.id === tail[2] || d.slug === tail[2]);
        if (!destination) bad('DESTINATION_NOT_FOUND', 'Destination not found', 404);
        for (const key of ['name', 'region', 'summary', 'description']) if (body[key] !== undefined) destination[key] = String(body[key]).slice(0, key === 'description' ? 4000 : 240);
        if (body.coords !== undefined) destination.coords = body.coords && Number.isFinite(Number(body.coords.lat)) ? { lat: Number(body.coords.lat), lng: Number(body.coords.lng) } : null;
        if (body.active !== undefined) destination.active = Boolean(body.active);
        if (body.order !== undefined) destination.order = Number(body.order);
        if (body.featured !== undefined) {
          destination.featured = Boolean(body.featured);
          const featured = new Set(db().featuredDestinations ?? []);
          if (destination.featured) featured.add(destination.id); else featured.delete(destination.id);
          db().featuredDestinations = [...featured];
        }
        if (body.images !== undefined) {
          const incoming = sanitiseImages(body.images).map((i, n) => ({ ...i, id: `dimg_${makeId('x')}`, primary: n === 0, thumbPath: i.path }));
          destination.images = incoming;
        }
        destination.updatedAt = nowIso();
        audit(user.id, 'admin.destination.updated', { destinationId: destination.id });
        return ok(res, { destination });
      }
      if (method === 'DELETE' && tail[2] && tail[3] !== 'images') {
        const destination = db().destinations.find((d) => d.id === tail[2]);
        if (!destination) bad('DESTINATION_NOT_FOUND', 'Destination not found', 404);
        // Soft delete keeps existing bookings and links intact.
        destination.active = false; destination.updatedAt = nowIso();
        audit(user.id, 'admin.destination.deactivated', { destinationId: destination.id });
        return ok(res, { deactivated: true });
      }
      // Image gallery operations: append, replace, set primary, remove.
      if (tail[2] && tail[3] === 'images') {
        const destination = db().destinations.find((d) => d.id === tail[2]);
        if (!destination) bad('DESTINATION_NOT_FOUND', 'Destination not found', 404);
        destination.images ??= [];
        if (method === 'POST') {
          const images = sanitiseImages([body.image ?? body]);
          if (!images.length) bad('VALIDATION_FAILED', 'Provide an image path or HTTPS URL', 422);
          const image = { ...images[0], id: makeId('dimg'), primary: destination.images.length === 0, order: destination.images.length + 1, thumbPath: images[0].path };
          destination.images.push(image);
          destination.updatedAt = nowIso();
          audit(user.id, 'admin.destination.image.added', { destinationId: destination.id, imageId: image.id });
          return ok(res, { image, destination }, 201);
        }
        if (method === 'PATCH' && tail[4]) {
          const image = destination.images.find((i) => i.id === tail[4]);
          if (!image) bad('IMAGE_NOT_FOUND', 'Image not found on this destination', 404);
          if (body.primary) destination.images.forEach((i) => { i.primary = false; });
          if (body.alt !== undefined) image.alt = String(body.alt).slice(0, 160);
          if (body.path) { const next = sanitiseImages([{ ...image, path: body.path }])[0]; if (next) Object.assign(image, next, { id: image.id, primary: image.primary }); }
          if (body.order !== undefined) {
            // Reorder within the gallery. Order is 1-based; out-of-range values clamp.
            const ordered = destination.images.slice().sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
            const from = ordered.findIndex((i) => i.id === image.id);
            const to = Math.max(0, Math.min(ordered.length - 1, Math.round(Number(body.order)) - 1));
            if (from !== -1 && from !== to) { const [moved] = ordered.splice(from, 1); ordered.splice(to, 0, moved); }
            ordered.forEach((i, n) => { i.order = n + 1; });
            destination.images = ordered;
          }
          if (body.primary) image.primary = true;
          if (!destination.images.some((i) => i.primary) && destination.images[0]) destination.images[0].primary = true;
          destination.updatedAt = nowIso();
          audit(user.id, 'admin.destination.image.updated', { destinationId: destination.id, imageId: image.id });
          return ok(res, { image, destination });
        }
        if (method === 'DELETE' && tail[4]) {
          const before = destination.images.length;
          destination.images = destination.images.filter((i) => i.id !== tail[4]);
          if (destination.images.length === before) bad('IMAGE_NOT_FOUND', 'Image not found', 404);
          if (!destination.images.some((i) => i.primary) && destination.images[0]) destination.images[0].primary = true;
          destination.updatedAt = nowIso();
          audit(user.id, 'admin.destination.image.deleted', { destinationId: destination.id, imageId: tail[4] });
          return ok(res, { destination });
        }
      }
    }

    if (resource === 'posters') {
      db().posters ??= [];
      if (method === 'GET') {
        return send(res, 200, { items: db().posters.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) });
      }
      if (method === 'POST') {
        const kind = body.kind === 'food' ? 'food' : 'grocery';
        const title = String(body.title ?? '').trim().slice(0, 100);
        if (!title) bad('VALIDATION_FAILED', 'Poster title is required', 422);
        const images = sanitiseImages([body.image ?? {}]);
        if (!images.length) bad('POSTER_IMAGE_REQUIRED', 'Upload a poster image or provide an HTTPS image URL', 422);
        const poster = {
          id: makeId('pst'), slug: String(body.slug ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).slice(0, 80),
          kind, title, subtitle: String(body.subtitle ?? '').slice(0, 160), cta: String(body.cta ?? 'See all').slice(0, 40),
          href: String(body.href ?? (kind === 'food' ? '/food' : '/groceries')).slice(0, 200),
          image: images[0], order: Number(body.order ?? (db().posters.filter((p) => p.kind === kind).length + 1)),
          active: body.active !== false, startAt: body.startAt ?? null, endAt: body.endAt ?? null,
          createdAt: nowIso(), updatedAt: nowIso(),
        };
        db().posters.push(poster);
        audit(user.id, 'admin.poster.created', { posterId: poster.id, kind });
        return ok(res, { poster }, 201);
      }
      if (method === 'PATCH' && tail[2]) {
        const poster = db().posters.find((p) => p.id === tail[2]);
        if (!poster) bad('POSTER_NOT_FOUND', 'Poster not found', 404);
        for (const key of ['title', 'subtitle', 'cta', 'href', 'slug']) if (body[key] !== undefined) poster[key] = String(body[key]).slice(0, 200);
        if (body.kind === 'food' || body.kind === 'grocery') poster.kind = body.kind;
        if (body.order !== undefined) poster.order = Number(body.order);
        if (body.active !== undefined) poster.active = Boolean(body.active);
        for (const key of ['startAt', 'endAt']) if (body[key] !== undefined) poster[key] = body[key] || null;
        if (body.image !== undefined) {
          const images = sanitiseImages([body.image]);
          if (!images.length) bad('POSTER_IMAGE_REQUIRED', 'Provide a valid image path or HTTPS URL', 422);
          poster.image = images[0];
        }
        poster.updatedAt = nowIso();
        audit(user.id, 'admin.poster.updated', { posterId: poster.id });
        return ok(res, { poster });
      }
      if (method === 'DELETE' && tail[2]) {
        const before = db().posters.length;
        db().posters = db().posters.filter((p) => p.id !== tail[2]);
        if (db().posters.length === before) bad('POSTER_NOT_FOUND', 'Poster not found', 404);
        audit(user.id, 'admin.poster.deleted', { posterId: tail[2] });
        return ok(res, { deleted: true });
      }
      if (method === 'POST' && tail[2] === 'reorder') {
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        ids.forEach((id, index) => { const poster = db().posters.find((p) => p.id === id); if (poster) poster.order = index + 1; });
        audit(user.id, 'admin.posters.reordered', { count: ids.length });
        return ok(res, { items: db().posters.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) });
      }
    }

    if (resource === 'service-areas') {
      db().serviceAreas ??= [];
      const cleanPins = (list) => [...new Set((Array.isArray(list) ? list : String(list ?? '').split(/[,\s]+/))
        .map((p) => String(p).trim()).filter((p) => /^\d{6}$/.test(p)))].slice(0, 200);
      if (method === 'GET') return send(res, 200, { items: db().serviceAreas });
      if (method === 'POST') {
        const city = String(body.city ?? '').trim().slice(0, 80);
        if (city.length < 2) bad('VALIDATION_FAILED', 'City name is required', 422);
        if (db().serviceAreas.some((a) => a.city.toLowerCase() === city.toLowerCase())) bad('SERVICE_AREA_EXISTS', 'This city already exists', 409);
        const area = {
          id: makeId('sva'), city, state: String(body.state ?? 'West Bengal').slice(0, 80),
          active: body.active !== false, foodPincodes: cleanPins(body.foodPincodes), groceryPincodes: cleanPins(body.groceryPincodes),
          deliveryNote: String(body.deliveryNote ?? '').slice(0, 240), createdAt: nowIso(), updatedAt: nowIso(),
        };
        db().serviceAreas.push(area);
        audit(user.id, 'admin.serviceArea.created', { serviceAreaId: area.id, city });
        return ok(res, { serviceArea: area }, 201);
      }
      if (method === 'PATCH' && tail[2]) {
        const area = db().serviceAreas.find((a) => a.id === tail[2]);
        if (!area) bad('SERVICE_AREA_NOT_FOUND', 'Service area not found', 404);
        if (body.city !== undefined) area.city = String(body.city).slice(0, 80);
        if (body.state !== undefined) area.state = String(body.state).slice(0, 80);
        if (body.active !== undefined) area.active = Boolean(body.active);
        if (body.foodPincodes !== undefined) area.foodPincodes = cleanPins(body.foodPincodes);
        if (body.groceryPincodes !== undefined) area.groceryPincodes = cleanPins(body.groceryPincodes);
        if (body.deliveryNote !== undefined) area.deliveryNote = String(body.deliveryNote).slice(0, 240);
        area.updatedAt = nowIso();
        audit(user.id, 'admin.serviceArea.updated', { serviceAreaId: area.id });
        return ok(res, { serviceArea: area });
      }
      if (method === 'DELETE' && tail[2]) {
        const before = db().serviceAreas.length;
        db().serviceAreas = db().serviceAreas.filter((a) => a.id !== tail[2]);
        if (db().serviceAreas.length === before) bad('SERVICE_AREA_NOT_FOUND', 'Service area not found', 404);
        audit(user.id, 'admin.serviceArea.deleted', { serviceAreaId: tail[2] });
        return ok(res, { deleted: true });
      }
    }

    if (resource === 'support') {
      if (method === 'GET') return send(res, 200, { items: db().tickets.slice().reverse().map((t) => ({ ...t, customerEmail: db().users.find((u) => u.id === t.userId)?.email ?? null })) });
      if (method === 'PATCH' && tail[2]) {
        const ticket = db().tickets.find((t) => t.id === tail[2]);
        if (!ticket) bad('TICKET_NOT_FOUND', 'Ticket not found', 404);
        if (body.status) ticket.status = String(body.status);
        if (body.resolution) ticket.resolution = String(body.resolution).slice(0, 1000);
        audit(user.id, 'admin.ticket.updated', { ticketId: ticket.id, status: ticket.status });
        return ok(res, { ticket });
      }
    }

    if (resource === 'audit' && method === 'GET') {
      const term = String(q.get('q') ?? '').toLowerCase();
      const items = [...db().audit].reverse().filter((a) => !term || `${a.action} ${a.actor}`.toLowerCase().includes(term)).slice(0, 300);
      return send(res, 200, { items });
    }

    if (resource === 'analytics' && method === 'GET') return send(res, 200, analytics());

    if (resource === 'settings') {
      if (method === 'GET') return send(res, 200, { services: db().settings.services, appConfig: db().settings.appConfig });
      if (method === 'PATCH') {
        db().settings.services = { ...db().settings.services, ...(body.services ?? {}) };
        db().settings.appConfig = { ...db().settings.appConfig, ...(body.appConfig ?? {}), updatedAt: nowIso() };
        audit(user.id, 'admin.settings.updated', { services: db().settings.services });
        return ok(res, { services: db().settings.services, appConfig: db().settings.appConfig });
      }
    }

    bad('NOT_FOUND', `No admin endpoint for ${method} ${req.url}`, 404);
  }
  return { handle };
}
