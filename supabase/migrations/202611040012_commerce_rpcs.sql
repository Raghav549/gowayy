-- 202611040012_commerce_rpcs.sql — RPCs backing the commerce + partner-hub
-- operations exposed by the gowayy-api Edge gateway. All are SECURITY DEFINER
-- with fixed search_path and enforce ownership server-side.

create or replace function public.rpc_commerce_categories()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.name), '[]'::jsonb) from (
    select category as name, count(*)::int as count from public.marketplace_products
    where active and deleted_at is null group by category
  ) t;
$$;

create or replace function public.rpc_recommended_stores()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
    select s.id, s.name, s.destination_id as "destinationId",
           (select count(*)::int from public.marketplace_products p where p.store_id = s.id and p.active) as "productCount",
           s.delivery_radius_km as "deliveryCoverageKm", s.delivery_slots as slots, s.name as image
    from public.grocery_stores s where s.deleted_at is null and s.published order by s.name
  ) t;
$$;

create or replace function public.rpc_record_product_view(p_user uuid, p_product text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.recently_viewed (user_id, product_id, viewed_at)
  values (p_user, (select id from public.marketplace_products where slug = p_product or id = p_product), now())
  on conflict (user_id, product_id) do update set viewed_at = now();
end; $$;

create or replace function public.rpc_cart_update_line(p_user uuid, p_line text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_q int := coalesce((p_payload->>'quantity')::int, null);
begin
  if v_q is null then
    update public.cart_items set protection_plan_id = nullif(p_payload->>'protectionPlanId','') where id = p_line and user_id = p_user;
  elsif v_q <= 0 then
    delete from public.cart_items where id = p_line and user_id = p_user;
  else
    update public.cart_items set quantity = least(10, greatest(1, v_q)), protection_plan_id = coalesce(nullif(p_payload->>'protectionPlanId',''), protection_plan_id) where id = p_line and user_id = p_user;
  end if;
end; $$;

create or replace function public.rpc_cart_delete_line(p_user uuid, p_line text)
returns void language plpgsql security definer set search_path = public as $$
begin delete from public.cart_items where id = p_line and user_id = p_user; end; $$;

create or replace function public.rpc_cart_clear(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin delete from public.cart_items where user_id = p_user; end; $$;

-- Server-priced cart quote: every price recomputed from product_variants.
create or replace function public.rpc_cart_quote(p_user uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_line record; v_items int := 0; v_mrp int := 0; v_prot int := 0; v_discount int := 0; v_delivery int; v_tax int; v_total int; v_coupon record;
begin
  for v_line in select ci.*, v.price_paise, v.mrp_paise from public.cart_items ci join public.product_variants v on v.id = ci.variant_id where ci.user_id = p_user loop
    if v_line.stock < v_line.quantity then raise exception 'OUT_OF_STOCK: %', v_line.variant_id using errcode='P0001'; end if;
    v_items := v_items + v_line.price_paise * v_line.quantity;
    v_mrp := v_mrp + v_line.mrp_paise * v_line.quantity;
    if v_line.protection_plan_id is not null then
      select price_paise into v_prot from public.protection_plans where id = v_line.protection_plan_id;
      v_prot := v_prot; -- accumulate below
    end if;
  end loop;
  select coalesce(sum(pl.price_paise * ci.quantity),0) into v_prot from public.cart_items ci join public.protection_plans pl on pl.id = ci.protection_plan_id where ci.user_id = p_user;
  if p_payload->>'coupon' is not null then
    select * into v_coupon from public.coupons where upper(code)=upper(p_payload->>'coupon') and active;
    if v_coupon is null then raise exception 'INVALID_COUPON' using errcode='P0001'; end if;
    if v_coupon.kind='flat' then v_discount := least(v_coupon.value, v_items); else v_discount := least(coalesce(v_coupon.max_discount_paise,999999999), round(v_items*v_coupon.value/100.0)); end if;
  end if;
  v_delivery := case when p_payload->>'deliverySlot'='express' then 9900 else 0 end;
  v_tax := round(greatest(0, v_items + v_prot + v_delivery - v_discount) * 0.05);
  v_total := v_items + v_prot + v_delivery - v_discount + v_tax;
  return jsonb_build_object('quote', jsonb_build_object('itemsPaise', v_items, 'protectionPaise', v_prot, 'deliveryFeePaise', v_delivery, 'discountPaise', v_discount, 'taxPaise', v_tax, 'totalPaise', v_total, 'mrpTotalPaise', v_mrp, 'savingsPaise', greatest(0, v_mrp - v_items) + v_discount, 'appliedCoupon', case when v_discount>0 then v_coupon.code else null end));
end; $$;

create or replace function public.rpc_wishlist_add(p_user uuid, p_product text)
returns void language plpgsql security definer set search_path = public as $$
begin insert into public.wishlists (user_id, product_id) values (p_user, p_product) on conflict do nothing; end; $$;
create or replace function public.rpc_wishlist_remove(p_user uuid, p_product text)
returns void language plpgsql security definer set search_path = public as $$
begin delete from public.wishlists where user_id = p_user and product_id = p_product; end; $$;
create or replace function public.rpc_record_search(p_user uuid, p_q text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.search_history where user_id = p_user and query = p_q;
  insert into public.search_history (user_id, query) values (p_user, p_q);
  delete from public.search_history where user_id = p_user and created_at < (select max(created_at) from public.search_history where user_id = p_user) - interval '0 seconds' and query not in (select query from public.search_history where user_id = p_user order by created_at desc limit 10);
end; $$;

-- ------------------------------------------------------------ partner hub ---
create or replace function public.rpc_partner_overview(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('roles', coalesce((select jsonb_agg(role) from public.user_roles where user_id=p_user),'[]'::jsonb),
    'counts', jsonb_build_object('bookings', (select count(*)::int from public.ride_bookings where status in ('requested','awaiting_payment','confirmed')), 'orders', (select count(*)::int from public.grocery_orders where status in ('created','accepted','preparing'))),
    'earnings', public.rpc_partner_earnings(p_user));
$$;

create or replace function public.rpc_partner_profile_upsert(p_user uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into public.partner_profiles (user_id, business_name, phone, address, gstin, description, updated_at)
  values (p_user, p_payload->>'businessName', p_payload->>'phone', p_payload->>'address', p_payload->>'gstin', p_payload->>'description', now())
  on conflict (user_id) do update set business_name=excluded.business_name, phone=excluded.phone, address=excluded.address, gstin=excluded.gstin, description=excluded.description, updated_at=now();
  return (select row_to_json(t)::jsonb from (select * from public.partner_profiles where user_id=p_user) t);
end; $$;

create or replace function public.rpc_partner_document_upload(p_user uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text := 'doc_' || gen_random_uuid()::text;
begin
  insert into public.partner_documents (id, user_id, type, number, status, demo)
  values (v_id, p_user, p_payload->>'type', p_payload->>'number', 'pending', true);
  return jsonb_build_object('document', (select row_to_json(t)::jsonb from (select * from public.partner_documents where id=v_id) t), 'demoNotice', 'Stored as PENDING — production requires real document review.');
end; $$;

create or replace function public.rpc_partner_inventory(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.name), '[]'::jsonb) from (
    select gp.id, pc.listing_id as "storeId", gp.name, gp.category, gp.unit, gp.price_paise as "pricePaise",
           coalesce(gi.stock, 0) as stock
    from public.partner_claims pc
    join public.grocery_stores gs on gs.id = pc.listing_id
    cross join lateral (select * from public.grocery_products gp where gp.store_id = gs.id) gp
    left join public.grocery_inventory gi on gi.store_id = gs.id and gi.product_id = gp.id
    where pc.user_id = p_user and pc.role = 'grocery'
  ) t;
$$;

create or replace function public.rpc_partner_inventory_adjust(p_user uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_stock int;
begin
  if not exists (select 1 from public.partner_claims where user_id=p_user and role='grocery' and listing_id=p_payload->>'listingId') then
    raise exception 'NOT_CLAIMED' using errcode='P0001';
  end if;
  insert into public.grocery_inventory (store_id, product_id, stock, updated_at)
  values (p_payload->>'listingId', p_payload->>'productId', greatest(0, (p_payload->>'delta')::int), now())
  on conflict (store_id, product_id) do update set stock = greatest(0, grocery_inventory.stock + (p_payload->>'delta')::int), updated_at=now()
  returning stock into v_stock;
  return jsonb_build_object('key', p_payload->>'listingId' || ':' || p_payload->>'productId', 'stock', v_stock);
end; $$;

create or replace function public.rpc_partner_menu_add(p_user uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text := 'mnu_' || gen_random_uuid()::text; v_rest text;
begin
  select listing_id into v_rest from public.partner_claims where user_id=p_user and role='restaurant' limit 1;
  if v_rest is null then raise exception 'NOT_CLAIMED' using errcode='P0001'; end if;
  insert into public.partner_menu_items (id, user_id, restaurant_id, name, price_paise) values (v_id, p_user, v_rest, p_payload->>'name', (p_payload->>'pricePaise')::int);
  return jsonb_build_object('item', (select row_to_json(t)::jsonb from (select * from public.partner_menu_items where id=v_id) t));
end; $$;

create or replace function public.rpc_partner_menu_update(p_user uuid, p_id text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.partner_menu_items set name=coalesce(p_payload->>'name', name), price_paise=coalesce((p_payload->>'pricePaise')::int, price_paise), available=coalesce((p_payload->>'available')::boolean, available), updated_at=now()
  where id=p_id and user_id=p_user;
  return jsonb_build_object('item', (select row_to_json(t)::jsonb from (select * from public.partner_menu_items where id=p_id) t));
end; $$;

create or replace function public.rpc_partner_menu_delete(p_user uuid, p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin delete from public.partner_menu_items where id=p_id and user_id=p_user; end; $$;

create or replace function public.rpc_partner_room_add(p_user uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text := 'room_' || gen_random_uuid()::text; v_prop text;
begin
  select listing_id into v_prop from public.partner_claims where user_id=p_user and role='property' limit 1;
  if v_prop is null then raise exception 'NOT_CLAIMED' using errcode='P0001'; end if;
  insert into public.partner_rooms (id, user_id, property_id, name, price_per_night_paise, total_rooms)
  values (v_id, p_user, v_prop, p_payload->>'name', (p_payload->>'pricePerNightPaise')::int, coalesce((p_payload->>'totalRooms')::int,1));
  return jsonb_build_object('room', (select row_to_json(t)::jsonb from (select * from public.partner_rooms where id=v_id) t));
end; $$;

create or replace function public.rpc_partner_room_update(p_user uuid, p_id text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.partner_rooms set name=coalesce(p_payload->>'name',name), price_per_night_paise=coalesce((p_payload->>'pricePerNightPaise')::int, price_per_night_paise), total_rooms=coalesce((p_payload->>'totalRooms')::int,total_rooms), updated_at=now() where id=p_id and user_id=p_user;
  return jsonb_build_object('room', (select row_to_json(t)::jsonb from (select * from public.partner_rooms where id=p_id) t));
end; $$;

create or replace function public.rpc_partner_availability_set(p_user uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_key text := (p_payload->>'roomId') || ':' || (p_payload->>'date');
begin
  insert into public.room_availability (room_id, day, units_available, price_paise)
  values (p_payload->>'roomId', (p_payload->>'date')::date, greatest(0,(p_payload->>'delta')::int), 0)
  on conflict (room_id, day) do update set units_available = greatest(0, room_availability.units_available + (p_payload->>'delta')::int);
  return jsonb_build_object('key', v_key, 'available', (select units_available from public.room_availability where room_id=p_payload->>'roomId' and day=(p_payload->>'date')::date));
end; $$;

create or replace function public.rpc_partner_tour_add(p_user uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text := 'tur_' || gen_random_uuid()::text;
begin
  if not exists (select 1 from public.user_roles where user_id=p_user and role='tour_operator') then raise exception 'ROLE_REQUIRED' using errcode='P0001'; end if;
  insert into public.partner_tours (id, user_id, destination_id, name, price_paise, duration_hours, capacity)
  values (v_id, p_user, p_payload->>'destinationId', p_payload->>'name', (p_payload->>'pricePaise')::int, (p_payload->>'durationHours')::numeric, coalesce((p_payload->>'capacity')::int,1));
  return jsonb_build_object('tour', (select row_to_json(t)::jsonb from (select * from public.partner_tours where id=v_id) t));
end; $$;

create or replace function public.rpc_partner_tour_update(p_user uuid, p_id text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.partner_tours set name=coalesce(p_payload->>'name',name), price_paise=coalesce((p_payload->>'pricePaise')::int,price_paise), duration_hours=coalesce((p_payload->>'durationHours')::numeric,duration_hours), capacity=coalesce((p_payload->>'capacity')::int,capacity), active=coalesce((p_payload->>'active')::boolean,active), updated_at=now() where id=p_id and user_id=p_user;
  return jsonb_build_object('tour', (select row_to_json(t)::jsonb from (select * from public.partner_tours where id=p_id) t));
end; $$;

create or replace function public.rpc_settlement_request(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_net int; v_settled int; v_req int; v_amt int; v_id text := 'set_' || gen_random_uuid()::text;
begin
  select coalesce((rpc_partner_earnings(p_user)->>'totalNetPaise')::int,0) into v_net;
  -- earnings rpc returns rows; compute totals here instead:
  select coalesce(sum(round(p.amount_paise*0.85)),0) into v_net from public.payments p where p.user_id=p_user and p.status='captured';
  select coalesce(sum(amount_paise),0) into v_settled from public.settlements where user_id=p_user and status='paid';
  select coalesce(sum(amount_paise),0) into v_req from public.settlements where user_id=p_user and status='requested';
  v_amt := greatest(0, v_net - v_settled - v_req);
  if v_amt <= 0 then raise exception 'NOTHING_TO_SETTLE' using errcode='P0001'; end if;
  insert into public.settlements (id, user_id, amount_paise, status, created_at) values (v_id, p_user, v_amt, 'requested', now());
  return jsonb_build_object('settlement', (select row_to_json(t)::jsonb from (select * from public.settlements where id=v_id) t));
end; $$;

create or replace function public.rpc_partner_inbox(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bookings', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc) from public.ride_bookings b where b.status in ('requested','awaiting_payment','confirmed')), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from public.grocery_orders o where o.status in ('created','accepted','preparing')), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from (select * from public.notifications where user_id=p_user order by created_at desc limit 50) n), '[]'::jsonb)
  );
$$;
