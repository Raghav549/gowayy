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
  {
    // One shared development identity for all three applications. The role
    // determines which experience each app exposes; it never grants admin
    // powers to a customer-only app because the server checks roles per route.
    email: 'demo@gowayy.app', password: 'Gw@yDemo2026',
    firstName: 'GOWAYY', lastName: 'Demo',
    roles: ['customer', 'restaurant', 'grocery', 'property', 'tour_operator', 'driver', 'admin'],
    label: 'SHARED DEMO / TEST ONLY account (customer + partner + admin apps)',
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
  // Hard guard: the shared demo identity must never exist in production.
  if (process.env.GOWAYY_ENV === 'production' || process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo accounts outside development/staging (GOWAYY_ENV=production).');
  }
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
  const sharedDemoUser = db.users.find((u) => u.email === 'demo@gowayy.app');
  for (const u of db.users.filter((x) => x.demo && x.email === 'demo@gowayy.app')) {
    db.admins ??= [];
    if (!db.admins.some((a) => a.userId === u.id)) db.admins.push({ userId: u.id, level: 'super', createdAt: at });
  }

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
      logo: null, banner: null,
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
      logo: null, banner: null,
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
  for (const owner of [partnerUser, sharedDemoUser].filter(Boolean)) {
    db.partners ??= [];
    for (const claim of [
      { role: 'restaurant', listingId: 'rst_1' }, { role: 'grocery', listingId: 'grc_1' },
      { role: 'property', listingId: 'prp_1' }, { role: 'tour_operator', listingId: null },
    ]) {
      if (!db.partners.some((p) => p.userId === owner.id && p.role === claim.role)) {
        db.partners.push({ userId: owner.id, role: claim.role, listingId: claim.listingId, claimedAt: at, demo: true });
      }
    }
    if (!db.drivers.some((d) => d.userId === owner.id)) {
      db.drivers.push({
        id: makeId('drv'), userId: owner.id, name: `${owner.firstName} ${owner.lastName}`,
        phone: '+91 90000 00002', vehicleClass: 'sedan', services: ['cab', 'food', 'grocery'],
        verification: 'verified', online: false, activeJobId: null,
        documents: { licence: 'DEMO-DL-0001', registration: 'DEMO-WB-0001', insurance: 'DEMO-INS-0001' },
        demoVerification: true, createdAt: at,
      });
    }
    db.partnerProfiles ??= {};
    db.partnerProfiles[owner.id] ??= {
      userId: owner.id, businessName: 'Himalaya Bazaar Group', phone: '+91 90000 00002',
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

  // ---- admin-managed promotional posters (food + grocery carousels) ----
  db.posters ??= [];
  const POSTER_SEED = [
    { slug: 'grocery-1', kind: 'grocery', title: 'Fresh this week', subtitle: 'Farm vegetables and fruit', cta: 'Shop fresh', href: '/groceries', order: 1 },
    { slug: 'grocery-2', kind: 'grocery', title: 'Hill pantry', subtitle: 'Tea, honey and essentials over ₹499', cta: 'Use code TEA10', href: '/groceries', order: 2 },
    { slug: 'grocery-3', kind: 'grocery', title: 'Daily needs', subtitle: 'Snacks, dairy and breakfast staples', cta: 'Shop all', href: '/categories', order: 3 },
    { slug: 'food-1', kind: 'food', title: 'Local kitchens', subtitle: 'Warm bowls and hill favourites', cta: 'Order food', href: '/food', order: 1 },
    { slug: 'food-2', kind: 'food', title: 'Tea and bakery', subtitle: 'Free delivery on orders above ₹299', cta: 'See menu', href: '/food', order: 2 },
    { slug: 'food-3', kind: 'food', title: 'Weekend treats', subtitle: 'Burger, fries and a cold drink', cta: 'Order now', href: '/food', order: 3 },
  ];
  for (const poster of POSTER_SEED) {
    if (db.posters.some((p) => p.slug === poster.slug)) continue;
    db.posters.push({
      id: makeId('pst'), slug: poster.slug, kind: poster.kind, title: poster.title,
      subtitle: poster.subtitle, cta: poster.cta, href: poster.href, order: poster.order,
      image: { status: 'verified', path: `/images/posters/${poster.slug}.svg`, alt: `${poster.title} — ${poster.subtitle}`, providedBy: 'admin' },
      active: true, startAt: null, endAt: null, createdAt: at, updatedAt: at, demo: true,
    });
  }

  // ---- service areas: separate food and grocery pincode coverage ----
  db.serviceAreas ??= [];
  const AREA_SEED = [
    { city: 'Darjeeling', state: 'West Bengal', food: ['734101', '734102', '734104'], grocery: ['734101', '734102', '734103', '734104'] },
    { city: 'Siliguri', state: 'West Bengal', food: ['734001', '734002', '734005', '734006'], grocery: ['734001', '734002', '734003', '734004', '734005', '734006'] },
    { city: 'Kurseong', state: 'West Bengal', food: ['734203'], grocery: ['734203', '734204'] },
    { city: 'Mirik', state: 'West Bengal', food: ['734214'], grocery: ['734214'] },
    { city: 'Kalimpong', state: 'West Bengal', food: ['734301'], grocery: ['734301', '734302'] },
  ];
  for (const area of AREA_SEED) {
    if (db.serviceAreas.some((a) => a.city === area.city)) continue;
    db.serviceAreas.push({
      id: makeId('sva'), city: area.city, state: area.state, active: true,
      foodPincodes: area.food, groceryPincodes: area.grocery,
      deliveryNote: 'Delivery windows depend on the store and weather; the checkout validates your PIN code.',
      createdAt: at, updatedAt: at,
    });
  }

  // ---- destinations become editable content records (seeded from the catalogue) ----
  db.destinations ??= [];
  for (const [index, d] of catalogue.destinations.entries()) {
    if (db.destinations.some((x) => x.slug === d.slug)) continue;
    const images = (d.images ?? []).filter((i) => i.status === 'verified').map((i, n) => ({
      id: `dimg_${d.slug}_${n + 1}`, status: 'verified', path: `/${i.assetPath}`,
      thumbPath: i.thumbPath ? `/${i.thumbPath}` : `/${i.assetPath}`,
      alt: i.alt, credit: i.credit, license: i.license, sourceUrl: i.sourceUrl, primary: n === 0,
    }));
    db.destinations.push({
      id: d.id, slug: d.slug, name: d.name, region: d.region ?? 'Darjeeling Himalaya',
      summary: d.summary ?? d.tagline ?? d.description?.slice(0, 180) ?? '',
      description: d.description ?? '', coords: d.coords ?? null,
      images, active: true, featured: ['dst_darjeeling', 'dst_mirik', 'dst_kalimpong'].includes(d.id),
      order: index + 1, source: 'catalogue', createdAt: at, updatedAt: at,
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

const PRODUCT_PHOTOS = [
  [/power\s*bank|powerbank/i, '/images/products/power-bank.webp', 'Dark grey power bank with a USB-C cable'],
  [/cable/i, '/images/products/cable.webp', 'Braided USB-C cable'],
  [/charger/i, '/images/products/charger.webp', 'Compact white wall charger'],
  [/buds|earbud/i, '/images/products/earbuds.webp', 'Wireless earbuds in a charging case'],
  [/honey/i, '/images/products/honey-jar.webp', 'Glass jar of wildflower honey'],
  [/tea/i, '/images/products/tea-tin.webp', 'Tea tin with loose leaf tea'],
  [/sock|wool/i, '/images/products/socks.webp', 'Hand-knitted woollen socks'],
];

const CATEGORY_ART = {
  grocery: '/images/categories/groceries.webp', 'fruits-vegetables': '/images/categories/groceries.webp',
  'dairy-eggs': '/images/categories/groceries.webp', 'snacks-beverages': '/images/categories/food.webp',
  'travel-essentials': '/images/categories/packages.webp', 'local-himalayan': '/images/categories/shop.webp',
  electronics: '/images/categories/shop.webp', 'home-living': '/images/categories/shop.webp',
};

/**
 * Idempotent content repair: attaches verified demo product photography to
 * catalogue products that have no image, and gives demo categories a visual.
 * Existing uploaded/partner images are never overwritten.
 */
function seedContentImages(db) {
  for (const product of db.catalogProducts ?? []) {
    const hasImage = (product.images ?? []).some((i) => i.status !== 'unavailable' && (i.path || i.assetPath));
    if (hasImage) continue;
    const match = PRODUCT_PHOTOS.find(([pattern]) => pattern.test(product.name));
    if (!match) continue;
    product.images = [{ status: 'verified', path: match[1], thumbPath: match[1], alt: match[2], license: 'Demo product photograph (development seed)', providedBy: 'demo' }];
  }
  for (const category of db.categories ?? []) {
    if (category.image?.status !== 'unavailable') continue;
    const path = CATEGORY_ART[category.slug];
    if (path) category.image = { status: 'verified', path, alt: `${category.name} category artwork`, providedBy: 'demo' };
  }
  for (const store of db.stores ?? []) {
    if (store.id === 'str_himal_bazaar' && !store.banner) {
      store.banner = {
        status: 'verified', path: '/images/destinations/darjeeling/ropeway-tea-gardens-card.webp',
        alt: 'Tea gardens near Darjeeling', credit: 'Wikimedia Commons contributors', license: 'CC BY-SA 4.0',
        providedBy: 'demo',
      };
    }
  }
}

export function seedCatalogCollections(db) {
  seedContentImages(db);
  // Images for destinations are already verified in the catalogue; keep admin
  // featured flags in the database instead of editing catalogue JSON at runtime.
  db.featuredDestinations ??= ['dst_darjeeling', 'dst_mirik', 'dst_kalimpong'];
  return db;
}
