import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, MapPin, CreditCard, ClipboardCheck, Wallet, Landmark, Banknote, Smartphone, Gift } from 'lucide-react';
import { formatINR } from '@gowayy/shared-utils';
import { client, idemKey } from '../lib/client';
import { useUI } from '../store/useUI';
import { usePageMeta } from '../lib/guards';
import { MascotState, Skeleton } from '../components/Mascot';

const STEPS = ['Address', 'Payment', 'Confirm order'] as const;
const METHOD_ICONS: Record<string, typeof Smartphone> = { upi: Smartphone, card: CreditCard, wallet: Wallet, netbanking: Landmark, emi: CreditCard, cod: Banknote };

export function CheckoutMarketplace() {
  usePageMeta('Checkout — GOWAYY');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [step, setStep] = useState(0);
  const [addressId, setAddressId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [coupon, setCoupon] = useState('');
  const [method, setMethod] = useState('');
  const [slot, setSlot] = useState('standard');
  const [placed, setPlaced] = useState<{ reference: string; id: string } | null>(null);
  const [newAddr, setNewAddr] = useState({ label: '', line: '', city: '', pincode: '', phone: '' });
  const [showNewAddr, setShowNewAddr] = useState(false);

  const cart = useQuery({ queryKey: ['cart'], queryFn: () => client.cart() });
  const quote = useQuery({ queryKey: ['cart-quote', slot, coupon], queryFn: () => client.cartQuote({ deliverySlot: slot, coupon: coupon || undefined }) });
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: () => client.addresses() });
  const methods = useQuery({ queryKey: ['payment-methods', quote.data], queryFn: () => client.paymentMethods((quote.data as { quote: { totalPaise: number } })?.quote.totalPaise ?? 0), enabled: Boolean(quote.data) });

  const q = quote.data as { quote: { itemsPaise: number; protectionPaise: number; deliveryFeePaise: number; discountPaise: number; taxPaise: number; totalPaise: number; savingsPaise: number; appliedCoupon: string | null } } | undefined;
  const totalPaise = q?.quote.totalPaise ?? 0;

  const addAddress = useMutation({
    mutationFn: () => client.createAddress(newAddr),
    onSuccess: async (a) => { setAddressId((a as { id: string }).id); setShowNewAddr(false); setNewAddr({ label: '', line: '', city: '', pincode: '', phone: '' }); await qc.invalidateQueries({ queryKey: ['addresses'] }); },
    onError: (e: Error) => showToast(e.message),
  });
  const place = useMutation({
    mutationFn: async () => {
      const order = await client.checkout({ addressId, paymentMethod: method, deliverySlot: slot, coupon: coupon || undefined, instructions }, idemKey());
      if (method !== 'cod') {
        const p = await client.initPayment({ bookingId: null, orderId: order.id, method: 'upi', amountPaise: order.price.totalPaise, idempotencyKey: idemKey() });
        await client.captureSandboxPayment(p.id);
      }
      return order;
    },
    onSuccess: async (order) => {
      setPlaced({ reference: order.reference, id: order.id });
      setStep(2);
      await qc.invalidateQueries();
      showToast('Order placed — payment verified server-side', 'success');
    },
    onError: (e: Error) => showToast(e.message),
  });

  const methodList = (methods.data?.items ?? []) as Array<{ id: string; label: string; detail: string; available: boolean; unavailableReason?: string; recommended?: boolean; cashbackPaise?: number }>;
  const selectedAddress = useMemo(() => (addresses.data as Array<{ id: string; label: string; line: string; city: string; pincode: string }> | undefined)?.find((a) => a.id === addressId), [addresses.data, addressId]);

  if (cart.isLoading || quote.isLoading) return <div className="stack" aria-hidden="true"><Skeleton style={{ height: 48 }} /><Skeleton style={{ height: 300, borderRadius: 16 }} /></div>;
  if (!cart.data || cart.data.lines.length === 0) return <MascotState pose="idle-standing" title="Nothing to check out" body="Your cart is empty." action={<Link className="btn btn--primary" to="/categories">Browse products</Link>} />;
  if (placed) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <MascotState pose="success" title={`Order placed — ${placed.reference}`} body="Your payment was verified server-side through a signed provider event. The store has been notified." action={<div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 8 }}><Link className="btn btn--primary" to={`/orders`}>Track order</Link><Link className="btn btn--secondary" to="/categories">Continue shopping</Link></div>} />
      </div>
    );
  }

  return (
    <div className="stack">
      <h1 style={{ fontSize: 24 }}>Checkout</h1>
      <ol className="stepper">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'stepper__item stepper__item--active' : i < step ? 'stepper__item stepper__item--done' : 'stepper__item'}>
            <span className="stepper__dot">{i < step ? <CheckCircle2 size={16} /> : i + 1}</span>{s}
            {i < STEPS.length - 1 && <ChevronRight size={15} className="stepper__sep" />}
          </li>
        ))}
      </ol>

      <div className="cart-layout">
        <div className="stack">
          {step === 0 && (
            <div className="card">
              <h3 style={{ fontSize: 17 }}><MapPin size={17} style={{ verticalAlign: -3, marginRight: 6 }} />Delivery address</h3>
              <div className="stack" style={{ marginTop: 12 }}>
                {(addresses.data as Array<{ id: string; label: string; line: string; city: string; pincode: string; phone?: string }> | undefined ?? []).map((a) => (
                  <button key={a.id} className={`radio-row ${addressId === a.id ? 'radio-row--active' : ''}`} onClick={() => setAddressId(a.id)}>
                    <input type="radio" name="addr" checked={addressId === a.id} readOnly />
                    <span className="list-row__body"><span className="list-row__title small">{a.label} · {a.pincode}</span><span className="list-row__sub tiny muted">{a.line}, {a.city}</span></span>
                  </button>
                ))}
                {!(addresses.data ?? []).length && !showNewAddr && <p className="small muted">No saved addresses yet — add one below.</p>}
                {showNewAddr ? (
                  <div className="grid-2" style={{ gap: 10 }}>
                    <input className="input" placeholder="Label (Home/Office)" value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })} />
                    <input className="input" placeholder="Address line" value={newAddr.line} onChange={(e) => setNewAddr({ ...newAddr, line: e.target.value })} />
                    <input className="input" placeholder="City" value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} />
                    <input className="input" placeholder="PIN code" value={newAddr.pincode} onChange={(e) => setNewAddr({ ...newAddr, pincode: e.target.value })} />
                    <input className="input" placeholder="Phone" value={newAddr.phone} onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })} />
                    <button className="btn btn--secondary btn--sm" disabled={addAddress.isPending || !newAddr.line || !newAddr.city || !newAddr.pincode} onClick={() => addAddress.mutate()}>Save address</button>
                  </div>
                ) : (
                  <button className="btn btn--secondary btn--sm" style={{ alignSelf: 'start' }} onClick={() => setShowNewAddr(true)}>+ Add a new address</button>
                )}
              </div>
              <label className="field" style={{ marginTop: 14 }}><span className="label">Delivery instructions (optional)</span>
                <textarea className="input" rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Landmark, gate code…" /></label>
              <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}><button className="btn btn--primary" disabled={!addressId} onClick={() => setStep(1)}>Continue to payment</button></div>
            </div>
          )}

          {step === 1 && (
            <div className="card">
              <h3 style={{ fontSize: 17 }}><CreditCard size={17} style={{ verticalAlign: -3, marginRight: 6 }} />Payment method</h3>
              {selectedAddress && <p className="tiny muted" style={{ marginTop: 4 }}>Delivering to {selectedAddress.label}, {selectedAddress.city} {selectedAddress.pincode} · <button className="link btn--link" onClick={() => setStep(0)}>Change</button></p>}
              <div className="stack" style={{ marginTop: 12 }}>
                {methods.isLoading && <Skeleton style={{ height: 200 }} />}
                {methodList.map((m) => {
                  const Icon = METHOD_ICONS[m.id] ?? CreditCard;
                  return (
                    <button key={m.id} className={`radio-row ${method === m.id ? 'radio-row--active' : ''} ${!m.available ? 'radio-row--disabled' : ''}`} disabled={!m.available} onClick={() => setMethod(m.id)}>
                      <input type="radio" name="pm" checked={method === m.id} readOnly disabled={!m.available} />
                      <Icon size={18} style={{ color: m.available ? 'var(--gw-champagne)' : 'var(--gw-muted-silver)' }} />
                      <span className="list-row__body">
                        <span className="list-row__title small">{m.label} {m.recommended && <span className="badge badge--accent" style={{ marginLeft: 6 }}>Best offer</span>}</span>
                        <span className="list-row__sub tiny muted">{m.available ? m.detail : m.unavailableReason ?? 'Unavailable for this order'}{m.cashbackPaise ? ` · save ${formatINR(m.cashbackPaise)} cashback` : ''}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="tiny muted" style={{ marginTop: 10 }}>{methods.data?.note ?? 'Only genuinely integrated methods are selectable.'}</p>
              <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
                <button className="btn btn--secondary btn--sm" onClick={() => setStep(0)}>Back</button>
                <button className="btn btn--primary" disabled={!method || place.isPending} onClick={() => place.mutate()}>{place.isPending ? 'Placing order…' : 'Review & place order'}</button>
              </div>
            </div>
          )}

          {step === 2 && <div className="card"><h3><ClipboardCheck size={17} style={{ verticalAlign: -3, marginRight: 6 }} />Review</h3></div>}
        </div>

        <aside className="card cart-summary">
          <h3 style={{ fontSize: 16 }}>Order summary</h3>
          <div className="price-lines" style={{ marginTop: 10 }}>
            <div className="line"><span>Items</span><span>{formatINR(q?.quote.itemsPaise ?? 0)}</span></div>
            {(q?.quote.protectionPaise ?? 0) > 0 && <div className="line"><span>Protection</span><span>{formatINR(q!.quote.protectionPaise)}</span></div>}
            <div className="line"><span>Delivery</span><span>{(q?.quote.deliveryFeePaise ?? 0) === 0 ? 'FREE' : formatINR(q!.quote.deliveryFeePaise)}</span></div>
            {(q?.quote.discountPaise ?? 0) > 0 && <div className="line" style={{ color: 'var(--gw-success)' }}><span>Coupon {q?.quote.appliedCoupon}</span><span>−{formatINR(q!.quote.discountPaise)}</span></div>}
            <div className="line"><span>GST (5%)</span><span>{formatINR(q?.quote.taxPaise ?? 0)}</span></div>
            <div className="line total"><span>Total</span><span>{formatINR(totalPaise)}</span></div>
          </div>
          {(q?.quote.savingsPaise ?? 0) > 0 && <div className="savings-banner">You save <strong>{formatINR(q!.quote.savingsPaise)}</strong> on this order</div>}
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <input className="input" placeholder="Gift card / promo code" value={coupon} onChange={(e) => setCoupon(e.target.value)} aria-label="Promo code" />
            <button className="btn btn--secondary btn--sm" onClick={() => qc.invalidateQueries({ queryKey: ['cart-quote'] })}>Apply</button>
          </div>
          <div className="eyebrow" style={{ marginTop: 14 }}>Delivery speed</div>
          <select className="select" value={slot} onChange={(e) => setSlot(e.target.value)} style={{ marginTop: 6 }}>
            <option value="standard">Standard (free)</option>
            <option value="express">Express (+₹99)</option>
          </select>
          <button className="btn btn--primary btn--block" style={{ marginTop: 14 }} disabled={!method || step < 1 || place.isPending} onClick={() => place.mutate()}>
            <Gift size={15} style={{ marginRight: 6 }} /> Place order · {formatINR(totalPaise)}
          </button>
        </aside>
      </div>
    </div>
  );
}
