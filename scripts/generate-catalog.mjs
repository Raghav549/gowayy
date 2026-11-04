/**
 * Generates the data-driven catalogue JSON. Edit the source tables here (or the
 * resulting JSON directly) to add destinations/listings — no application code changes.
 * Run: node scripts/generate-catalog.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'packages/catalog/src/data');
mkdirSync(out, { recursive: true });
const write = (name, data) => { writeFileSync(join(out, name), `${JSON.stringify(data, null, 2)}\n`); console.log('wrote', name, Array.isArray(data) ? data.length : Object.keys(data).length); };

const IMG = {
  djr: { status: 'verified', assetPath: 'images/destinations/darjeeling/darjeeling-railway-station-hero.webp', thumbPath: 'images/destinations/darjeeling/darjeeling-railway-station-card.webp', alt: 'Darjeeling railway station with narrow-gauge steam locomotives', credit: 'Alexkom000 (Alexey Komarov), CC BY 4.0', license: 'CC BY 4.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:2024-03-05_Darjeeling_railway_station_4.jpg' },
  djth: { status: 'verified', assetPath: 'images/destinations/darjeeling/town-hall-clock-tower-hero.webp', thumbPath: 'images/destinations/darjeeling/town-hall-clock-tower-card.webp', alt: 'Darjeeling Town Hall clock tower', credit: 'Alexkom000 (Alexey Komarov), CC BY 4.0', license: 'CC BY 4.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:2024-03-05_The_Clock_tower_of_Darjeeling_Town_Hall.jpg' },
  djrw: { status: 'verified', assetPath: 'images/destinations/darjeeling/ropeway-tea-gardens-hero.webp', thumbPath: 'images/destinations/darjeeling/ropeway-tea-gardens-card.webp', alt: 'Ropeway cabin above tea gardens near Darjeeling', credit: 'Jyoti PN via Wikimedia Commons, CC BY-SA 4.0 (publisher-attested)', license: 'CC BY-SA 4.0', sourceUrl: 'https://india.mongabay.com/2024/09/commentary-tea-gardens-in-darjeeling-and-kalimpong-can-aid-in-landscape-conservation/', verificationNote: 'Licence attested by the publisher; Commons file page not independently located.' },
  mir: { status: 'verified', assetPath: 'images/destinations/mirik/sumendu-lake-hero.webp', thumbPath: 'images/destinations/mirik/sumendu-lake-card.webp', alt: 'Sumendu Lake at Mirik', credit: 'Benoy, CC BY-SA 3.0', license: 'CC BY-SA 3.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Mirik_Sumendu_Lake.jpg' },
  kur: { status: 'verified', assetPath: 'images/destinations/kurseong/dhr-station-hero.webp', thumbPath: 'images/destinations/kurseong/dhr-station-card.webp', alt: 'Darjeeling Himalayan Railway train at Kurseong station', credit: 'PP Yoonus, CC BY-SA 3.0', license: 'CC BY-SA 3.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Kurseong_Station,_Darjeeling_Himalayan_Railway_1031.jpg' },
  kal: { status: 'verified', assetPath: 'images/destinations/kalimpong/zang-dhok-palri-phodang-hero.webp', thumbPath: 'images/destinations/kalimpong/zang-dhok-palri-phodang-card.webp', alt: 'Zang Dhok Palri Phodang monastery, Kalimpong', credit: 'Bernard Gagnon, CC BY-SA 4.0', license: 'CC BY-SA 4.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Zang_Dhok_Palri_Phodang_02.jpg' },
  snd: { status: 'verified', assetPath: 'images/destinations/sandakphu/singalila-ridge-tumling-hero.webp', thumbPath: 'images/destinations/sandakphu/singalila-ridge-tumling-card.webp', alt: 'Shikhar Lodge at Tumling on the Singalila Ridge trail to Sandakphu', credit: 'Matt Stabile, CC BY 2.0', license: 'CC BY 2.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Shikhar_Lodge,_Tumling,_Singalila_Ridge_Trail_(8716422445).jpg', verificationNote: 'Route photograph at Tumling; not a photograph of the Sandakphu summit.' },
};
const unavailable = (name) => ({ status: 'unavailable', alt: `Photograph unavailable for ${name}`, verificationNote: 'No verified, permissibly licensed photograph of this exact place was found in the 2026-11-03 research pass. A designed placeholder is shown instead.' });

// [slug, name, lat, lng, accuracy, elevationM, elevationVerified, description, bestSeason, hours, hiddenGem, imageKeys, activities]
const D = [
  ['darjeeling','Darjeeling',27.0360,88.2627,'published',2042,true,'Hill town in the Darjeeling Himalaya known for tea gardens, the UNESCO-listed Darjeeling Himalayan Railway and views towards Kangchenjunga.','March–May and October–December',48,false,['djr','djth','djrw'],['Tea garden visit','Heritage railway ride','Mall Road walk','Sunrise viewpoint']],
  ['kalimpong','Kalimpong',27.0608,88.4633,'published',1247,true,'Eastern Himalayan hill town with monasteries, nurseries and views over the Teesta valley.','October–April',36,false,['kal'],['Monastery visit','Nursery walk','Deolo Hill viewpoint']],
  ['kurseong','Kurseong',26.8829,88.2770,'published',1458,true,'Quiet hill station on the Darjeeling Himalayan Railway route, surrounded by tea estates.','March–June and September–November',24,false,['kur'],['Railway heritage','Tea estate walk','Eagle’s Craig viewpoint']],
  ['mirik','Mirik',26.8950,88.1830,'published',1767,true,'Small hill settlement around Sumendu Lake, encircled by tea gardens and forest.','September–April',18,false,['mir'],['Lakeside walk','Boating (seasonal)','Tea garden visit']],
  ['siliguri','Siliguri',26.7271,88.3953,'published',122,true,'Plains gateway to the Darjeeling hills; rail, road and air connections including Bagdogra Airport.','Year round',12,false,[],['Transit hub','Market visit','Wildlife sanctuary nearby']],
  ['lepchajagat','Lepchajagat',27.0050,88.2220,'approximate',null,false,'Forest hamlet near Darjeeling known for quiet pine and rhododendron walks. Coordinates are approximate.','March–May and October–November',8,true,[],['Forest walk','Birdwatching']],
  ['lamahatta','Lamahatta',27.0220,88.2620,'approximate',null,false,'Small village with an eco-park and mountain views on the Darjeeling–Kalimpong road. Coordinates are approximate.','October–May',6,true,[],['Eco-park walk','Village visit']],
  ['tinchuley','Tinchuley',27.0300,88.3300,'approximate',null,false,'Village on the Darjeeling–Kalimpong route associated with organic farming and homestays. Coordinates are approximate.','October–April',10,true,[],['Village walk','Farm visit']],
  ['takdah','Takdah',27.0480,88.3500,'approximate',null,false,'Former British cantonment area with orchid and tea nurseries. Coordinates are approximate.','March–May and October–December',8,true,[],['Orchid nursery','Heritage walk']],
  ['chatakpur','Chatakpur',27.0100,88.2300,'approximate',null,false,'Small eco-village inside the Senchal wildlife area. Access and permissions vary; check locally. Coordinates are approximate.','October–March',10,true,[],['Nature walk','Village stay']],
  ['sandakphu','Sandakphu',27.10583,88.00167,'published',3636,true,'Highest point in West Bengal on the Singalila Ridge, reached by a multi-day trek from Maneybhanjan. Permits and guides are required.','April–May and October–December',72,false,['snd'],['Singalila Ridge trek','Himalayan viewpoint']],
  ['sittong','Sittong',26.9300,88.4000,'approximate',null,false,'Village in the Kurseong hills known for orange orchards in winter. Coordinates are approximate.','November–January',10,true,[],['Orange orchard visit','Village walk']],
  ['dawaipani','Dawaipani',27.0100,88.2500,'approximate',null,false,'Quiet hillside village with views towards the Teesta valley. Coordinates are approximate.','October–April',6,true,[],['Village walk','Viewpoint']],
  ['jorebunglow','Jorebunglow',26.9500,88.2400,'approximate',null,false,'Small settlement below Ghum on the hill road, surrounded by tea estates. Coordinates are approximate.','Year round',6,true,[],['Tea estate walk','Railway heritage nearby']],
  ['ghum','Ghum',27.0080,88.2470,'published',2225,true,'Hill settlement near Darjeeling with one of the highest railway stations on the DHR line.','Year round',6,false,[],['Railway heritage','Monastery visit']],
];

const destinations = D.map((d, i) => ({
  id: `dst_${d[0]}`, slug: d[0], name: d[1], region: 'Darjeeling Himalaya', state: 'West Bengal', country: 'India',
  coords: { lat: d[2], lng: d[3] }, coordinateAccuracy: d[4], elevationM: d[5], elevationVerified: d[6],
  description: d[7], bestSeason: d[8], estimatedVisitHours: d[9], hiddenGem: d[10],
  images: d[11].length ? d[11].map((k) => IMG[k]) : [unavailable(d[1])],
  activities: d[12],
  accessibility: d[10] ? 'Road access via shared or private taxi from Darjeeling/Siliguri; last-mile road conditions vary — confirm locally.' : 'Reachable by road from Siliguri / Bagdogra; hill roads are slow and weather-dependent.',
  safety: d[0] === 'sandakphu' ? 'High-altitude trek: permits, guide and acclimatisation required; carry warm layers and water.' : 'Hill roads can be affected by landslides in monsoon. Use registered transport and check local advisories.',
  weatherNote: 'Live weather requires a configured provider; this build does not display forecast data. Check a weather service before travel.',
  sources: d[4] === 'published' ? ['https://en.wikipedia.org/wiki/Darjeeling', 'https://en.wikipedia.org/wiki/Sandakphu', 'https://darjeeling.gov.in/gallery-category/travel-tourism/'] : ['https://darjeeling.gov.in/gallery-category/travel-tourism/'],
  infoStatus: d[4] === 'published' ? 'published-reference' : 'community-reference',
  dataSourceNote: d[4] === 'approximate' ? 'Coordinates approximate from regional references; not field-verified.' : 'Coordinates from published geographic references.',
  _i: i,
}));
destinations.forEach((d) => delete d._i);
write('destinations.json', destinations);

const hiddenGems = destinations.filter((d) => d.hiddenGem).map((d) => ({
  id: `gem_${d.slug}`, destinationId: d.id, name: d.name, coords: d.coords, coordinateAccuracy: 'approximate',
  route: `From Darjeeling or Siliguri by hired/shared taxi towards ${d.name}; confirm the last-mile road with a local operator.`,
  accessibility: d.accessibility,
  bestPeriod: d.bestSeason ?? 'October–April',
  localTravelGuidance: 'Arrange return transport in advance; mobile coverage and evening transport can be limited.',
  restrictions: d.slug === 'chatakpur' ? 'Located near a wildlife sanctuary area; forest-department permissions and entry rules may apply.' : 'No verified permit information available for this build; check with local authorities.',
  safetyWarnings: 'Travel in daylight, avoid monsoon landslide-prone stretches, and do not rely on approximate coordinates for navigation.',
  source: 'https://darjeeling.gov.in/gallery-category/travel-tourism/',
  infoStatus: 'community-reference',
}));
write('hidden-gems.json', hiddenGems);

// Attractions: name, destination slug, category, minutes, infoStatus
const AT = [
  ['Tiger Hill sunrise viewpoint','darjeeling','viewpoint',120,'published-reference'],
  ['Batasia Loop & War Memorial','darjeeling','heritage',60,'published-reference'],
  ['Darjeeling Himalayan Railway','darjeeling','heritage',180,'published-reference'],
  ['Chowrasta & Mall Road','darjeeling','promenade',90,'published-reference'],
  ['Padmaja Naidu Himalayan Zoological Park','darjeeling','wildlife',150,'published-reference'],
  ['Japanese Peace Pagoda','darjeeling','spiritual',60,'published-reference'],
  ['Sumendu Lake','mirik','lake',90,'published-reference'],
  ['Zang Dhok Palri Phodang','kalimpong','spiritual',90,'published-reference'],
  ['Deolo Hill','kalimpong','viewpoint',90,'community-reference'],
  ['Kurseong DHR Station','kurseong','heritage',45,'published-reference'],
  ['Singalila National Park ridge','sandakphu','trek',720,'published-reference'],
  ['Ghum railway station','ghum','heritage',45,'published-reference'],
  ['Lamahatta Eco Park','lamahatta','nature',90,'community-reference'],
  ['Orange orchards','sittong','nature',120,'community-reference'],
  ['Senchal wildlife area','chatakpur','nature',120,'community-reference'],
];
const attractions = AT.map((a, i) => {
  const d = destinations.find((x) => x.slug === a[1]);
  return {
    id: `att_${String(i + 1).padStart(2, '0')}`, destinationId: d.id, name: a[0],
    description: `${a[0]} — a ${a[2]} site associated with ${d.name}. Details are ${a[4] === 'published-reference' ? 'from published geographic references' : 'community references pending verification'}.`,
    coords: { lat: d.coords.lat + (i % 3) * 0.004, lng: d.coords.lng + (i % 4) * 0.004 },
    category: a[2], typicalVisitMinutes: a[3],
    image: d.images[0].status === 'verified' ? d.images[0] : unavailable(a[0]),
    infoStatus: a[4],
  };
});
write('attractions.json', attractions);

const places = [
  { id: 'plc_bagdogra', name: 'Bagdogra Airport (IXB)', lat: 26.6812, lng: 88.3286, address: 'Bagdogra Airport, Siliguri', locality: 'Siliguri', kind: 'airport' },
  { id: 'plc_njp', name: 'New Jalpaiguri Junction (NJP)', lat: 26.6839, lng: 88.3978, address: 'NJP Railway Station', locality: 'Siliguri', kind: 'stand' },
  { id: 'plc_siliguri_stand', name: 'Siliguri Junction Taxi Stand', lat: 26.7236, lng: 88.3953, address: 'Siliguri Junction', locality: 'Siliguri', kind: 'stand' },
  { id: 'plc_darjeeling_stand', name: 'Darjeeling Motor Stand', lat: 27.0390, lng: 88.2650, address: 'Hill Cart Road, Darjeeling', locality: 'Darjeeling', kind: 'stand' },
  { id: 'plc_kalimpong_stand', name: 'Kalimpong Taxi Stand', lat: 27.0600, lng: 88.4620, address: 'Kalimpong town', locality: 'Kalimpong', kind: 'stand' },
  ...destinations.map((d) => ({ id: `plc_${d.slug}`, name: d.name, lat: d.coords.lat, lng: d.coords.lng, address: `${d.name}, ${d.state}`, locality: d.name, kind: 'destination' })),
];
write('places.json', places);

const vehicles = [
  ['hatchback','Hatchback','hatchback',4,12000,1300,300,25000,'Compact car for city and short hill trips'],
  ['sedan','Sedan','sedan',4,16000,1700,350,30000,'Comfortable for airport transfers'],
  ['suv','SUV','suv',6,22000,2300,450,45000,'For luggage, families and hill roads'],
  ['premium','Premium car','premium',4,32000,3100,600,65000,'Premium sedan for business travel'],
  ['shared','Shared taxi seat','shared',1,0,0,0,0,'Seat on an operator-defined fixed route'],
  ['tourist_taxi','Local tourist taxi','tourist_taxi',6,18000,2000,400,38000,'Local sightseeing by the hour or route'],
  ['airport_transfer','Airport transfer','airport',4,18000,1800,350,32000,'Bagdogra Airport / NJP pickup and drop'],
  ['outstation','Outstation cab','outstation',6,24000,2100,400,50000,'Multi-day outstation travel'],
].map(([id,name,category,seats,base,perKm,perMin,min,description]) => ({ id,name,category,seats,baseFarePaise:base,perKmPaise:perKm,perMinutePaise:perMin,minimumFarePaise:min,description }));
write('vehicles.json', vehicles);

const sharedRoutes = [
  { id: 'shr_1', stand: 'Siliguri Junction Taxi Stand', fromId: 'plc_siliguri_stand', toId: 'plc_darjeeling', pricePaise: 25000, seatsTotal: 8, departureTimes: ['06:00','08:00','10:00','12:00','14:00','16:00'], operator: 'Seeded demo operator A', permitNote: 'Demo route. Real operator permits, fares and timetables must be loaded from the transport authority before launch.' },
  { id: 'shr_2', stand: 'Siliguri Junction Taxi Stand', fromId: 'plc_siliguri_stand', toId: 'plc_kalimpong', pricePaise: 30000, seatsTotal: 8, departureTimes: ['07:00','09:30','12:30','15:00'], operator: 'Seeded demo operator B', permitNote: 'Demo route; operator-defined price, verify locally.' },
  { id: 'shr_3', stand: 'Darjeeling Motor Stand', fromId: 'plc_darjeeling_stand', toId: 'plc_kurseong', pricePaise: 15000, seatsTotal: 6, departureTimes: ['07:30','10:00','13:00','16:30'], operator: 'Seeded demo operator C', permitNote: 'Demo route; subject to local shared-taxi rules.' },
  { id: 'shr_4', stand: 'Darjeeling Motor Stand', fromId: 'plc_darjeeling_stand', toId: 'plc_mirik', pricePaise: 18000, seatsTotal: 6, departureTimes: ['08:00','11:00','15:00'], operator: 'Seeded demo operator D', permitNote: 'Demo route; subject to local shared-taxi rules.' },
];
write('shared-taxi-routes.json', sharedRoutes);

// Clearly-labelled demo inventory. No ratings, no claims about real businesses.
const demoImage = (name) => unavailable(name);
const properties = [
  ['Hillview Guest House','darjeeling','homestay','homestay',[['Standard room',2,1,320000,3],['Family room',4,2,540000,2]],['Wi-Fi','Breakfast','Hot water','Mountain view']],
  ['Mall Road Heritage Hotel','darjeeling','hotel','hotel',[['Deluxe room',2,1,520000,6],['Suite',3,1,880000,2]],['Wi-Fi','Restaurant','Heating','Luggage storage']],
  ['Tea Garden Lodge','kurseong','lodge','hotel',[['Garden room',2,0,360000,4]],['Breakfast','Garden','Parking']],
  ['Lakeview Homestay','mirik','homestay','homestay',[['Double room',2,1,280000,3]],['Kitchen','Lake view','Hot water']],
  ['Kalimpong Cottage','kalimpong','guesthouse','homestay',[['Cottage',4,2,460000,2]],['Garden','Kitchen','Parking']],
  ['Ridge Trekkers Lodge','sandakphu','lodge','hotel',[['Dorm bed',1,0,120000,8],['Private room',2,0,300000,2]],['Heating','Meals','Trek permits guidance']],
].map((p, i) => ({
  id: `prp_${i+1}`, service: p[3], name: p[0], destinationId: `dst_${p[1]}`,
  description: `Demo listing for a ${p[2]} in ${destinations.find(d=>d.slug===p[1])?.name ?? p[1]}. Replace with verified partner data before launch.`,
  coords: { ...destinations.find(d=>d.slug===p[1]).coords, lat: destinations.find(d=>d.slug===p[1]).coords.lat + 0.002*(i+1) },
  dataClass: 'demo-listing', availabilitySource: 'seeded-inventory', image: demoImage(p[0]), tags: [p[2], 'Demo listing'],
  propertyType: p[2], rooms: p[4].map((r, j) => ({ id: `room_${i+1}_${j+1}`, name: r[0], capacityAdults: r[1], capacityChildren: r[2], nightlyRatePaise: r[3], totalRooms: r[4] })),
  amenities: p[5], houseRules: 'Check-in after 13:00, check-out before 11:00. Government photo ID required.',
  cancellationPolicy: 'Free cancellation 48 hours before check-in; otherwise one night is charged.',
  taxesPercent: 12,
}));
write('properties.json', properties);

const menu = (rid, rows) => rows.map((r, i) => ({ id: `menu_${rid}_${i+1}`, restaurantId: rid, name: r[0], description: r[1], pricePaise: r[2], category: r[3], vegetarian: r[4], customizations: r[5] ? [{ id: 'extra', label: 'Extra portion', extraPaise: 6000 }] : [], available: true }));
const restaurants = [
  ['Himalayan Kitchen','darjeeling',['Nepali','Tibetan','Indian'],'09:00–21:00',35,[['Momos (8 pcs)','Steamed dumplings with chutney',18000,'Starters',true,true],['Thukpa','Noodle soup with vegetables',21000,'Mains',true,false],['Butter chicken','Chicken in tomato gravy',32000,'Mains',false,false],['Darjeeling tea','Pot of estate tea',9000,'Drinks',true,false]]],
  ['Mall Road Cafe','darjeeling',['Cafe','Bakery'],'08:00–20:00',20,[['Croissant','Butter croissant',12000,'Bakery',true,false],['Cappuccino','Double espresso with milk',16000,'Drinks',true,true],['Club sandwich','Grilled sandwich',24000,'Mains',false,false]]],
  ['Teesta Valley Diner','kalimpong',['Indian','Chinese'],'10:00–22:00',30,[['Veg chowmein','Stir-fried noodles',19000,'Mains',true,true],['Chilli chicken','Indo-Chinese chicken',29000,'Mains',false,false],['Fresh lime soda','Chilled lime soda',9000,'Drinks',true,false]]],
  ['Mirik Lakeside Kitchen','mirik',['Indian','Nepali'],'09:00–20:00',30,[['Aloo dum','Spiced potato curry',16000,'Mains',true,false],['Fish curry','Local fish curry',28000,'Mains',false,false],['Sel roti','Rice bread',10000,'Snacks',true,false]]],
  ['Kurseong Tea Room','kurseong',['Cafe','Snacks'],'08:00–19:00',18,[['Estate tea','Single-estate black tea',11000,'Drinks',true,false],['Vegetable pakora','Fried fritters',14000,'Snacks',true,true],['Egg roll','Paratha wrap',17000,'Snacks',false,false]]],
].map((r, i) => {
  const d = destinations.find(x=>x.slug===r[1]);
  return { id: `rst_${i+1}`, service: 'food', name: r[0], destinationId: d.id, description: `Demo restaurant listing in ${d.name}. Replace with a verified partner before launch.`, coords: { lat: d.coords.lat + 0.001*(i+1), lng: d.coords.lng + 0.001 }, dataClass: 'demo-listing', availabilitySource: 'seeded-inventory', image: demoImage(r[0]), tags: [...r[2], 'Demo listing'], cuisines: r[2], openingHours: r[3], prepMinutes: r[4], menu: menu(`rst_${i+1}`, r[5]) };
});
write('restaurants.json', restaurants);

const groceryCategories = ['Fruits','Vegetables','Dairy','Bakery','Snacks','Beverages','Household','Personal care','Packaged foods','Local products'];
const groceryProducts = [
  ['Apples (1 kg)','Fruits','kg',18000,14],['Bananas (1 dozen)','Fruits','dozen',6000,22],['Oranges (1 kg)','Fruits','kg',14000,9],
  ['Potatoes (1 kg)','Vegetables','kg',4000,40],['Onions (1 kg)','Vegetables','kg',5000,35],['Tomatoes (1 kg)','Vegetables','kg',6000,20],
  ['Milk (1 L)','Dairy','litre',6500,18],['Curd (500 g)','Dairy','pack',4500,12],['Paneer (200 g)','Dairy','pack',9000,7],
  ['Whole wheat bread','Bakery','loaf',5500,10],['Butter croissant','Bakery','piece',6000,8],
  ['Potato chips','Snacks','pack',4000,25],['Biscuits','Snacks','pack',3500,30],
  ['Darjeeling tea (100 g)','Beverages','pack',16000,11],['Mineral water (1 L)','Beverages','bottle',2500,50],
  ['Dishwash liquid','Household','bottle',12000,14],['Laundry detergent (1 kg)','Household','pack',22000,9],
  ['Toothpaste','Personal care','tube',9000,16],['Soap','Personal care','bar',4500,20],
  ['Rice (1 kg)','Packaged foods','kg',9500,18],['Instant noodles','Packaged foods','pack',4500,24],
  ['Local honey (250 g)','Local products','jar',28000,5],['Handmade pickle','Local products','jar',15000,8],
];
const groceryStores = [
  ['Hill Basket Market','darjeeling',8,['08:00–11:00','12:00–15:00','17:00–20:00']],
  ['Daily Needs Store','siliguri',12,['09:00–12:00','14:00–18:00','19:00–21:00']],
  ['Valley Groceries','kalimpong',7,['08:00–12:00','16:00–19:00']],
].map((s, i) => {
  const d = destinations.find(x=>x.slug===s[1]);
  return { id: `grc_${i+1}`, service: 'grocery', name: s[0], destinationId: d.id, description: `Demo grocery store in ${d.name} with independent seeded inventory.`, coords: { lat: d.coords.lat + 0.0015*(i+1), lng: d.coords.lng - 0.001 }, dataClass: 'demo-listing', availabilitySource: 'seeded-inventory', image: demoImage(s[0]), tags: ['Demo listing','Independent inventory'], deliveryCoverageKm: s[2], slots: s[3], products: groceryProducts.map((p, j) => ({ id: `grp_${i+1}_${j+1}`, storeId: `grc_${i+1}`, name: p[0], category: p[1], unit: p[2], pricePaise: p[3], stock: Math.max(0, p[4] - i*2 - (j % 3)), substitutionAllowed: j % 4 !== 0 })) };
});
write('grocery-stores.json', groceryStores);

const packages = [
  ['Darjeeling sunrise circuit','darjeeling',6,320000,['Tiger Hill','Batasia Loop','DHR station'],['att_01','att_02','att_03']],
  ['Mirik lake & tea gardens','mirik',8,280000,['Sumendu Lake','Tea garden walk'],['att_07']],
  ['Kalimpong heritage walk','kalimpong',7,300000,['Monastery','Deolo Hill'],['att_08','att_09']],
  ['Singalila ridge expedition','sandakphu',72,1450000,['Guided trek','Permit assistance','Meals'],['att_11']],
].map((p, i) => ({ id: `pkg_${i+1}`, destinationId: `dst_${p[1]}`, name: p[0], description: `Demo sightseeing package: ${p[4].join(', ')}. Seeded itinerary, not a live operator offer.`, durationHours: p[2], pricePaise: p[3], includes: p[4], activityIds: p[5] }));
write('tour-packages.json', packages);

const experiences = [
  ['Tea estate tasting','darjeeling',120,180000,'Seeded demo host'],
  ['Momos cooking session','darjeeling',90,140000,'Seeded demo host'],
  ['Village orchard walk','sittong',150,120000,'Seeded demo host'],
  ['Birdwatching morning walk','lepchajagat',180,160000,'Seeded demo host'],
].map((e, i) => ({ id: `exp_${i+1}`, destinationId: `dst_${e[1]}`, name: e[0], description: `Demo local experience in ${destinations.find(d=>d.slug===e[1]).name}. Host details require partner verification.`, durationMinutes: e[2], pricePaise: e[3], host: e[4] }));
write('experiences.json', experiences);
