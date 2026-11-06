import { allTours } from './experiences.mjs';

export function verifiedClaim(db, user, listingId, roles) {
  const claim = (db.partners ?? []).find((item) => item.userId === user.id && item.listingId === listingId && roles.includes(item.role));
  if (!claim) return false;
  const claimVerified = claim.state === 'verified' || (!claim.state && claim.demo === true);
  if (user.partnerApproval) return user.partnerApproval === 'verified' && claimVerified;
  return claimVerified;
}

export function canManageStore(db, user, store) {
  return Boolean(store && (store.ownerUserId === user.id || verifiedClaim(db, user, store.id, ['grocery', 'seller'])));
}

export function bookingActor(db, user, booking) {
  const driver = db.drivers.find((item) => item.userId === user.id);
  if (['cab', 'shared_taxi', 'parcel'].includes(booking.service) && driver
    && db.jobs.some((job) => job.driverId === driver.id && job.bookingId === booking.id && ['accepted', 'in_progress', 'completed'].includes(job.status))) return 'driver';
  if (['hotel', 'homestay', 'lodge', 'guesthouse'].includes(booking.service)
    && verifiedClaim(db, user, booking.listingId, ['property'])) return 'partner';
  if (['experience', 'package'].includes(booking.service)) {
    const offering = allTours(db).find((tour) => tour.id === booking.listingId);
    if (booking.hostId === user.id || offering?.userId === user.id) return 'partner';
  }
  return null;
}

export function orderActor(db, user, order) {
  const driver = db.drivers.find((item) => item.userId === user.id);
  const storeManaged = canManageStore(db, user, (db.stores ?? []).find((store) => store.id === order.listingId));
  const claimed = verifiedClaim(db, user, order.listingId, order.service === 'food' ? ['restaurant'] : ['grocery', 'seller']);
  if (claimed || (order.service === 'marketplace' && storeManaged)) return 'partner';
  if (driver && db.jobs.some((job) => job.driverId === driver.id && job.orderId === order.id && ['accepted', 'in_progress', 'completed'].includes(job.status))) return 'driver';
  return null;
}
