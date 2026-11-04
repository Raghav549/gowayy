import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { UtensilsCrossed, Search, Plus, Minus, ShoppingBag, ArrowRight, Clock3, Tag } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { formatINR } from '@gowayy/shared-utils';
import { priceOrder } from '@gowayy/pricing-engine';
import { client, idemKey } from '../lib/client';
import { usePageMeta, useRequireAuth } from '../lib/guards';
import { useCart, type CartItem } from '../store/useCart';
import { useJourney } from '../store/useJourney';
import { useUI } from '../store/useUI';
import { Field, SectionHead, ImageFrame, PriceLines, EmptyState, DemoBanner } from '../components/ui';
import { DemoListingBadge, ConnectedRecommendations, DataNotice } from './shared';

export function Food() {
  usePageMeta('Food delivery', 'Discover restaurants, browse menus, customise dishes and place delivery orders with server-checked prices and stock.');
  const [query, setQuery] = useState('');
  const [cuisine, setCuisine] = useState('');
  const cuisines = Array.from(new Set(catalogue.restaurants.flatMap((r) => r.cuisines)));
  const list = catalogue.restaurants.filter((r) =>
    (!cuisine || r.cuisines.includes(cuisine)) &&
    (!query || `${r.name} ${r.cuisines.join(' ')} ${r.menu.map((m) => m.name).join(' ')}`.toLowerCase().includes(query.toLowerCase())));
  return (
    <div>
      <SectionHead eyebrow="Restaurant marketplace" title="Food delivery" subtitle="Menus, customisations, cart and delivery — with prices recomputed by the server." />
      <div className="row row--wrap" style={{ gap: 10, marginBottom: 18 }}>
        <div className="row" style={{ flex: 1, minWidth: 220 }}><Search size={17} /><input className="input" placeholder="Search restaurants or dishes…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      </div>
      <div className="chips" style={{ marginBottom: 18 }}><button className={`chip ${!cuisine ? 'active' : ''}`} onClick={() => setCuisine('')}>All cuisines</button>{cuisines.map((c) => <button key={c} className={`chip ${cuisine === c ? 'active' : ''}`} onClick={() => setCuisine(c)}>{c}</button>)}</div>
      <div className="grid-3">
        {list.map((r) => (
          <Link key={r.id} to={`/food/${r.id}`} className="card card--pad0 card--hover" style={{ display: 'block' }}>
            {r.image && <ImageFrame asset={r.image} variant="16-9" />}
            <div style={{ padding: 16 }}>
              <div className="between"><strong>{r.name}</strong><DemoListingBadge /></div>
              <p className="small muted" style={{ marginTop: 6 }}>{r.cuisines.join(' · ')} · {r.openingHours}</p>
              <p className="small" style={{ marginTop: 10 }}>{r.menu.slice(0, 3).map((m) => m.name).join(', ')}…</p>
              <div className="row tiny muted" style={{ marginTop: 12 }}><Clock3 size={13} /> ~{r.prepMinutes} min prep · seeded</div>
            </div>
          </Link>
        ))}
      </div>
      {list.length === 0 && <EmptyState title="No restaurants match" body="Try a different cuisine or dish." />}
      <DataNotice />
    </div>
  );
}

export function RestaurantDetail() {
  const { id } = useParams();
  const restaurant = catalogue.restaurants.find((r) => r.id === id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const requireAuth = useRequireAuth();
  const journey = useJourney((s) => s.journey);
  const showToast = useUI((s) => s.showToast);
  const cart = useCart();
  const [category, setCategory] = useState('');
  const [extras, setExtras] = useState<Record<string, boolean>>({});
  const [address, setAddress] = useState('');
  const [instructions, setInstructions] = useState('');
  const [coupon, setCoupon] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  usePageMeta(restaurant?.name ?? 'Restaurant');

  const categories = restaurant ? Array.from(new Set(restaurant.menu.map((m) => m.category))) : [];
  const estimate = useMemo(() => (cart.items.length ? priceOrder({ items: cart.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPricePaise: i.unitPricePaise })), deliveryFeePaise: 4000, taxPercent: 5, service: 'food' }) : null), [cart.items]);
  if (!restaurant) return <EmptyState title="Restaurant not found" body="This listing is not in the catalogue." action={<Link className="btn btn--primary" to="/food">All restaurants</Link>} />;

  const add = (item: typeof restaurant.menu[number]) => {
    const options = extras[item.id] && item.customizations[0] ? [item.customizations[0].id] : [];
    const unitPricePaise = item.pricePaise + (options.length ? item.customizations[0].extraPaise : 0);
    cart.add(restaurant.id, { id: item.id, name: item.name + (options.length ? ' (extra portion)' : ''), quantity: 1, unitPricePaise, options });
  };
  const checkout = async () => {
    if (!requireAuth()) return;
    if (cart.listingId !== restaurant.id || cart.items.length === 0) { setError('Add at least one item to the cart'); return; }
    if (address.trim().length < 5) { setError('Enter a delivery address'); return; }
    setSubmitting(true); setError(null);
    try {
      const order = await client.placeOrder({ listingId: restaurant.id, service: 'food',
        items: cart.items.map((i) => ({ id: i.id.split('__')[0], name: i.name, quantity: i.quantity, unitPricePaise: i.unitPricePaise, options: i.options })),
        deliveryAddress: address, instructions, slot: null, coupon: coupon || null, journeyId: journey?.id ?? null }, idemKey());
      cart.clear(); await qc.invalidateQueries({ queryKey: ['orders'] });
      showToast('Order placed — awaiting restaurant acceptance', 'success');
      navigate(`/checkout?order=${order.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not place order'); }
    finally { setSubmitting(false); }
  };

  return (
    <div>
      <Link className="btn btn--ghost btn--sm" to="/food">← Restaurants</Link>
      <div style={{ marginTop: 12 }}>{restaurant.image && <ImageFrame asset={restaurant.image} variant="hero" />}</div>
      <div className="between row--wrap" style={{ marginTop: 20 }}>
        <div><div className="eyebrow">{restaurant.cuisines.join(' · ')}</div><h1 style={{ marginTop: 6 }}>{restaurant.name}</h1><p className="muted small" style={{ marginTop: 8 }}>{restaurant.openingHours} · ~{restaurant.prepMinutes} min preparation</p></div>
        <DemoListingBadge />
      </div>

      <div className="grid-2 section" style={{ marginTop: 26 }}>
        <div>
          <SectionHead eyebrow="Menu" title="Choose your dishes" subtitle="Prices and availability are re-checked by the server at checkout." />
          <div className="chips" style={{ marginBottom: 14 }}><button className={`chip ${!category ? 'active' : ''}`} onClick={() => setCategory('')}>All</button>{categories.map((c) => <button key={c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>{c}</button>)}</div>
          <div className="list">
            {restaurant.menu.filter((m) => !category || m.category === category).map((m) => (
              <div key={m.id} className="list-row">
                <div className="list-row__body">
                  <div className="list-row__title">{m.name} {m.vegetarian && <span className="badge badge--success">Veg</span>}</div>
                  <div className="list-row__sub">{m.description}</div>
                  <div className="small" style={{ marginTop: 6 }}><strong>{formatINR(m.pricePaise)}</strong>{m.customizations[0] && <label className="tiny muted" style={{ marginLeft: 12, cursor: 'pointer' }}><input type="checkbox" checked={Boolean(extras[m.id])} onChange={(e) => setExtras({ ...extras, [m.id]: e.target.checked })} /> {m.customizations[0].label} +{formatINR(m.customizations[0].extraPaise)}</label>}</div>
                </div>
                <button className="btn btn--secondary btn--sm" onClick={() => add(m)}><Plus size={14} /> Add</button>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="between"><h3>Your cart</h3><ShoppingBag size={18} /></div>
          {cart.listingId !== restaurant.id || cart.items.length === 0 ? <p className="small muted" style={{ marginTop: 12 }}>Nothing here yet. Add a dish to get started.</p> : (
            <div className="list" style={{ marginTop: 14 }}>
              {cart.items.map((i) => <div key={`${i.id}-${i.options.join()}`} className="row between small">
                <span className="list-row__body"><span className="list-row__title">{i.name}</span><span className="list-row__sub">{formatINR(i.unitPricePaise)} each</span></span>
                <div className="row"><button className="btn btn--ghost btn--sm" aria-label="Decrease" onClick={() => cart.quantity(i.id, -1)}><Minus size={13} /></button><strong>{i.quantity}</strong><button className="btn btn--ghost btn--sm" aria-label="Increase" onClick={() => cart.quantity(i.id, 1)}><Plus size={13} /></button></div>
              </div>)}
            </div>
          )}
          {estimate && <div style={{ marginTop: 16 }}><PriceLines price={estimate} title="Estimated total (before coupon)" /></div>}
          <div className="divider" />
          <Field label="Delivery address"><input className="input" placeholder="Street, area, landmark, PIN" value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          <Field label="Instructions (optional)"><textarea className="textarea" placeholder="e.g. leave at reception" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></Field>
          <Field label="Coupon code" hint="Demo codes: GOWAYY100 (₹100 off over ₹300), WELCOME10 (10% off, capped at ₹200)."><div className="row"><Tag size={16} /><input className="input" placeholder="Optional" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} /></div></Field>
          {error && <div className="notice notice--demo" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
          <button className="btn btn--primary btn--block" onClick={() => void checkout()} disabled={submitting || cart.items.length === 0}>{submitting ? 'Placing order…' : 'Place order'} <ArrowRight size={17} /></button>
          <p className="tiny muted" style={{ marginTop: 8 }}>A placed order is not confirmed until the restaurant partner accepts it.</p>
        </div>
      </div>
      <DemoBanner>Restaurant partner functions (menu, inventory, incoming orders, order status) live in Partner mode — no admin panel exists.</DemoBanner>
      <ConnectedRecommendations destinationId={journey?.destinationId ?? restaurant.destinationId} title="Complete your journey" />
    </div>
  );
}
