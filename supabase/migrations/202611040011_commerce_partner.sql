-- 202611040011_commerce_partner.sql
-- Marketplace commerce + GOWAYY PARTNER hub tables. Shared by all three apps
-- (GOWAYY, GOWAYY PARTNER, GOWAYY EXPLORE) through the same database.
-- No admin surface exists anywhere; RLS exposes rows only to their owners.

-- ---------------------------------------------------------------- products --
create table if not exists public.marketplace_products (
  id text primary key,
  slug text unique not null,
  store_id text not null references public.grocery_stores(id),
  brand text not null,
  name text not null,
  category text not null,
  data_class text not null default 'demo-listing' check (data_class in ('demo-listing','verified-listing')),
  highlights jsonb not null default '[]'::jsonb,
  highlights_note text,
  description text not null default '',
  specifications jsonb not null default '[]'::jsonb,
  in_the_box jsonb not null default '[]'::jsonb,
  warranty text,
  faq jsonb not null default '[]'::jsonb,
  delivery_note text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.product_variants (
  id text primary key,
  product_id text not null references public.marketplace_products(id) on delete cascade,
  label text not null,
  price_paise integer not null check (price_paise >= 0),
  mrp_paise integer not null check (mrp_paise >= 0),
  stock integer not null default 0 check (stock >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_variants_product_idx on public.product_variants(product_id);

create table if not exists public.product_images (
  id text primary key,
  product_id text not null references public.marketplace_products(id) on delete cascade,
  status text not null check (status in ('verified','unavailable')),
  asset_path text,
  alt text not null,
  credit text, license text, source_url text, verification_note text,
  position integer not null default 0
);
create index if not exists product_images_product_idx on public.product_images(product_id);

create table if not exists public.protection_plans (
  id text primary key,
  product_id text not null references public.marketplace_products(id) on delete cascade,
  provider text not null,
  demo boolean not null default false,
  title text not null,
  price_paise integer not null check (price_paise >= 0),
  mrp_paise integer,
  per_month_paise integer,
  coverage jsonb not null default '[]'::jsonb,
  terms text not null,
  exclusions jsonb not null default '[]'::jsonb,
  active boolean not null default true
);

-- ------------------------------------------------------------------- cart ---
create table if not exists public.carts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create table if not exists public.cart_items (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id text not null references public.marketplace_products(id),
  variant_id text not null references public.product_variants(id),
  quantity integer not null check (quantity between 1 and 10),
  protection_plan_id text references public.protection_plans(id),
  added_at timestamptz not null default now(),
  unique (user_id, product_id, variant_id, protection_plan_id)
);
create index if not exists cart_items_user_idx on public.cart_items(user_id);

create table if not exists public.wishlists (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id text not null references public.marketplace_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.search_history (
  user_id uuid not null references public.profiles(id) on delete cascade,
  query text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, query)
);

create table if not exists public.recently_viewed (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id text not null references public.marketplace_products(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- ------------------------------------------------------- marketplace orders --
-- Reuses payments / transactions / refunds / order_events; protection add-ons
-- are stored on the order row so terms are auditable at purchase time.
create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  user_id uuid not null references public.profiles(id),
  status text not null default 'created'
    check (status in ('created','accepted','preparing','out_for_delivery','delivered','cancelled')),
  journey_id uuid references public.journeys(id),
  items jsonb not null default '[]'::jsonb,
  protection jsonb not null default '[]'::jsonb,
  price jsonb not null,
  delivery_address jsonb not null,
  instructions text not null default '',
  delivery_slot text not null default 'standard',
  coupon text,
  payment_id uuid references public.payments(id),
  payment_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists marketplace_orders_user_idx on public.marketplace_orders(user_id, created_at desc);

-- ------------------------------------------------------------ partner hub ---
create table if not exists public.partner_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  business_name text, phone text, address text, gstin text, description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_documents (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('pan','gst','fssai','trade_licence','driving_licence','vehicle_registration','insurance','permit')),
  number text not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  demo boolean not null default false,
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists partner_documents_user_idx on public.partner_documents(user_id);

-- Partner-managed copies of menus / rooms / tours (claimed businesses only).
create table if not exists public.partner_menu_items (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  restaurant_id text not null references public.restaurants(id),
  name text not null,
  price_paise integer not null check (price_paise >= 0),
  available boolean not null default true,
  customizations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists partner_menu_items_rest_idx on public.partner_menu_items(restaurant_id);

create table if not exists public.partner_rooms (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  property_id text not null references public.properties(id),
  name text not null,
  price_per_night_paise integer not null check (price_per_night_paise >= 0),
  total_rooms integer not null default 1 check (total_rooms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_tours (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  destination_id text not null references public.destinations(id),
  name text not null,
  price_paise integer not null check (price_paise >= 0),
  duration_hours numeric not null check (duration_hours > 0),
  capacity integer not null default 1 check (capacity > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------- RLS + audit --
alter table public.marketplace_products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.protection_plans enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.wishlists enable row level security;
alter table public.search_history enable row level security;
alter table public.recently_viewed enable row level security;
alter table public.marketplace_orders enable row level security;
alter table public.partner_profiles enable row level security;
alter table public.partner_documents enable row level security;
alter table public.partner_menu_items enable row level security;
alter table public.partner_rooms enable row level security;
alter table public.partner_tours enable row level security;

-- Products are public read; only the claiming grocery partner may write.
create policy "products are publicly readable" on public.marketplace_products for select using (true);
create policy "grocery partner manages own products" on public.marketplace_products for all
  using (exists (select 1 from public.partner_claims pc where pc.user_id = auth.uid() and pc.role = 'grocery' and pc.listing_id = store_id))
  with check (exists (select 1 from public.partner_claims pc where pc.user_id = auth.uid() and pc.role = 'grocery' and pc.listing_id = store_id));
create policy "variants are publicly readable" on public.product_variants for select using (true);
create policy "variants follow product ownership" on public.product_variants for all
  using (exists (select 1 from public.marketplace_products p join public.partner_claims pc on pc.listing_id = p.store_id and pc.role='grocery' where p.id = product_id and pc.user_id = auth.uid()))
  with check (exists (select 1 from public.marketplace_products p join public.partner_claims pc on pc.listing_id = p.store_id and pc.role='grocery' where p.id = product_id and pc.user_id = auth.uid()));
create policy "product images are publicly readable" on public.product_images for select using (true);
create policy "protection plans are publicly readable" on public.protection_plans for select using (true);

-- Carts / wishlist / history: strictly per-user.
create policy "own cart" on public.carts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own cart items" on public.cart_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own wishlist" on public.wishlists for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own search history" on public.search_history for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own recently viewed" on public.recently_viewed for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Marketplace orders: customer reads own; server RPCs write.
create policy "own marketplace orders" on public.marketplace_orders for select using (user_id = auth.uid());

-- Partner hub: strictly per-partner.
create policy "own partner profile" on public.partner_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own partner documents" on public.partner_documents for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own menu items" on public.partner_menu_items for all
  using (user_id = auth.uid() and exists (select 1 from public.partner_claims pc where pc.user_id = auth.uid() and pc.role='restaurant' and pc.listing_id = restaurant_id))
  with check (user_id = auth.uid() and exists (select 1 from public.partner_claims pc where pc.user_id = auth.uid() and pc.role='restaurant' and pc.listing_id = restaurant_id));
create policy "own rooms" on public.partner_rooms for all
  using (user_id = auth.uid() and exists (select 1 from public.partner_claims pc where pc.user_id = auth.uid() and pc.role='property' and pc.listing_id = property_id))
  with check (user_id = auth.uid() and exists (select 1 from public.partner_claims pc where pc.user_id = auth.uid() and pc.role='property' and pc.listing_id = property_id));
create policy "own tours" on public.partner_tours for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- RPCs ------
-- Server-authoritative commerce RPCs. Full bodies live here so the Edge
-- gateway and any future client share one contract.

create or replace function public.rpc_commerce_products(p_category text default null, p_q text default null, p_store text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.name), '[]'::jsonb) from (
    select p.id, p.slug, p.store_id, p.brand, p.name, p.category, p.data_class, p.highlights, p.description,
           coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'label', v.label, 'pricePaise', v.price_paise, 'mrpPaise', v.mrp_paise, 'stock', v.stock) order by v.position)
                     from public.product_variants v where v.product_id = p.id), '[]'::jsonb) as variants,
           coalesce((select jsonb_agg(jsonb_build_object('status', i.status, 'assetPath', i.asset_path, 'alt', i.alt) order by i.position)
                     from public.product_images i where i.product_id = p.id), '[]'::jsonb) as images
    from public.marketplace_products p
    where p.active and p.deleted_at is null
      and (p_category is null or p.category ilike p_category)
      and (p_store is null or p.store_id = p_store)
      and (p_q is null or (p.name || ' ' || p.brand || ' ' || p.category) ilike '%' || p_q || '%')
  ) t;
$$;

create or replace function public.rpc_product_detail(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select row_to_json(t)::jsonb from (
    select p.id, p.slug, p.store_id, p.brand, p.name, p.category, p.data_class, p.highlights, p.highlights_note as "highlightsNote",
           p.description, p.specifications, p.in_the_box as "inTheBox", p.warranty, p.faq, p.delivery_note as "deliveryNote",
           coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'label', v.label, 'pricePaise', v.price_paise, 'mrpPaise', v.mrp_paise, 'stock', v.stock) order by v.position)
                     from public.product_variants v where v.product_id = p.id), '[]'::jsonb) as variants,
           coalesce((select jsonb_agg(jsonb_build_object('status', i.status, 'assetPath', i.asset_path, 'alt', i.alt, 'credit', i.credit, 'license', i.license, 'sourceUrl', i.source_url, 'verificationNote', i.verification_note) order by i.position)
                     from public.product_images i where i.product_id = p.id), '[]'::jsonb) as images,
           coalesce((select jsonb_agg(jsonb_build_object('id', pl.id, 'provider', pl.provider, 'demo', pl.demo, 'title', pl.title, 'pricePaise', pl.price_paise, 'mrpPaise', pl.mrp_paise, 'perMonthPaise', pl.per_month_paise, 'coverage', pl.coverage, 'terms', pl.terms, 'exclusions', pl.exclusions) order by pl.id)
                     from public.protection_plans pl where pl.product_id = p.id and pl.active), '[]'::jsonb) as "protectionPlans"
    from public.marketplace_products p
    where p.slug = p_slug and p.active and p.deleted_at is null
  ) t;
$$;

create or replace function public.rpc_cart_get(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t."addedAt"), '[]'::jsonb) from (
    select ci.id, ci.product_id as "productId", ci.variant_id as "variantId", ci.quantity, ci.protection_plan_id as "protectionPlanId", ci.added_at as "addedAt"
    from public.cart_items ci where ci.user_id = p_user
  ) t;
$$;

create or replace function public.rpc_cart_upsert(p_user uuid, p_product text, p_variant text, p_quantity int, p_plan text default null)
returns jsonb language sql security definer set search_path = public as $$
  insert into public.cart_items (id, user_id, product_id, variant_id, quantity, protection_plan_id)
  values (gen_random_uuid()::text, p_user, p_product, p_variant, p_quantity, p_plan)
  on conflict (user_id, product_id, variant_id, protection_plan_id)
  do update set quantity = least(10, cart_items.quantity + p_quantity)
  returning to_jsonb(cart_items.*);
$$;

-- Server-priced checkout: recomputes every price from product_variants,
-- validates stock, applies coupon rules, decrements stock, creates the order.
create or replace function public.rpc_marketplace_checkout(p_user uuid, p_address jsonb, p_method text, p_slot text default 'standard', p_coupon text default null, p_instructions text default '', p_journey text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_line record; v_variant record; v_items jsonb := '[]'; v_protection jsonb := '[]';
  v_items_paise int := 0; v_prot_paise int := 0; v_discount int := 0; v_delivery int := 0;
  v_tax int; v_total int; v_order_id text; v_ref text; v_coupon record;
begin
  if not exists (select 1 from public.cart_items where user_id = p_user) then
    raise exception 'CART_EMPTY: Your cart is empty' using errcode = 'P0001';
  end if;
  for v_line in select * from public.cart_items where user_id = p_user loop
    select * into v_variant from public.product_variants where id = v_line.variant_id and product_id = v_line.product_id;
    if v_variant is null or v_variant.stock < v_line.quantity then
      raise exception 'OUT_OF_STOCK: insufficient stock for variant %', v_line.variant_id using errcode = 'P0001';
    end if;
    v_items := v_items || jsonb_build_object('id', v_line.product_id, 'variantId', v_line.variant_id, 'name', (select name from public.marketplace_products where id = v_line.product_id), 'quantity', v_line.quantity, 'unitPricePaise', v_variant.price_paise);
    v_items_paise := v_items_paise + v_variant.price_paise * v_line.quantity;
    if v_line.protection_plan_id is not null then
      select price_paise into v_prot_paise from public.protection_plans where id = v_line.protection_plan_id;
      v_protection := v_protection || jsonb_build_object('planId', v_line.protection_plan_id, 'paise', v_prot_paise * v_line.quantity);
      v_items_paise := v_items_paise; -- protection priced separately below
    end if;
  end loop;
  v_prot_paise := (select coalesce(sum((jsonb_array_elements(v_protection)->>'paise')::int), 0));
  if p_coupon is not null then
    select * into v_coupon from public.coupons where upper(code) = upper(p_coupon) and active;
    if v_coupon is null then raise exception 'INVALID_COUPON' using errcode = 'P0001'; end if;
    if v_coupon.kind = 'flat' then v_discount := least(v_coupon.value, v_items_paise);
    else v_discount := least(coalesce(v_coupon.max_discount_paise, 999999999), round(v_items_paise * v_coupon.value / 100.0)); end if;
  end if;
  v_delivery := case when p_slot = 'express' then 9900 else 0 end;
  v_tax := round(greatest(0, v_items_paise + v_prot_paise + v_delivery - v_discount) * 0.05);
  v_total := v_items_paise + v_prot_paise + v_delivery - v_discount + v_tax;
  v_order_id := gen_random_uuid();
  v_ref := 'GW-O' || nextval('public.order_ref_seq');
  insert into public.marketplace_orders (id, reference, user_id, journey_id, items, protection, price, delivery_address, instructions, delivery_slot, coupon, payment_method)
  values (v_order_id, v_ref, p_user, p_journey, v_items, v_protection,
          jsonb_build_object('itemsPaise', v_items_paise, 'protectionPaise', v_prot_paise, 'deliveryFeePaise', v_delivery, 'discountPaise', v_discount, 'taxPaise', v_tax, 'totalPaise', v_total), p_address, p_instructions, p_slot, p_coupon, p_method);
  for v_line in select * from public.cart_items where user_id = p_user loop
    update public.product_variants set stock = stock - v_line.quantity where id = v_line.variant_id;
  end loop;
  delete from public.cart_items where user_id = p_user;
  return (select row_to_json(t)::jsonb from (select * from public.marketplace_orders where id = v_order_id) t);
end; $$;

-- sequence for order references (create if missing)
do $$ begin
  if not exists (select 1 from pg_sequences where schemaname='public' and sequencename='order_ref_seq') then
    create sequence public.order_ref_seq start 2000;
  end if;
end $$;

create or replace function public.rpc_payment_methods(p_total_paise int)
returns jsonb language sql stable security definer set search_path = public as $$
  -- Only genuinely integrated methods are available; cards/netbanking/EMI
  -- require a configured gateway, so they are returned disabled here.
  select jsonb_build_object('items', jsonb_build_array(
    jsonb_build_object('id','upi','label','Pay by any UPI app','detail','Google Pay, PhonePe, Paytm and more','available',true,'integrated',true,'recommended', p_total_paise > 0,'cashbackPaise', least(2500, round(p_total_paise * 0.01))),
    jsonb_build_object('id','card','label','Credit & debit cards','detail','Via the configured gateway','available',false,'integrated',false,'unavailableReason','No card gateway configured on this backend'),
    jsonb_build_object('id','wallet','label','GOWAYY Wallet balance','detail','Balance applied at checkout','available',true,'integrated',true,'cashbackPaise', least(1000, round(p_total_paise * 0.003))),
    jsonb_build_object('id','netbanking','label','Net banking','detail','Via the configured gateway','available',false,'integrated',false,'unavailableReason','No gateway configured'),
    jsonb_build_object('id','emi','label','EMI','detail','Where the gateway supports it','available',false,'integrated',false,'unavailableReason','Requires a configured gateway and minimum amount'),
    jsonb_build_object('id','cod','label','Cash on delivery','detail','Where operationally supported','available', p_total_paise <= 1000000,'integrated',true,'unavailableReason', case when p_total_paise > 1000000 then 'Unavailable above ₹10,000' else null end)
  ), 'note', 'Only genuinely integrated methods are selectable; others are shown disabled with the reason.');
$$;

create or replace function public.rpc_partner_earnings(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'commissionPercent', 15,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('ref', coalesce(b.reference, o.reference), 'service', coalesce(b.service, 'marketplace'), 'grossPaise', p.amount_paise, 'commissionPaise', round(p.amount_paise * 0.15), 'netPaise', round(p.amount_paise * 0.85), 'at', p.updated_at) order by p.updated_at desc)
      from public.payments p
      left join public.ride_bookings b on b.payment_id = p.id
      left join public.grocery_orders o on o.payment_id = p.id
      where p.user_id = p_user and p.status = 'captured'), '[]'::jsonb)
  );
$$;
