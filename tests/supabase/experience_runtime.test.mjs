import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, createUser, asUser } from './harness.mjs';

test('host slots, quotes and experience bookings enforce real capacity and ownership', async () => {
  const context = await createDatabase({ withSeed: true });
  const { db } = context;
  try {
    assert.deepEqual(context.errors, []);
    const host = await createUser(db, 'host@example.com', 'Maya', 'Rai');
    const guest = await createUser(db, 'guest@example.com', 'Asha', 'Rai');
    const other = await createUser(db, 'other-guest@example.com');
    await asUser(db, host);
    await db.query(`SELECT rpc_claim_partner('tour_operator', '')`);
    const created = (await db.query(`SELECT rpc_partner_tour_add($1, $2::jsonb) value`, [host, JSON.stringify({
      name: 'Village tea walk', destinationId: 'dst_darjeeling', description: 'A host-led walk through tea country.',
      meetingPoint: 'The host will share the exact meeting point.', requirements: 'Comfortable walking shoes',
      pricePaise: 50000, durationHours: 1.5, capacity: 3,
    })])).rows[0].value.tour;
    const startAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const slot = (await db.query(`SELECT rpc_partner_experience_slot_add($1::jsonb) value`, [JSON.stringify({
      offeringId: created.id, startAt, capacity: 3,
    })])).rows[0].value.slot;
    const date = (await db.query(`SELECT (starts_at AT TIME ZONE 'Asia/Kolkata')::date::text date FROM experience_slots WHERE id = $1`, [slot.id])).rows[0].date;
    const offerings = (await db.query(`SELECT rpc_experience_offerings('dst_darjeeling') value`)).rows[0].value;
    assert.equal(offerings.items.length, 1);
    assert.equal(offerings.items[0].host.name, 'Maya Rai');
    const slots = (await db.query(`SELECT rpc_experience_slots($1, $2::date) value`, [created.id, date])).rows[0].value;
    assert.equal(slots.items[0].available, 3);
    const quote = (await db.query(`SELECT rpc_experience_quote($1, 2) value`, [slot.id])).rows[0].value;
    assert.equal(quote.price.totalPaise, 105000);
    assert.equal(quote.service, 'experience');
    assert.equal(quote.offering.kind, 'experience');
    await asUser(db, other);
    await assert.rejects(() => db.query(`SELECT rpc_partner_experience_slot_add($1::jsonb)`, [JSON.stringify({ offeringId: created.id, startAt, capacity: 1 })]), /OFFERING_NOT_FOUND/);
    await asUser(db, guest);
    const input = { service: 'experience', offeringId: created.id, slotId: slot.id, travellers: 2, answers: { experienceLevel: 'first-time' } };
    const booking = (await db.query(`SELECT rpc_create_booking('experience', $1::jsonb, 'experience_booking_1') value`, [JSON.stringify(input)])).rows[0].value;
    assert.equal(booking.guests, 2);
    assert.equal(booking.slot_id, slot.id);
    assert.equal(booking.details.answers.experienceLevel, 'first-time');
    await asUser(db, host);
    assert.equal((await db.query(`SELECT count(*)::int count FROM customer_bookings WHERE id = $1`, [booking.id])).rows[0].count, 1);
    const hostInbox = (await db.query(`SELECT rpc_partner_inbox($1) value`, [host])).rows[0].value;
    assert.ok(hostInbox.bookings.some((item) => item.id === booking.id));
    await asUser(db, other);
    const otherInbox = (await db.query(`SELECT rpc_partner_inbox($1) value`, [other])).rows[0].value;
    assert.ok(!otherInbox.bookings.some((item) => item.id === booking.id));
    await assert.rejects(() => db.query(`SELECT rpc_transition_booking($1, 'confirmed')`, [booking.id]), /FORBIDDEN/);
    await asUser(db, host);
    const confirmed = (await db.query(`SELECT rpc_transition_booking($1, 'confirmed') value`, [booking.id])).rows[0].value;
    assert.equal(confirmed.status, 'confirmed');
    await asUser(db, guest);
    const replay = (await db.query(`SELECT rpc_create_booking('experience', $1::jsonb, 'experience_booking_1') value`, [JSON.stringify(input)])).rows[0].value;
    assert.equal(replay.id, booking.id);
    await assert.rejects(() => db.query(`SELECT rpc_create_booking('experience', $1::jsonb, 'experience_booking_2')`, [JSON.stringify(input)]), /BOOKING_ALREADY_EXISTS/);
    await asUser(db, host);
    await assert.rejects(() => db.query(`SELECT rpc_partner_experience_slot_add($1::jsonb)`, [JSON.stringify({ offeringId: created.id, startAt, capacity: 1 })]), /INVALID_SLOT_CAPACITY/);
    await asUser(db, other);
    await assert.rejects(() => db.query(`SELECT rpc_experience_quote($1, 2)`, [slot.id]), /SLOT_UNAVAILABLE/);
    await asUser(db, guest);
    await db.query(`SELECT rpc_cancel_booking($1, 'Plans changed')`, [booking.id]);
    await asUser(db, other);
    const availableAgain = (await db.query(`SELECT rpc_experience_quote($1, 2) value`, [slot.id])).rows[0].value;
    assert.equal(availableAgain.slot.available, 3);
    assert.ok((await db.query(`SELECT count(*)::int count FROM notifications WHERE user_id = $1 AND type = 'booking.experience.requested'`, [host])).rows[0].count >= 1);

    await asUser(db, host);
    const packageTour = (await db.query(`SELECT rpc_partner_tour_add($1, $2::jsonb) value`, [host, JSON.stringify({
      kind: 'package', name: 'Hosted city package', destinationId: 'dst_darjeeling', pricePaise: 30000, durationHours: 3, capacity: 2,
    })])).rows[0].value.tour;
    const packageSlot = (await db.query(`SELECT rpc_partner_experience_slot_add($1::jsonb) value`, [JSON.stringify({
      offeringId: packageTour.id, startAt: new Date(Date.now() + 4 * 86_400_000).toISOString(), capacity: 2,
    })])).rows[0].value.slot;
    await asUser(db, other);
    const packageQuote = (await db.query(`SELECT rpc_experience_quote($1, 1) value`, [packageSlot.id])).rows[0].value;
    assert.equal(packageQuote.service, 'package');
    const packageBooking = (await db.query(`SELECT rpc_create_booking('package', $1::jsonb, 'package_booking_1') value`, [JSON.stringify({
      service: 'package', offeringId: packageTour.id, slotId: packageSlot.id, travellers: 1, answers: {},
    })])).rows[0].value;
    assert.equal(packageBooking.service, 'package');
    assert.equal(packageBooking.slot_id, packageSlot.id);
    assert.equal(packageBooking.total_paise, 31500);
    const payment = (await db.query(`SELECT rpc_init_payment($1::jsonb) value`, [JSON.stringify({
      bookingId: packageBooking.id, method: 'upi', amountPaise: packageBooking.total_paise, idempotencyKey: 'package_payment_1',
    })])).rows[0].value;
    const captured = (await db.query(`SELECT rpc_capture_sandbox_payment($1) value`, [payment.id])).rows[0].value;
    assert.equal(captured.payment.status, 'captured');
    await asUser(db, host);
    const earnings = (await db.query(`SELECT rpc_partner_earnings($1) value`, [host])).rows[0].value;
    assert.equal(earnings.totalGrossPaise, 31500);
    assert.ok(earnings.totalNetPaise > 0 && earnings.totalNetPaise < 31500);
    assert.ok(earnings.rows.some((row) => row.ref === packageBooking.reference && row.service === 'package'));
    const payout = (await db.query(`SELECT rpc_settlement_request($1) value`, [host])).rows[0].value.settlement;
    assert.equal(payout.amountPaise, earnings.pendingPayoutPaise);
    assert.equal(payout.status, 'requested');
    await assert.rejects(() => db.query(`SELECT rpc_settlement_request($1)`, [host]), /NOTHING_TO_SETTLE/);
    await asUser(db, other);
    const refund = (await db.query(`SELECT rpc_refund_payment($1, true, 'Package cancelled') value`, [payment.id])).rows[0].value;
    await db.query(`SELECT rpc_provider_refund_update($1, 'refund_package', 'processed', '{}')`, [refund.refund.id]);
    await db.query(`SELECT rpc_provider_refund_update($1, 'refund_package', 'processed', '{}')`, [refund.refund.id]);
    await asUser(db, host);
    const afterRefund = (await db.query(`SELECT rpc_partner_earnings($1) value`, [host])).rows[0].value;
    assert.equal(afterRefund.totalNetPaise, 0);
    assert.equal(afterRefund.pendingPayoutPaise, 0);
    assert.equal(afterRefund.requestedPayoutPaise, 0);
    const payouts = (await db.query(`SELECT rpc_partner_settlements() value`)).rows[0].value;
    assert.equal(payouts.items[0].status, 'cancelled');
    assert.equal((await db.query(`SELECT count(*)::int count FROM settlements WHERE payment_id = $1`, [payment.id])).rows[0].count, 2, 'refund replay must not duplicate the reversing entry');
  } finally {
    await context.close();
  }
});
