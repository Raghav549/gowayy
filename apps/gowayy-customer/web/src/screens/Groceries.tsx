import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ShoppingBasket, Search, Plus, Minus, ArrowRight, PackageCheck, Clock3 } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { formatINR } from '@gowayy/shared-utils';
import { priceOrder } from '@gowayy/pricing-engine';
import { client, idemKey } from '../lib/client';
import { usePageMeta, useRequireAuth } from '../lib/guards';
import { useCart } from '../store/useCart';
import { useJourney } from '../store/useJourney';
import { useUI } from '../store/useUI';
import { Field, SectionHead, ImageFrame, PriceLines, EmptyState, DemoBanner } from '../components/ui';
import { DemoListingBadge, ConnectedRecommendations, DataNotice } from './shared';

export function Groceries() {
  usePageMeta('Grocery delivery', 'Shop independent local stores with their own inventory, delivery coverage and slots.');
  const [query, setQuery] = useState('');
  const stores = catalogue.groceryStores.filter((s) => (!query || `${s.name} ${s.products.map((p) => p.name).join(' ')}`.toLowerCase().includes(query.toLowerCase())));
  return (
    <div>
      <SectionHead eyebrow="Local commerce" title="Grocery delivery" subtitle="Every store has independent seeded inventory and its own delivery coverage." />
      <div className="row" style={{ marginBottom: 18, maxWidth: 480 }}><Search size={17} /><input className="input" placeholder="Search stores or products…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <div className="grid-3">
        {stores.map((s) => (
          <Link key={s.id} to={`/groceries/${s.id}`} className="card card--pad0 card--hover" style={{ display: 'block' }}>
            {s.image && <ImageFrame asset={s.image} variant="16-9" />}
            <div style={{ padding: 16 }}>
              <div className="between"><strong>{s.name}</strong><DemoListingBadge /></div>
              <p className="small muted" style={{ marginTop: 6 }}>{catalogue.destinations.find((d) => d.id === s.destinationId)?.name} · {s.deliveryCoverageKm} km coverage</p>
              <p className="small" style={{ marginTop: 10 }}>{s.products.length} products · {s.products.filter((p) => p.stock > 0).length} in stock</p>
              <div className="row tiny muted" style={{ marginTop: 10 }}><Clock3 size={13} /> {s.slots.join(' · ')}</div>
            </div>
          </Link>
        ))}
      </div>
      {stores.length === 0 && <EmptyState title="No stores match" body="Try another product name." />}
      <DataNotice />
    </div>
  );
}

export function StoreDetail() {
  const { id } = useParams();
  const store = catalogue.groceryStores.find((s) => s.id === id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const requireAuth = useRequireAuth();
  const journey = useJourney((s) => s.journey);
  const showToast = useUI((s) => s.showToast);
  const cart = useCart();
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [address, setAddress] = useState('');
  const [slot, setSlot] = useState(store?.slots[0] ?? '');
  const [substitution, setSubstitution] = useState<'allow' | 'contact_me' | 'no_substitutes'>('contact_me');
  const [coupon, setCoupon] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  usePageMeta(store?.name ?? 'Grocery store');

  const categories = store ? Array.from(new Set(store.products.map((p) => p.category))) : [];
  const products = store?.products.filter((p) => (!category || p.category === category) && (!query || p.name.toLowerCase().includes(query.toLowerCase()))) ?? [];
  const estimate = useMemo(() => (cart.items.length ? priceOrder({ items: cart.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPricePaise: i.unitPricePaise })), deliveryFeePaise: 3000, taxPercent: 5, service: 'grocery' }) : null), [cart.items]);
  if (!store) return <EmptyState title="Store not found" body="This store is not in the catalogue." action={<Link className="btn btn--primary" to="/groceries">All stores</Link>} />;

  const checkout = async () => {
    if (!requireAuth()) return;
    if (cart.listingId !== store.id || cart.items.length === 0) { setError('Add at least one product'); return; }
    if (address.trim().length < 5) { setError('Enter a delivery address'); return; }
    setSubmitting(true); setError(null);
    try {
      const order = await client.placeOrder({ listingId: store.id, service: 'grocery',
        items: cart.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unitPricePaise: i.unitPricePaise, options: [] })),
        deliveryAddress: address, instructions: '', slot, substitution, coupon: coupon || null, journeyId: journey?.id ?? null }, idemKey());
      cart.clear(); await qc.invalidateQueries({ queryKey: ['orders'] });
      showToast('Grocery order placed — stock reserved', 'success');
      navigate(`/checkout?order=${order.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not place order'); }
    finally { setSubmitting(false); }
  };

  return (
    <div>
      <Link className="btn btn--ghost btn--sm" to="/groceries">← Stores</Link>
      <div style={{ marginTop: 12 }}>{store.image && <ImageFrame asset={store.image} variant="hero" />}</div>
      <div className="between row--wrap" style={{ marginTop: 20 }}>
        <div><div className="eyebrow">Independent inventory</div><h1 style={{ marginTop: 6 }}>{store.name}</h1><p className="small muted" style={{ marginTop: 8 }}>{store.deliveryCoverageKm} km coverage · {store.slots.length} delivery slots</p></div>
        <DemoListingBadge />
      </div>

      <div className="grid-2 section" style={{ marginTop: 24 }}>
        <div>
          <SectionHead eyebrow="Products" title="Shop this store" subtitle="Stock counts come from seeded inventory; the server re-checks and decrements them at checkout." />
          <input className="input" placeholder="Search products…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 12 }} />
          <div className="chips" style={{ marginBottom: 14 }}><button className={`chip ${!category ? 'active' : ''}`} onClick={() => setCategory('')}>All</button>{categories.map((c) => <button key={c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>{c}</button>)}</div>
          <div className="grid-2" style={{ gap: 10 }}>
            {products.map((p) => {
              const inCart = cart.items.find((i) => i.id === p.id);
              return (
                <div className="card card--flat" key={p.id}>
                  <div className="between"><strong className="small">{p.name}</strong>{p.stock > 0 ? <span className="badge badge--success">{p.stock} in stock</span> : <span className="badge badge--danger">Out of stock</span>}</div>
                  <div className="tiny muted" style={{ marginTop: 4 }}>{p.category} · {p.unit}{p.substitutionAllowed ? ' · substitutes allowed' : ' · no substitutes'}</div>
                  <div className="between" style={{ marginTop: 12 }}>
                    <strong className="small">{formatINR(p.pricePaise)}</strong>
                    {inCart ? <div className="row"><button className="btn btn--ghost btn--sm" onClick={() => cart.quantity(p.id, -1)}><Minus size={13} /></button><strong>{inCart.quantity}</strong><button className="btn btn--ghost btn--sm" disabled={inCart.quantity >= p.stock} onClick={() => cart.quantity(p.id, 1)}><Plus size={13} /></button></div>
                      : <button className="btn btn--secondary btn--sm" disabled={p.stock <= 0} onClick={() => cart.add(store.id, { id: p.id, name: p.name, quantity: 1, unitPricePaise: p.pricePaise, options: [] })}><Plus size={13} /> Add</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="between"><h3>Your basket</h3><ShoppingBasket size={18} /></div>
          {cart.listingId !== store.id || cart.items.length === 0 ? <p className="small muted" style={{ marginTop: 12 }}>Your basket is empty.</p> : (
            <div className="list" style={{ marginTop: 14 }}>
              {cart.items.map((i) => <div key={i.id} className="row between small"><span className="list-row__body"><span className="list-row__title">{i.name}</span><span className="list-row__sub">{formatINR(i.unitPricePaise)} / {store.products.find((p) => p.id === i.id)?.unit}</span></span><button className="btn btn--ghost btn--sm" onClick={() => cart.remove(i.id)}>Remove</button></div>)}
            </div>
          )}
          {estimate && <div style={{ marginTop: 16 }}><PriceLines price={estimate} title="Estimated total (before coupon)" /></div>}
          <div className="divider" />
          <Field label="Delivery address"><input className="input" placeholder="Street, area, landmark, PIN" value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          <Field label="Delivery slot"><select className="select" value={slot} onChange={(e) => setSlot(e.target.value)}>{store.slots.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
          <Field label="Substitution preference"><select className="select" value={substitution} onChange={(e) => setSubstitution(e.target.value as typeof substitution)}><option value="contact_me">Contact me before substituting</option><option value="allow">Allow equivalent substitutes</option><option value="no_substitutes">No substitutes — refund missing items</option></select></Field>
          <Field label="Coupon code" hint="GOWAYY100 or WELCOME10"><input className="input" placeholder="Optional" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} /></Field>
          {error && <div className="notice notice--demo" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
          <button className="btn btn--primary btn--block" onClick={() => void checkout()} disabled={submitting || cart.items.length === 0}>{submitting ? 'Placing order…' : 'Checkout'} <ArrowRight size={17} /></button>
          <p className="tiny muted row" style={{ marginTop: 8 }}><PackageCheck size={13} /> Stock is reserved only after server validation.</p>
        </div>
      </div>
      <DemoBanner>Grocery partner functions (inventory, pricing, incoming orders) live in Partner mode — no admin panel exists.</DemoBanner>
      <ConnectedRecommendations destinationId={journey?.destinationId ?? store.destinationId} />
    </div>
  );
}
