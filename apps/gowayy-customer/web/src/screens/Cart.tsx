import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, ShieldCheck, Trash2, Truck, Tag } from 'lucide-react';
import { client } from '../lib/client';
import { useUI } from '../store/useUI';
import { formatINR } from '@gowayy/shared-utils';
import { MascotState, Skeleton } from '../components/Mascot';

interface CartLineView {
  id: string; productId: string; productName: string; brand: string; variantLabel: string;
  quantity: number; unitPricePaise: number; mrpPaise: number; stock: number; discountPercent: number;
  protectionPlanId: string | null; lineTotalPaise: number;
}
interface QuoteView { quote: { itemsPaise: number; protectionPaise: number; deliveryFeePaise: number; discountPaise: number; taxPaise: number; totalPaise: number; savingsPaise: number; mrpTotalPaise: number; appliedCoupon: string | null }; deliveryOptions: Array<{ id: string; label: string; feePaise: number; eta: string }> }

export function Cart() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [slot, setSlot] = useState('standard');
  const [coupon, setCoupon] = useState('');

  const cart = useQuery({ queryKey: ['cart'], queryFn: () => client.cart() });
  const quote = useQuery({ queryKey: ['cart-quote', slot, coupon], queryFn: () => client.cartQuote({ deliverySlot: slot, coupon: coupon || undefined }), enabled: (cart.data?.lines.length ?? 0) > 0 });

  const changeQty = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => client.updateCartLine(id, { quantity }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['cart'] }); await qc.invalidateQueries({ queryKey: ['cart-quote'] }); },
    onError: (e: Error) => showToast(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => client.removeCartLine(id),
    onSuccess: async () => { showToast('Removed from cart'); await qc.invalidateQueries({ queryKey: ['cart'] }); await qc.invalidateQueries({ queryKey: ['cart-quote'] }); },
  });
  const saveForLater = useMutation({
    mutationFn: async (line: CartLineView) => { await client.addToWishlist(line.productId); await client.removeCartLine(line.id); },
    onSuccess: async () => { showToast('Saved to wishlist'); await qc.invalidateQueries({ queryKey: ['cart'] }); },
  });

  const lines = (cart.data?.lines ?? []) as CartLineView[];
  const q = quote.data as QuoteView | undefined;

  if (cart.isLoading) return <div className="stack" aria-hidden="true"><Skeleton style={{ height: 120, borderRadius: 16 }} /><Skeleton style={{ height: 120, borderRadius: 16 }} /><Skeleton style={{ height: 90, borderRadius: 16 }} /></div>;
  if (lines.length === 0) return <MascotState pose="idle-standing" title="Your cart is empty" body="Browse the marketplace for local Himalayan products and travel essentials." action={<Link className="btn btn--primary" to="/categories">Browse categories</Link>} />;

  return (
    <div className="stack">
      <h1 style={{ fontSize: 24 }}>Cart ({cart.data?.itemCount} items)</h1>
      <div className="cart-layout">
        <div className="stack">
          {lines.map((l) => (
            <div className="card cart-line" key={l.id}>
              <div className="cart-line__main">
                <strong className="small">{l.brand}</strong>
                <Link className="link" to={`/products/${l.productId}`}>{l.productName}</Link>
                <span className="tiny muted">Variant: {l.variantLabel} · {l.stock > 0 ? `${l.stock} in stock` : 'Out of stock'}</span>
                <div className="row" style={{ gap: 8, marginTop: 6 }}>
                  <span style={{ fontWeight: 800 }}>{formatINR(l.unitPricePaise)}</span>
                  {l.mrpPaise > l.unitPricePaise && <span className="tiny muted" style={{ textDecoration: 'line-through' }}>{formatINR(l.mrpPaise)}</span>}
                  {l.discountPercent > 0 && <span className="badge badge--success">↓ {l.discountPercent}%</span>}
                  {l.protectionPlanId && <span className="badge badge--accent"><ShieldCheck size={12} /> protection added</span>}
                </div>
              </div>
              <div className="cart-line__side">
                <div className="qty">
                  <button aria-label="Decrease" onClick={() => changeQty.mutate({ id: l.id, quantity: l.quantity - 1 })}><Minus size={14} /></button>
                  <span>{l.quantity}</span>
                  <button aria-label="Increase" disabled={l.quantity >= l.stock} onClick={() => changeQty.mutate({ id: l.id, quantity: l.quantity + 1 })}><Plus size={14} /></button>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn--ghost btn--sm" onClick={() => void saveForLater.mutate(l)}>Save for later</button>
                  <button className="icon-btn" aria-label="Remove" onClick={() => remove.mutate(l.id)}><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
          <div className="card">
            <div className="eyebrow"><Truck size={13} style={{ verticalAlign: -2 }} /> Delivery speed</div>
            <div className="stack" style={{ marginTop: 8 }}>
              {(q?.deliveryOptions ?? [{ id: 'standard', label: 'Standard delivery', feePaise: 0, eta: '2–4 days within store coverage' }]).map((o) => (
                <label key={o.id} className={`radio-row ${slot === o.id ? 'radio-row--active' : ''}`}>
                  <input type="radio" name="slot" checked={slot === o.id} onChange={() => setSlot(o.id)} />
                  <span className="list-row__body"><span className="list-row__title small">{o.label}</span><span className="list-row__sub tiny muted">{o.eta}</span></span>
                  <strong className="small">{o.feePaise === 0 ? 'FREE' : formatINR(o.feePaise)}</strong>
                </label>
              ))}
            </div>
          </div>
        </div>

        <aside className="card cart-summary">
          <h3 style={{ fontSize: 16 }}>Order summary</h3>
          {q ? (
            <div className="price-lines" style={{ marginTop: 10 }}>
              <div className="line"><span>Items ({cart.data?.itemCount})</span><span>{formatINR(q.quote.itemsPaise)}</span></div>
              {q.quote.protectionPaise > 0 && <div className="line"><span>Protection</span><span>{formatINR(q.quote.protectionPaise)}</span></div>}
              <div className="line"><span>Delivery</span><span>{q.quote.deliveryFeePaise === 0 ? 'FREE' : formatINR(q.quote.deliveryFeePaise)}</span></div>
              {q.quote.discountPaise > 0 && <div className="line" style={{ color: 'var(--gw-success)' }}><span>Discount ({q.quote.appliedCoupon})</span><span>−{formatINR(q.quote.discountPaise)}</span></div>}
              <div className="line"><span>GST (5%)</span><span>{formatINR(q.quote.taxPaise)}</span></div>
              <div className="line total"><span>Total</span><span>{formatINR(q.quote.totalPaise)}</span></div>
            </div>
          ) : <p className="small muted" style={{ marginTop: 10 }}>Calculating…</p>}
          {q && q.quote.savingsPaise > 0 && <div className="savings-banner">You'll save <strong>{formatINR(q.quote.savingsPaise)}</strong> on this order</div>}
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <input className="input" placeholder="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value)} aria-label="Coupon code" />
            <button className="btn btn--secondary btn--sm" onClick={() => qc.invalidateQueries({ queryKey: ['cart-quote'] })}><Tag size={14} /> Apply</button>
          </div>
          <button className="btn btn--primary btn--block" style={{ marginTop: 14 }} onClick={() => navigate('/checkout')}>Proceed to buy · {q ? formatINR(q.quote.totalPaise) : ''}</button>
          <p className="tiny muted" style={{ marginTop: 10 }}>Prices and stock are re-validated by the server at checkout. Demo store data is labelled as such.</p>
        </aside>
      </div>
    </div>
  );
}
