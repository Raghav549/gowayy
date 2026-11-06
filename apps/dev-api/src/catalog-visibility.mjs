export function isPublicStore(store) {
  return Boolean(store && !store.deletedAt && store.status === 'active' && store.verified !== false);
}

export function isPublicProduct(db, product) {
  if (!product || product.active === false || product.published === false || product.deletedAt) return false;
  return isPublicStore((db.stores ?? []).find((store) => store.id === product.storeId));
}

export function isPublicOffer(db, offer) {
  if (!offer?.active) return false;
  if (offer.scope === 'platform') return true;
  if (offer.scope === 'store') return isPublicStore((db.stores ?? []).find((store) => store.id === offer.storeId));
  const products = (db.catalogProducts ?? []).filter((product) => isPublicProduct(db, product));
  if (offer.scope === 'product') return (offer.productIds ?? []).some((id) => products.some((product) => product.id === id));
  if (offer.scope === 'category') return (offer.categoryIds ?? []).some((id) => products.some((product) => product.categoryId === id));
  return false;
}
