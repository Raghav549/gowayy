/**
 * GOWAYY PARTNER hub module — partner-facing backend for the dev-api reference
 * server: business profile, document verification, inventory/menu/room/tour
 * management, earnings and settlements. This is partner tooling only —
 * there is deliberately NO admin panel anywhere in the ecosystem.
 */
import { catalogue } from '@gowayy/catalog';
import { makeId, nowIso, formatINR } from '@gowayy/shared-utils';
import { COMMISSION_RATES } from '@gowayy/pricing-engine';
import { slotBooked, slotView } from './experiences.mjs';
import { bookingActor, orderActor } from './partner-access.mjs';

const PARTNER_SERVICES = {
  driver: ['cab', 'shared_taxi', 'parcel', 'food', 'grocery'],
  restaurant: ['food'],
  grocery: ['grocery', 'marketplace'],
  property: ['hotel', 'homestay', 'lodge', 'guesthouse'],
  tour_operator: ['tourism', 'package', 'experience'],
};

export function partnerServicesOf(user) {
  return [...new Set((user.roles ?? []).flatMap((r) => PARTNER_SERVICES[r] ?? []))];
}

export function createPartnerHub(ctx) {
  const { db, bad, auth, rateLimit, notify, audit, formatINR: fmt } = ctx;

  function myClaims(user) { return (db().partners ?? []).filter((p) => p.userId === user.id); }
  function requireRole(user, role) {
    if (!user.roles.includes(role)) bad('ROLE_REQUIRED', `This section requires the ${role} partner role`, 403);
  }

  async function handle(req, res, method, tail, body, q, send, ok) {
    if (tail[0] !== 'partner') return false;
    const { user } = auth(req);

    // ---- overview dashboard ----
    if (method === 'GET' && tail[1] === 'overview') {
      const services = partnerServicesOf(user);
      const myBookings = db().bookings.filter((b) => ['requested', 'awaiting_payment', 'confirmed', 'assigned', 'in_progress'].includes(b.status) && bookingActor(db(), user, b));
      const myOrders = db().orders.filter((o) => !['delivered', 'cancelled', 'refunded'].includes(o.status) && orderActor(db(), user, o));
      const driver = db().drivers.find((d) => d.userId === user.id) ?? null;
      const openJobs = driver ? db().jobs.filter((j) => j.status === 'open' && (driver.services.includes(j.service))) : [];
      const earnings = earningsSummary(user.id);
      return send(res, 200, {
        roles: user.roles, services, verification: driver?.verification ?? (myClaims(user).length ? 'pending' : 'unverified'),
        counts: { bookings: myBookings.length, orders: myOrders.length, openRequests: myBookings.filter((b) => b.status === 'requested').length + myOrders.filter((o) => o.status === 'created').length, openJobs: openJobs.length },
        driver, earnings,
      });
    }

    // ---- business profile ----
    if (tail[1] === 'profile') {
      db().partnerProfiles ??= {};
      if (method === 'GET') return send(res, 200, { profile: db().partnerProfiles[user.id] ?? null });
      if (method === 'PATCH') {
        const prev = db().partnerProfiles[user.id] ?? { userId: user.id, createdAt: nowIso() };
        const next = { ...prev, ...Object.fromEntries(Object.entries(body).filter(([k]) => ['businessName', 'phone', 'address', 'gstin', 'description'].includes(k)).map(([k, v]) => [k, String(v).slice(0, 300)])), updatedAt: nowIso() };
        db().partnerProfiles[user.id] = next;
        audit(user.id, 'partner.profile.updated', {});
        return ok(res, { profile: next });
      }
    }

    // ---- document verification (demo adapter, clearly labelled) ----
    if (method === 'GET' && tail[1] === 'verification') {
      return send(res, 200, { documents: db().partnerDocuments?.[user.id] ?? [], driver: db().drivers.find((d) => d.userId === user.id)?.verification ?? null, demoNotice: 'Development adapter: production verification requires real document review.' });
    }
    if (method === 'POST' && tail[1] === 'documents') {
      rateLimit(req, 'documents', 20);
      const type = String(body.type ?? '');
      const allowed = ['pan', 'gst', 'fssai', 'trade_licence', 'driving_licence', 'vehicle_registration', 'insurance', 'permit'];
      if (!allowed.includes(type)) bad('INVALID_DOCUMENT', 'Unknown document type');
      db().partnerDocuments ??= {}; db().partnerDocuments[user.id] ??= [];
      const doc = { id: makeId('doc'), type, number: String(body.number ?? '').slice(0, 40), status: 'pending', demo: true, uploadedAt: nowIso() };
      db().partnerDocuments[user.id].push(doc);
      audit(user.id, 'partner.document.uploaded', { type, demo: true });
      return ok(res, { document: doc, demoNotice: 'Stored as PENDING in this development build — a human or provider review is required in production.' }, 201);
    }

    // ---- inventory (grocery partner) ----
    if (tail[1] === 'inventory') {
      requireRole(user, 'grocery');
      const claims = myClaims(user).filter((c) => c.role === 'grocery');
      if (method === 'GET') {
        const items = claims.flatMap((c) => (catalogue.groceryStores.find((s) => s.id === c.listingId)?.products ?? []).map((p) => ({ ...p, stock: db().inventory[`${c.listingId}:${p.id}`] ?? 0 })));
        return send(res, 200, { items });
      }
      if (method === 'POST') {
        const { listingId, productId, delta } = body;
        const claim = claims.find((c) => c.listingId === listingId);
        if (!claim) bad('NOT_CLAIMED', 'You have not claimed this store', 403);
        const key = `${listingId}:${productId}`;
        const next = Math.max(0, (db().inventory[key] ?? 0) + Number(delta ?? 0));
        db().inventory[key] = next;
        audit(user.id, 'partner.inventory.adjusted', { key, delta, next });
        return ok(res, { key, stock: next });
      }
    }

    // ---- menu management (restaurant partner) ----
    if (tail[1] === 'menu') {
      requireRole(user, 'restaurant');
      db().menus ??= {};
      const claim = myClaims(user).find((c) => c.role === 'restaurant');
      if (!claim) bad('NOT_CLAIMED', 'You have not claimed a restaurant', 403);
      const rid = claim.listingId;
      db().menus[rid] ??= catalogue.restaurants.find((r) => r.id === rid)?.menu?.map((m) => ({ ...m })) ?? [];
      if (method === 'GET') return send(res, 200, { items: db().menus[rid] });
      if (method === 'POST') {
        const item = { id: makeId('mnu'), name: String(body.name ?? '').slice(0, 80), pricePaise: Math.max(0, Number(body.pricePaise ?? 0)), available: body.available !== false, customizations: Array.isArray(body.customizations) ? body.customizations : [] };
        if (!item.name || !item.pricePaise) bad('VALIDATION_FAILED', 'Menu item needs a name and price');
        db().menus[rid].push(item); audit(user.id, 'partner.menu.created', { rid, item: item.id });
        return ok(res, { item }, 201);
      }
      const idx = tail[2] ? db().menus[rid].findIndex((m) => m.id === tail[2]) : -1;
      if (tail[2] && idx === -1) bad('NOT_FOUND', 'Menu item not found', 404);
      if (method === 'PATCH' && tail[2]) {
        Object.assign(db().menus[rid][idx], Object.fromEntries(Object.entries(body).filter(([k]) => ['name', 'pricePaise', 'available'].includes(k))));
        return ok(res, { item: db().menus[rid][idx] });
      }
      if (method === 'DELETE' && tail[2]) { db().menus[rid].splice(idx, 1); return ok(res, { deleted: true }); }
    }

    // ---- rooms & availability (property partner) ----
    if (tail[1] === 'rooms' || tail[1] === 'availability') {
      requireRole(user, 'property');
      db().rooms ??= {};
      const claim = myClaims(user).find((c) => c.role === 'property');
      if (!claim) bad('NOT_CLAIMED', 'You have not claimed a property', 403);
      const pid = claim.listingId;
      if (tail[1] === 'rooms') {
        db().rooms[pid] ??= catalogue.properties.find((p) => p.id === pid)?.rooms?.map((r) => ({ ...r })) ?? [];
        if (method === 'GET') return send(res, 200, { items: db().rooms[pid] });
        if (method === 'POST') {
          const room = { id: makeId('room'), name: String(body.name ?? '').slice(0, 60), pricePerNightPaise: Math.max(0, Number(body.pricePerNightPaise ?? 0)), totalRooms: Math.max(0, Number(body.totalRooms ?? 1)) };
          if (!room.name) bad('VALIDATION_FAILED', 'Room needs a name');
          db().rooms[pid].push(room); return ok(res, { room }, 201);
        }
        if (method === 'PATCH' && tail[2]) {
          const room = db().rooms[pid].find((r) => r.id === tail[2]);
          if (!room) bad('NOT_FOUND', 'Room not found', 404);
          Object.assign(room, Object.fromEntries(Object.entries(body).filter(([k]) => ['name', 'pricePerNightPaise', 'totalRooms'].includes(k))));
          return ok(res, { room });
        }
      }
      if (method === 'POST' && tail[1] === 'availability') {
        const { roomId, date, delta } = body;
        if (!roomId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) bad('VALIDATION_FAILED', 'Provide roomId and a YYYY-MM-DD date');
        const key = `${roomId}:${date}`;
        const next = Math.max(0, (db().roomAvailability[key] ?? 0) + Number(delta ?? 0));
        db().roomAvailability[key] = next;
        audit(user.id, 'partner.availability.set', { key, next });
        return ok(res, { key, available: next });
      }
    }

    // ---- host-owned experiences/packages and their real schedules ----
    if (tail[1] === 'experience-slots' && method === 'DELETE' && tail[2]) {
      requireRole(user, 'tour_operator');
      const slot = (db().experienceSlots ?? []).find((item) => item.id === tail[2]);
      const offering = slot ? (db().tours[user.id] ?? []).find((tour) => tour.id === slot.offeringId) : null;
      if (!slot || !offering) bad('SLOT_NOT_FOUND', 'Slot not found in your offerings', 404);
      if (db().bookings.some((b) => (b.slotId ?? b.details?.slotId) === slot.id && ['requested', 'confirmed'].includes(b.status))) {
        bad('SLOT_HAS_BOOKINGS', 'Cancel or complete the active bookings before deactivating this slot', 409);
      }
      slot.active = false; slot.updatedAt = nowIso();
      audit(user.id, 'partner.experience.slot.deactivated', { slotId: slot.id, offeringId: offering.id });
      return ok(res, { deactivated: true });
    }
    if (tail[1] === 'tours') {
      requireRole(user, 'tour_operator');
      db().tours ??= {}; db().tours[user.id] ??= []; db().experienceSlots ??= [];
      const selected = tail[2] ? db().tours[user.id].find((tour) => tour.id === tail[2]) : null;
      if (tail[2] && tail[3] === 'slots') {
        if (!selected) bad('OFFERING_NOT_FOUND', 'Offering not found in your account', 404);
        if (method === 'GET') {
          const items = db().experienceSlots.filter((slot) => slot.offeringId === selected.id)
            .sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map((slot) => slotView(db(), slot, true));
          return send(res, 200, { items });
        }
        if (method === 'POST') {
          rateLimit(req, 'partner-slots', 60);
          const start = new Date(String(body.startAt ?? ''));
          const capacity = Number(body.capacity);
          if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) bad('INVALID_SLOT_TIME', 'Choose a future start time', 422);
          if (!Number.isInteger(capacity) || capacity < 1 || capacity > selected.capacity) bad('INVALID_SLOT_CAPACITY', `Capacity must be between 1 and ${selected.capacity}`, 422);
          const startsAt = start.toISOString();
          const endsAt = new Date(start.getTime() + Number(selected.durationHours) * 3_600_000).toISOString();
          let slot = db().experienceSlots.find((item) => item.offeringId === selected.id && item.startsAt === startsAt);
          if (slot && slotBooked(db(), slot.id) > capacity) bad('INVALID_SLOT_CAPACITY', 'Capacity cannot be lower than the guests already booked', 409);
          if (slot) Object.assign(slot, { endsAt, capacity, active: true, updatedAt: nowIso() });
          else {
            slot = { id: makeId('slt'), offeringId: selected.id, startsAt, endsAt, capacity, active: true, createdAt: nowIso(), updatedAt: nowIso() };
            db().experienceSlots.push(slot);
          }
          audit(user.id, 'partner.experience.slot.saved', { slotId: slot.id, offeringId: selected.id });
          return ok(res, { slot: slotView(db(), slot, true) }, 201);
        }
      }
      if (method === 'GET' && tail.length === 2) return send(res, 200, { items: db().tours[user.id] });
      if (method === 'POST' && tail.length === 2) {
        const t = {
          id: makeId('tur'), userId: user.id, kind: body.kind === 'package' ? 'package' : 'experience',
          name: String(body.name ?? '').trim().slice(0, 100), destinationId: String(body.destinationId ?? ''),
          description: String(body.description ?? '').trim().slice(0, 2000), meetingPoint: String(body.meetingPoint ?? '').trim().slice(0, 300),
          requirements: String(body.requirements ?? '').trim().slice(0, 1000),
          pricePaise: Number(body.pricePaise), durationHours: Number(body.durationHours), capacity: Number(body.capacity),
          active: body.active !== false, createdAt: nowIso(), updatedAt: nowIso(),
        };
        if (!['experience', 'package'].includes(body.kind ?? 'experience') || t.name.length < 2 || !catalogue.destinations.some((d) => d.id === t.destinationId)
          || !Number.isInteger(t.pricePaise) || t.pricePaise < 0 || !Number.isFinite(t.durationHours) || t.durationHours <= 0
          || !Number.isInteger(t.capacity) || t.capacity < 1) bad('VALIDATION_FAILED', 'Provide a valid name, destination, price, duration and capacity', 422);
        db().tours[user.id].push(t); audit(user.id, 'partner.experience.created', { offeringId: t.id, kind: t.kind });
        return ok(res, { tour: t }, 201);
      }
      if (method === 'PATCH' && tail[2] && tail.length === 3) {
        const t = selected;
        if (!t) bad('OFFERING_NOT_FOUND', 'Offering not found in your account', 404);
        const next = { ...t };
        Object.assign(next, Object.fromEntries(Object.entries(body).filter(([k]) => ['name', 'description', 'meetingPoint', 'requirements', 'pricePaise', 'durationHours', 'capacity', 'active'].includes(k))));
        next.name = String(next.name).trim().slice(0, 100); next.pricePaise = Number(next.pricePaise); next.durationHours = Number(next.durationHours); next.capacity = Number(next.capacity);
        const largestSlot = Math.max(0, ...db().experienceSlots.filter((slot) => slot.offeringId === t.id && slot.active !== false).map((slot) => Number(slot.capacity)));
        if (next.name.length < 2 || !Number.isInteger(next.pricePaise) || next.pricePaise < 0 || !Number.isFinite(next.durationHours) || next.durationHours <= 0
          || !Number.isInteger(next.capacity) || next.capacity < 1 || next.capacity < largestSlot) bad('VALIDATION_FAILED', 'Check the offering values; capacity cannot be lower than an active slot', 422);
        Object.assign(t, next, { updatedAt: nowIso() });
        audit(user.id, 'partner.experience.updated', { offeringId: t.id });
        return ok(res, { tour: t });
      }
    }

    // ---- earnings & settlements ----
    if (method === 'GET' && tail[1] === 'earnings') {
      return send(res, 200, earningsSummary(user.id));
    }
    if (tail[1] === 'settlements') {
      db().settlements ??= [];
      if (method === 'GET') return send(res, 200, { items: db().settlements.filter((s) => s.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
      if (method === 'POST' && tail[2] === 'request') {
        const e = earningsSummary(user.id);
        if (e.pendingPayoutPaise <= 0) bad('NOTHING_TO_SETTLE', 'No pending earnings to settle', 409);
        const s = { id: makeId('set'), userId: user.id, amountPaise: e.pendingPayoutPaise, status: 'requested', createdAt: nowIso() };
        db().settlements.push(s);
        audit(user.id, 'partner.settlement.requested', { amountPaise: s.amountPaise });
        return ok(res, { settlement: s }, 201);
      }
    }

    // ---- partner inbox (requests across all claimed services) ----
    if (method === 'GET' && tail[1] === 'inbox') {
      return send(res, 200, {
        bookings: db().bookings.filter((b) => ['requested', 'awaiting_payment', 'confirmed', 'assigned', 'in_progress'].includes(b.status) && bookingActor(db(), user, b)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        orders: db().orders.filter((o) => !['delivered', 'cancelled', 'refunded'].includes(o.status) && orderActor(db(), user, o)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        notifications: db().notifications.filter((n) => n.userId === user.id).slice(0, 50),
      });
    }
    return false;
  }

  function earningsSummary(userId) {
    // Earnings derive ONLY from captured payments on records that belong to this
    // partner: bookings/orders on their claimed listings, or jobs they accepted.
    // Partner share uses the captured amount and the service's actual commission rate.
    const user = db().users.find((u) => u.id === userId) ?? { roles: [] };
    const payments = db().payments.filter((p) => p.status === 'captured');
    const rows = [];
    for (const p of payments) {
      const b = p.bookingId ? db().bookings.find((x) => x.id === p.bookingId) : null;
      const o = p.orderId ? db().orders.find((x) => x.id === p.orderId) : null;
      const rec = b ?? o;
      if (!rec) continue;
      const actor = b ? bookingActor(db(), user, b) : orderActor(db(), user, o);
      if (!actor) continue;
      const rate = COMMISSION_RATES[rec.service] ?? 15;
      const commissionPaise = Math.round(p.amountPaise * rate / 100);
      rows.push({ ref: rec.reference, service: rec.service, grossPaise: p.amountPaise, commissionPaise, netPaise: p.amountPaise - commissionPaise, at: p.updatedAt });
    }
    const settled = (db().settlements ?? []).filter((s) => s.userId === userId && s.status === 'paid').reduce((s, x) => s + x.amountPaise, 0);
    const requested = (db().settlements ?? []).filter((s) => s.userId === userId && s.status === 'requested').reduce((s, x) => s + x.amountPaise, 0);
    const totalNet = rows.reduce((s, r) => s + r.netPaise, 0);
    return {
      commissionPercent: null, commissionLabel: 'Varies by service', rows,
      totalGrossPaise: rows.reduce((s, r) => s + r.grossPaise, 0),
      totalNetPaise: totalNet, settledPaise: settled,
      pendingPayoutPaise: Math.max(0, totalNet - settled - requested),
    };
  }

  return { handle };
}
