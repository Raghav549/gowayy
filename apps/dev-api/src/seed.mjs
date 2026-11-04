/**
 * Development seed data for the GOWAYY reference backend.
 *
 * Everything created here is explicitly development/testing data. Demo accounts
 * are marked `demo: true`, are never seeded when GOWAYY_ENV=production, and use
 * the same scrypt hash + session path as real accounts. Credentials are
 * documented in docs/SETUP.md — no privileged credential is compiled into any
 * client bundle.
 */
import { catalogue } from '@gowayy/catalog';

export const DEMO_ACCOUNTS = [
  {
    email: 'customer@gowayy.app', password: 'Gw@yCustomer2026',
    firstName: 'Ananya', lastName: 'Rai', roles: ['customer'],
    label: 'Customer demo account',
  },
  {
    email: 'partner@gowayy.app', password: 'Gw@yPartner2026',
    firstName: 'Tenzin', lastName: 'Sherpa',
    roles: ['customer', 'restaurant', 'grocery', 'property', 'tour_operator', 'driver'],
    label: 'Partner demo account (restaurant, grocery, property, tours, driver)',
  },
  {
    email: 'admin@gowayy.app', password: 'Gw@yAdmin2026',
    firstName: 'GOWAYY', lastName: 'Admin', roles: ['admin'],
    label: 'Admin demo account',
  },
];

const CATEGORY_SEED = [
  ['Grocery', 'grocery'], ['Fruits & vegetables', 'fruits-vegetables'], ['Dairy & eggs', 'dairy-eggs'],
  ['Snacks & beverages', 'snacks-beverages'], ['Travel essentials', 'travel-essentials'],
  ['Local Himalayan products', 'local-himalayan'], ['Electronics', 'electronics'], ['Home & living', 'home-living'],
];

const BANNER_SEED = [
  { title: 'Mirik in bloom', subtitle: 'Lakeside walks, tea gardens and shared taxis from Siliguri', href: '/destinations/mirik', destinationId: 'dst_mirik', order: 1 },
  { title: 'Darjeeling sunrise', subtitle: 'Tiger Hill, heritage toy train and warm homestays', href: '/destinations/darjeeling', destinationId: 'dst_darjeeling', order: 2 },
  { title: 'Himalayan pantry', subtitle: 'Locally packed tea, honey and travel essentials from hill stores', href: '/categories', destinationId: null, order: 3 },
  { title: 'Kalimpong weekends', subtitle: 'Monasteries, flower nurseries and homestay stays', href: '/destinations/kalimpong', destinationId: 'dst_kalimpong', order: 4 },
];

function imageFor(slug) {
  const dest = catalogue.destinations.find((d) => d.slug === slug);
  const img = dest?.images.find((i) => i.status === 'verified');
  return img?.thumbPath ?? img?.assetPath ?? null;
}

function bannerImage(destinationId) {
  const dest = catalogue.destinations.find((d) => d.id === destinationId);
  const img = dest?.images.find((i) => i.status === 'verified');
  return img ? { assetPath: img.assetPath, thumbPath: img.thumbPath, alt: img.alt } : null;
}

export function seedDemoData(db, helpers) {
  const { hashPassword, makeId, nowIso } = helpers;
  const at = nowIso();

  // ---- demo accounts (development only) ----
  for (const account of DEMO_ACCOUNTS) {
    if (db.users.some((u) => u.email === account.email)) continue;
    const user = {
      id: makeId('usr'), firstName: account.firstName, lastName: account.lastName,
      email: account.email, passwordHash: hashPassword(account.password),
      roles: [...account.roles], createdAt: at, deletedAt: null, demo: true, accountStatus: 'active',
    };
    db.users.push(user);
    if (account.roles.includes('admin')) db.admins ??= [];
    if (account.roles.includes('admin')) db.admins.push({ userId: user.id, level: 'super', createdAt: at });
  }
  const partnerUser = db.users.find((u) => u.email === 'partner@gowayy.app');
  const customerUser = db.users.find((u) => u.email === 'customer@gowayy.app');

  // ---- categories ----
  db.categories ??= [];
  for (const [name, slug] of CATEGORY_SEED) {
    if (db.categories.some((c) => c.slug === slug)) continue;
    db.categories.push({
      id: makeId('cat'), name, slug, ownerUserId: null, active: true, createdAt: at,
      image: { status: 'unavailable', alt: `${name} category image not supplied yet` },
    });
  }
  const categoryId = (slug) => db.categories.find((c) => c.slug === slug)?.id ?? null;

  // ---- stores (seeded from the read-only catalogue) ----
  db.stores ??= [];
  for (const store of catalogue.groceryStores) {
    if (db.stores.some((s) => s.id === store.id)) continue;
    const isPartnerOwned = store.id === 'grc_1' && partnerUser;
    db.stores.push({
      id: store.id, name: store.name, categoryId: categoryId('grocery'), categoryName: 'Grocery',
      ownerUserId: isPartnerOwned ? partnerUser.id : null, destinationId: store.destinationId,
      description: store.description, coords: store.coords,
      image: store.image, deliveryCoverageKm: store.deliveryCoverageKm, slots: store.slots,
      address: `${store.name}, ${catalogue.destinations.find((d) => d.id === store.destinationId)?.name ?? 'Darjeeling'}`,
      phone: '+91 90000 00000', openingHours: '08:00–21:00', openingHoursVerified: false,
      status: 'active', verified: true, demo: true, createdAt: at,
    });
  }
  if (!db.stores.some((s) => s.id === 'str_himal_bazaar')) {
    db.stores.push({
      id: 'str_himal_bazaar', name: 'Himalaya Bazaar', categoryId: categoryId('local-himalayan'),
      categoryName: 'Local Himalayan products', ownerUserId: partnerUser?.id ?? null,
      destinationId: 'dst_darjeeling', description: 'Local tea, honey, woollens and travel essentials packed by hill families. Development demo store.',
      coords: { lat: 27.041, lng: 88.266 }, image: { status: 'unavailable', alt: 'Himalaya Bazaar storefront photograph not supplied' },
      deliveryCoverageKm: 6, slots: ['10:00–13:00', '16:00–19:00'], address: 'Chowk Bazaar, Darjeeling',
      phone: '+91 90000 00001', openingHours: '09:00–20:00', openingHoursVerified: false,
      status: 'active', verified: true, demo: true, createdAt: at,
    });
  }

  // ---- marketplace products become server-managed records ----
  db.catalogProducts ??= [];
  for (const product of catalogue.marketplaceProducts) {
    if (db.catalogProducts.some((p) => p.id === product.id)) continue;
    db.catalogProducts.push({ ...product, active: true, published: true, featured: product.category === 'Electronics', storeId: product.storeId ?? 'grc_1', tags: [], createdAt: at, demo: true });
  }
  // A few demo catalogue items for the partner store so the dynamic category UI is populated.
  if (partnerUser) {
    const demoProducts = [
      { name: 'Darjeeling first-flush tea (100 g)', categorySlug: 'local-himalayan', pricePaise: 42000, mrpPaise: 52000, stock: 24, tags: ['tea', 'local'] },
      { name: 'Himalayan wildflower honey (250 g)', categorySlug: 'local-himalayan', pricePaise: 38000, mrpPaise: 45000, stock: 18, tags: ['honey'] },
      { name: 'Hand-knitted woollen socks', categorySlug: 'travel-essentials', pricePaise: 29900, mrpPaise: 39900, stock: 9, tags: ['wool', 'winter'] },
    ];
    for (const p of demoProducts) {
      const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (db.catalogProducts.some((x) => x.slug === slug)) continue;
      db.catalogProducts.push({
        id: makeId('prd'), slug, storeId: 'str_himal_bazaar', brand: 'Himalaya Bazaar',
        name: p.name, category: db.categories.find((c) => c.slug === p.categorySlug)?.name ?? 'Local Himalayan products',
        categoryId: categoryId(p.categorySlug), dataClass: 'demo-listing',
        highlights: ['Packed in the Darjeeling hills', 'Partner-created demo listing'],
        description: `${p.name} — a development listing created through the partner catalogue so category and product management can be tested end to end.`,
        specifications: [{ label: 'Pack size', value: p.name.match(/\(([^)]+)\)/)?.[1] ?? 'Standard' }],
        inTheBox: [p.name], faq: [], images: [{ status: 'unavailable', alt: `Product photograph for ${p.name} not supplied` }],
        variants: [{ id: 'var_std', label: 'Standard', pricePaise: p.pricePaise, mrpPaise: p.mrpPaise, stock: p.stock }],
        protectionPlans: [], relatedProductIds: [], deliveryNote: 'Delivered from the Darjeeling store within its coverage area.',
        active: true, published: true, featured: false, tags: p.tags, createdAt: at, demo: true,
      });
    }
  }

  // Partner claims + driver profile for the demo partner.
  if (partnerUser) {
    db.partners ??= [];
    for (const claim of [
      { role: 'restaurant', listingId: 'rst_1' }, { role: 'grocery', listingId: 'grc_1' },
      { role: 'property', listingId: 'prp_1' }, { role: 'tour_operator', listingId: null },
    ]) {
      if (!db.partners.some((p) => p.userId === partnerUser.id && p.role === claim.role)) {
        db.partners.push({ userId: partnerUser.id, role: claim.role, listingId: claim.listingId, claimedAt: at, demo: true });
      }
    }
    if (!db.drivers.some((d) => d.userId === partnerUser.id)) {
      db.drivers.push({
        id: makeId('drv'), userId: partnerUser.id, name: `${partnerUser.firstName} ${partnerUser.lastName}`,
        phone: '+91 90000 00002', vehicleClass: 'sedan', services: ['cab', 'food', 'grocery'],
        verification: 'verified', online: false, activeJobId: null,
        documents: { licence: 'DEMO-DL-0001', registration: 'DEMO-WB-0001', insurance: 'DEMO-INS-0001' },
        demoVerification: true, createdAt: at,
      });
    }
    db.partnerProfiles ??= {};
    db.partnerProfiles[partnerUser.id] ??= {
      userId: partnerUser.id, businessName: 'Himalaya Bazaar Group', phone: '+91 90000 00002',
      address: 'Chowk Bazaar, Darjeeling', description: 'Demo partner business owning a restaurant, grocery store and homestay.',
      createdAt: at, updatedAt: at,
    };
  }

  // ---- banners (admin-managed, rendered by the customer app) ----
  db.banners ??= [];
  for (const banner of BANNER_SEED) {
    if (db.banners.some((b) => b.title === banner.title)) continue;
    db.banners.push({
      id: makeId('bnr'), title: banner.title, subtitle: banner.subtitle, href: banner.href,
      destinationId: banner.destinationId, image: bannerImage(banner.destinationId),
      order: banner.order, active: true, startAt: null, endAt: null, createdAt: at, updatedAt: at,
    });
  }

  // ---- offers + coupons ----
  db.offers ??= [];
  if (!db.offers.length) {
    const electronics = db.categories.find((c) => c.slug === 'electronics');
    db.offers.push({
      id: makeId('off'), scope: 'category', categoryIds: electronics ? [electronics.id] : [],
      productIds: [], title: '10% off electronics', code: null, kind: 'percent', value: 10,
      maxDiscountPaise: 50000, minOrderPaise: 50000, startAt: null, endAt: null, usageLimit: null,
      usedCount: 0, active: true, ownerUserId: null, createdAt: at,
    });
  }
  db.coupons ??= [];
  if (!db.coupons.some((c) => c.code === 'TEA10')) {
    db.coupons.push({ code: 'TEA10', kind: 'percent', valuePercent: 10, maxPaise: 15000, minSubtotalPaise: 30000, active: true, ownerUserId: partnerUser?.id ?? null, createdAt: at });
  }

  // ---- platform settings + service availability ----
  db.settings ??= {};
  db.settings.services ??= {
    cab: true, shared_taxi: true, hotel: true, homestay: true, food: true, grocery: true,
    tourism: true, experience: true, package: true, marketplace: true, parcel: true,
  };
  db.settings.appConfig ??= {
    supportPhone: '+91 90000 00000', supportEmail: 'support@gowayy.app',
    maintenanceMode: false, updatedAt: at,
  };

  // ---- a couple of welcome notifications for the demo customer ----
  if (customerUser && !db.notifications.some((n) => n.userId === customerUser.id)) {
    db.notifications.push({
      id: makeId('ntf'), userId: customerUser.id, type: 'welcome', title: 'Welcome to GOWAYY',
      body: 'Your account is ready. Plan a journey, book a stay and order from local hill stores.',
      dedupeKey: `welcome:${customerUser.id}`, createdAt: at,
    });
  }
  return db;
}

export function seedCatalogCollections(db) {
  // Images for destinations are already verified in the catalogue; keep admin
  // featured flags in the database instead of editing catalogue JSON at runtime.
  db.featuredDestinations ??= ['dst_darjeeling', 'dst_mirik', 'dst_kalimpong'];
  return db;
}
