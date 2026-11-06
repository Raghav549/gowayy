import { nowIso } from '@gowayy/shared-utils';

export function singleCartStoreId(items) {
  const ids = new Set(items.map((item) => item.storeId).filter(Boolean));
  return ids.size === 1 ? [...ids][0] : null;
}

export function cartCoupon(db, code, items, at = nowIso()) {
  if (!String(code ?? '').trim()) return { coupon: null, offer: null };
  const coupon = (db.coupons ?? []).find((entry) => entry.code === String(code).trim().toUpperCase() && entry.active);
  if (!coupon) return { error: 'INVALID_COUPON' };
  if (!coupon.offerId) return { coupon, offer: null };
  const offer = (db.offers ?? []).find((entry) => entry.id === coupon.offerId);
  if (!offer?.active || (offer.startAt && offer.startAt > at) || (offer.endAt && offer.endAt < at)
    || (offer.usageLimit && (offer.usedCount ?? 0) >= offer.usageLimit)) return { error: 'INVALID_COUPON' };
  const eligible = items.length > 0 && items.every((item) => {
    if (offer.scope === 'platform') return true;
    if (offer.scope === 'store') return item.storeId === offer.storeId;
    if (offer.scope === 'product') return (offer.productIds ?? []).includes(item.id);
    if (offer.scope === 'category') return (offer.categoryIds ?? []).includes(item.categoryId);
    return false;
  });
  if (!eligible) return { error: 'COUPON_NOT_APPLICABLE' };
  return { coupon, offer };
}
