import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, CreditCard, Landmark, MapPin, Minus, Plus,
  ShieldCheck, Smartphone, Truck, Banknote, PackageCheck, Receipt, Home, Trash2,
} from 'lucide-react';
import { formatINR } from '@gowayy/shared-utils';
import { client, idemKey } from '../lib/client';
import { useUI } from '../store/useUI';
import { usePageMeta, apiErrorText } from '../lib/guards';
import { downloadInvoice } from '../lib/invoice';
import { completePayment, type PaymentAction } from '../lib/payments';
import { Skeleton, MascotState } from '../components/Mascot';
import { Stepper } from '../components/ui';

type Step = 'address' | 'summary' | 'payment' | 'success';
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'address', label: 'Delivery details' },
  { id: 'summary', label: 'Order summary' },
  { id: 'payment', label: 'Payment' },
  { id: 'success', label: 'Confirmation' },
];

interface AddressView {
  id: string; label: string; line: string; city: string; pincode: string; name?: string; phone?: string;
  state?: string; area?: string; landmark?: string; house?: string; building?: string; road?: string; isDefault?: boolean;
}
interface QuoteView {
  quote: { itemsPaise: number; protectionPaise: number; deliveryFeePaise: number; discountPaise: number; taxPaise: number; totalPaise: number; savingsPaise: number; mrpTotalPaise: number; appliedCoupon: string | null };
  lines: Array<{ id: string; productId: string; productName: string; variantLabel: string; quantity: number; unitPricePaise: number; mrpPaise: number; lineTotalPaise: number; stock: number }>;
  deliveryOptions: Array<{ id: string; label: string; feePaise: number; eta: string }>;
}
interface MethodView { id: string; label: string; detail: string; available: boolean; unavailableReason?: string; integrated: boolean; recommended?: boolean }
interface OrderView {
  id: string; reference: string; status: string; service: string;
  items: Array<{ id: string; name: string; quantity: number; unitPricePaise: number }>;
  price: { totalPaise: number; lines: Array<{ label: string; paise: number }> };
  deliveryAddress?: AddressView; deliveryCode?: string | null; paymentStatus?: string; paymentMethod?: string;
  listingId?: string; createdAt: string;
}

const emptyAddress = {
  label: 'Home', name: '', phone: '', altPhone: '', house: '', building: '', road: '', area: '', line2: '',
  landmark: '', city: '', state: 'West Bengal', pincode: '', isDefault: true,
};

const METHOD_ICONS: Record<string, typeof Smartphone> = { upi: Smartphone, card: CreditCard, netbanking: Landmark, cod: Banknote, wallet: CreditCard };

export function CheckoutFlow() {
  usePageMeta('Checkout — GOWAYY');
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const step = (params.get('step') as Step | null) ?? 'address';
  const placedId = params.get('order') ?? '';
  const [addressId, setAddressId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyAddress });
  const [instructions, setInstructions] = useState('');
  const [coupon, setCoupon] = useState('');
  const [couponApplied, setCouponApplied] = useState('');
  const [slot, setSlot] = useState('standard');
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const cart = useQuery({ queryKey: ['cart'], queryFn: () => client.cart() });
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: () => client.addresses() });
  const quote = useQuery({
    queryKey: ['cart-quote', slot, couponApplied],
    queryFn: () => client.cartQuote({ deliverySlot: slot, coupon: couponApplied || undefined }) as unknown as Promise<QuoteView>,
    enabled: (cart.data?.lines.length ?? 0) > 0,
  });
  const methods = useQuery({
    queryKey: ['payment-methods', quote.data?.quote.totalPaise],
    queryFn: async () => client.paymentMethods(quote.data?.quote.totalPaise ?? 0) as unknown as Promise<{ items: MethodView[] }>,
    enabled: Boolean(quote.data) && step === 'payment',
  });
  const placed = useQuery({
    queryKey: ['order-detail', placedId],
    queryFn: async () => (await client.orderDetail?.(placedId)) as unknown as { order: OrderView; payment: { status: string } | null },
    enabled: Boolean(placedId) && step === 'success',
    refetchInterval: (query) => ['captured', 'failed', 'refunded'].includes(query.state.data?.payment?.status ?? '') || query.state.data?.order.paymentMethod === 'cod' ? false : 5000,
  });

  const addressList = (addresses.data as AddressView[] | undefined) ?? [];

  useEffect(() => {
    if (addressId || !addressList.length) return;
    setAddressId((addressList.find((a) => a.isDefault) ?? addressList[0]).id);
  }, [addressList, addressId]);

  const selectedAddress = addressList.find((a) => a.id === addressId);
  const q = quote.data;

  const addAddress = useMutation({
    mutationFn: async () => {
      const line = [form.house, form.building, form.road, form.area, form.line2].filter(Boolean).join(', ') || form.road || form.area;
      if (line.trim().length < 5) throw new Error('Enter the house, building and road details');
      if (!/^\d{10}$/.test(form.phone)) throw new Error('Enter a 10-digit phone number');
      if (!/^\d{6}$/.test(form.pincode)) throw new Error('Enter a 6-digit PIN code');
      if (form.name.trim().length < 2) throw new Error('Enter the recipient name');
      return client.createAddress({
        label: form.label || 'Home', line, city: form.city, pincode: form.pincode, name: form.name,
        phone: form.phone, ...(form.altPhone ? { altPhone: form.altPhone } : {}), state: form.state,
        area: form.area, landmark: form.landmark, house: form.house, building: form.building, road: form.road,
        line2: form.line2, isDefault: form.isDefault,
      }) as unknown as Promise<AddressView>;
    },
    onSuccess: async (address) => {
      setAddressId(address.id); setShowForm(false); setForm({ ...emptyAddress });
      await qc.invalidateQueries({ queryKey: ['addresses'] });
      showToast('Address saved', 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const updateQty = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => client.updateCartLine(id, { quantity }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['cart'] }); await qc.invalidateQueries({ queryKey: ['cart-quote'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const go = (next: Step) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('step', next);
    setParams(nextParams, { replace: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const applyCoupon = async () => {
    if (!coupon.trim()) return;
    setCouponApplied(coupon.trim().toUpperCase());
    window.setTimeout(() => showToast('Coupon checked against your order total at the server', 'info'), 300);
  };

  const pay = async () => {
    if (!addressId || !q || !method) return;
    setBusy(true); setPayError(null);
    try {
      const order = await client.checkout({
        addressId, paymentMethod: method, deliverySlot: slot,
        coupon: couponApplied || undefined, instructions,
      }, idemKey()) as unknown as OrderView;
      if (method !== 'cod') {
        const payment = await client.initPayment({
          bookingId: null, orderId: order.id, method: method === 'card' ? 'card' : method === 'netbanking' ? 'netbanking' : 'upi',
          amountPaise: order.price.totalPaise, idempotencyKey: idemKey(),
        });
        const outcome = await completePayment(payment as PaymentAction, 'GOWAYY marketplace order');
        if (outcome === 'pending') showToast('Payment submitted. Waiting for signed provider confirmation.', 'info');
      }
      await qc.invalidateQueries();
      const next = new URLSearchParams(); next.set('step', 'success'); next.set('order', order.id);
      setParams(next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Payment could not be completed.');
    } finally { setBusy(false); }
  };

  const upiVpa = (import.meta.env.VITE_UPI_VPA as string | undefined) ?? '';
  const upiIntent = useMemo(() => {
    if (!upiVpa || !q) return '';
    const amount = (q.quote.totalPaise / 100).toFixed(2);
    return `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=GOWAYY&am=${amount}&cu=INR&tn=${encodeURIComponent('GOWAYY order')}`;
  }, [upiVpa, q]);

  if (step === 'success') {
    const order = placed.data?.order;
    const paid = placed.data?.payment?.status === 'captured';
    const failed = placed.data?.payment?.status === 'failed';
    return (
      <div className="checkout-page">
        <div className="order-success">
          <div className="success-animation" aria-hidden="true">
            <span className="success-animation__ring" />
            <span className="success-animation__ring success-animation__ring--late" />
            <span className="success-animation__logo"><img src="/brand/g-symbol.svg" alt="" /></span>
            <span className="success-animation__check"><Check size={26} /></span>
          </div>
          <h1>{failed ? 'Payment not completed' : paid || order?.paymentMethod === 'cod' ? 'Order confirmed' : 'Order placed — payment pending'}</h1>
          <p className="muted">{failed ? 'The provider reported a failed payment. Your order is saved; retry from Orders.' : paid ? 'Payment verified by the payment provider.' : order?.paymentMethod === 'cod' ? 'Cash on delivery — pay when your order arrives.' : 'Payment has been submitted. We are waiting for signed provider confirmation; this page updates automatically.'}</p>
          {placed.isLoading && <Skeleton style={{ height: 120, borderRadius: 16, marginTop: 20 }} />}
          {order && (
            <>
              <div className="success-card">
                <div className="between"><span className="eyebrow">Order ID</span><strong>{order.reference}</strong></div>
                <div className="divider" />
                {order.items.map((item) => (
                  <div className="between small" key={item.id}><span>{item.quantity}× {item.name}</span><span>{formatINR(item.unitPricePaise * item.quantity)}</span></div>
                ))}
                <div className="divider" />
                <div className="between"><strong>Paid / payable</strong><strong>{formatINR(order.price.totalPaise)}</strong></div>
                <p className="tiny muted" style={{ marginTop: 8 }}>Estimated delivery 30–50 minutes · {order.deliveryAddress?.city ?? 'Darjeeling'}</p>
              </div>
              {order.deliveryCode && (
                <div className="delivery-code-card">
                  <PackageCheck size={20} aria-hidden="true" />
                  <div><span className="eyebrow">Delivery code</span><strong className="delivery-code">{order.deliveryCode}</strong><p className="tiny muted">Share this only when your order arrives. The delivery partner must enter it to complete delivery.</p></div>
                </div>
              )}
            </>
          )}
          <div className="row row--wrap" style={{ justifyContent: 'center', gap: 10, marginTop: 22 }}>
            <Link className="btn btn--primary" to="/orders">Track order</Link>
            {order && <button className="btn btn--secondary" onClick={() => void downloadInvoice('orders', order.id, order.reference).catch((e: Error) => showToast(e.message, 'error'))}><Receipt size={16} /> View invoice</button>}
            <Link className="btn btn--ghost" to="/">Continue shopping</Link>
          </div>
        </div>
      </div>
    );
  }

  if (cart.isLoading) return <div className="checkout-page"><Skeleton style={{ height: 120, borderRadius: 16 }} /><Skeleton style={{ height: 320, borderRadius: 18, marginTop: 16 }} /></div>;
  if (!cart.data?.lines.length) {
    return <MascotState pose="idle-standing" title="Your cart is empty" body="Add something from a store, restaurant or the Shop." action={<Link className="btn btn--primary" to="/categories">Browse shops</Link>} />;
  }

  return (
    <div className="checkout-page">
      <div className="checkout-head">
        <button className="btn btn--ghost btn--sm" onClick={() => (step === 'address' ? navigate('/cart') : go(step === 'payment' ? 'summary' : 'address'))}><ArrowLeft size={16} /> Back</button>
        <h1>Checkout</h1>
      </div>
      <Stepper steps={STEPS.map((s) => s.label)} current={STEPS.findIndex((s) => s.id === step)} />

      <div className="checkout-layout">
        <div className="checkout-main">
          {step === 'address' && (
            <section className="card checkout-card">
              <h2><MapPin size={18} /> Delivery details</h2>
              <div className="stack">
                {addressList.map((a) => (
                  <button type="button" key={a.id} className={`address-option ${addressId === a.id ? 'is-active' : ''}`} onClick={() => setAddressId(a.id)}>
                    <span className="address-option__radio" aria-hidden="true" />
                    <span className="address-option__body">
                      <strong>{a.label}{a.isDefault ? ' · default' : ''}</strong>
                      <span>{a.name ?? ''}{a.phone ? ` · ${a.phone}` : ''}</span>
                      <span>{a.line}, {a.city} {a.pincode}</span>
                    </span>
                  </button>
                ))}
                {addressList.length === 0 && !showForm && <p className="small muted">Add your delivery address to continue.</p>}
                {!showForm && <button type="button" className="btn btn--secondary btn--sm" style={{ alignSelf: 'start' }} onClick={() => setShowForm(true)}>+ Add a new address</button>}
              </div>

              {showForm && (
                <form className="address-form" onSubmit={(e) => { e.preventDefault(); addAddress.mutate(); }}>
                  <div className="grid-2">
                    <label className="field"><span className="label">Full name</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required /></label>
                    <label className="field"><span className="label">Phone number</span><input className="input" inputMode="numeric" value={form.phone} maxLength={10} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} autoComplete="tel" required /></label>
                    <label className="field"><span className="label">Alternate phone (optional)</span><input className="input" inputMode="numeric" value={form.altPhone} maxLength={10} onChange={(e) => setForm({ ...form, altPhone: e.target.value.replace(/\D/g, '') })} /></label>
                    <label className="field"><span className="label">Label</span><input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Home / Work" /></label>
                    <label className="field"><span className="label">House / building number</span><input className="input" value={form.house} onChange={(e) => setForm({ ...form, house: e.target.value })} required /></label>
                    <label className="field"><span className="label">Building name (optional)</span><input className="input" value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} /></label>
                    <label className="field"><span className="label">Road / street</span><input className="input" value={form.road} onChange={(e) => setForm({ ...form, road: e.target.value })} required /></label>
                    <label className="field"><span className="label">Area / locality</span><input className="input" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} required /></label>
                    <label className="field"><span className="label">Address line 2 (optional)</span><input className="input" value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} /></label>
                    <label className="field"><span className="label">Landmark (optional)</span><input className="input" value={form.landmark} onChange={(e) => setForm({ ...form, landmark: e.target.value })} /></label>
                    <label className="field"><span className="label">City</span><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} autoComplete="address-level2" required /></label>
                    <label className="field"><span className="label">State</span><input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} autoComplete="address-level1" /></label>
                    <label className="field"><span className="label">PIN code</span><input className="input" inputMode="numeric" maxLength={6} value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, '') })} autoComplete="postal-code" required /></label>
                    <label className="field field--check"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Set as default address</label>
                  </div>
                  <div className="row row--wrap" style={{ gap: 10 }}>
                    <button type="submit" className="btn btn--primary" disabled={addAddress.isPending}>{addAddress.isPending ? 'Saving…' : 'Save address'}</button>
                    <button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)}>Cancel</button>
                  </div>
                </form>
              )}

              <label className="field"><span className="label">Delivery instructions (optional)</span>
                <textarea className="input" rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Landmark, gate code, call on arrival…" />
              </label>

              <div className="checkout-actions">
                <button className="btn btn--primary" disabled={!addressId} onClick={() => go('summary')}>Continue to summary <ArrowRight size={16} /></button>
              </div>
            </section>
          )}

          {step === 'summary' && q && (
            <section className="card checkout-card">
              <h2><Truck size={18} /> Order summary</h2>
              <div className="stack">
                {q.lines.map((line) => (
                  <div className="summary-line" key={line.id}>
                    <div className="summary-line__body">
                      <strong>{line.productName}</strong>
                      <span className="tiny muted">{line.variantLabel}{line.stock <= 3 ? ` · only ${line.stock} left` : ''}</span>
                    </div>
                    <div className="qty-control qty-control--sm">
                      <button type="button" aria-label="Decrease quantity" onClick={() => updateQty.mutate({ id: line.id, quantity: Math.max(0, line.quantity - 1) })}><Minus size={13} /></button>
                      <span>{line.quantity}</span>
                      <button type="button" aria-label="Increase quantity" onClick={() => updateQty.mutate({ id: line.id, quantity: Math.min(line.stock, line.quantity + 1) })}><Plus size={13} /></button>
                    </div>
                    <strong className="summary-line__price">{formatINR(line.unitPricePaise * line.quantity)}</strong>
                  </div>
                ))}
              </div>
              <div className="divider" />
              <div className="coupon-row">
                <input className="input" placeholder="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} aria-label="Coupon code" />
                <button className="btn btn--secondary" onClick={() => void applyCoupon()} disabled={!coupon}>Apply</button>
                {couponApplied && <button className="btn btn--ghost btn--sm" onClick={() => { setCouponApplied(''); setCoupon(''); }}><Trash2 size={14} /> Remove</button>}
              </div>
              <div className="delivery-slots">
                {q.deliveryOptions.map((o) => (
                  <button type="button" key={o.id} className={`slot-option ${slot === o.id ? 'is-active' : ''}`} onClick={() => setSlot(o.id)}>
                    <strong>{o.label}</strong><span>{o.eta}</span><span>{o.feePaise ? formatINR(o.feePaise) : 'Free'}</span>
                  </button>
                ))}
              </div>
              <div className="checkout-actions">
                <button className="btn btn--primary" onClick={() => go('payment')}>Continue to payment <ArrowRight size={16} /></button>
              </div>
            </section>
          )}

          {step === 'payment' && (
            <section className="card checkout-card">
              <h2><ShieldCheck size={18} /> Payment method</h2>
              {methods.isLoading && <Skeleton style={{ height: 180 }} />}
              {methods.isError && <div className="notice notice--info" role="alert">Payment methods could not be loaded. {apiErrorText(methods.error)}</div>}
              <div className="payment-methods">
                {(methods.data?.items ?? []).filter((m) => m.id !== 'wallet' && m.id !== 'emi').map((m) => {
                  const Icon = METHOD_ICONS[m.id] ?? CreditCard;
                  return (
                    <button type="button" key={m.id} className={`payment-method ${method === m.id ? 'is-active' : ''} ${!m.available ? 'is-disabled' : ''}`}
                      disabled={!m.available} onClick={() => setMethod(m.id)}>
                      <Icon size={20} aria-hidden="true" />
                      <span className="payment-method__body">
                        <strong>{m.label}{m.recommended ? ' · best offer' : ''}</strong>
                        <span>{m.available ? m.detail : m.unavailableReason ?? 'Not available with the configured provider'}</span>
                      </span>
                      {method === m.id && <CheckCircle2 size={18} />}
                    </button>
                  );
                })}
              </div>

              {method === 'upi' && (
                <div className="upi-block">
                  <p className="small muted">Pay with any UPI app. Your order is confirmed only after the payment provider verifies the transaction.</p>
                  {upiIntent && <a className="btn btn--secondary btn--sm" href={upiIntent}>Open UPI app</a>}
                  <p className="tiny muted">You will be redirected to your preferred UPI application to approve the payment.</p>
                </div>
              )}
              {method === 'card' && <p className="tiny muted">Card details are entered on the gateway-hosted page; GOWAYY never receives your card number or CVV.</p>}
              {method === 'netbanking' && <p className="tiny muted">Your bank is selected on the gateway-hosted page.</p>}

              {payError && <div className="notice notice--info" role="alert">{payError}</div>}
              <div className="checkout-actions">
                <button className="btn btn--primary" disabled={!method || !addressId || busy} onClick={() => void pay()}>
                  {busy ? 'Processing…' : `Pay ${q ? formatINR(q.quote.totalPaise) : ''}`}
                </button>
                {busy && <span className="tiny muted">Waiting for server verification — do not close this page.</span>}
              </div>
            </section>
          )}
        </div>

        <aside className="checkout-bill card">
          <h3>Bill details</h3>
          {q ? (
            <>
              <div className="line"><span>Items ({q.lines.reduce((n, l) => n + l.quantity, 0)})</span><span>{formatINR(q.quote.itemsPaise)}</span></div>
              {q.quote.protectionPaise > 0 && <div className="line"><span>Protection</span><span>{formatINR(q.quote.protectionPaise)}</span></div>}
              <div className="line"><span>Delivery</span><span>{q.quote.deliveryFeePaise ? formatINR(q.quote.deliveryFeePaise) : 'Free'}</span></div>
              {q.quote.discountPaise > 0 && <div className="line discount"><span>Coupon {q.quote.appliedCoupon}</span><span>− {formatINR(q.quote.discountPaise)}</span></div>}
              <div className="line"><span>Taxes (GST)</span><span>{formatINR(q.quote.taxPaise)}</span></div>
              <div className="line total"><span>To pay</span><span>{formatINR(q.quote.totalPaise)}</span></div>
            </>
          ) : <Skeleton style={{ height: 130 }} />}
          {selectedAddress && (
            <div className="bill-address">
              <MapPin size={14} aria-hidden="true" />
              <span>{selectedAddress.label} · {selectedAddress.line}, {selectedAddress.city} {selectedAddress.pincode}</span>
            </div>
          )}
          <p className="tiny muted" style={{ marginTop: 10 }}>Totals are recalculated by the server at payment. <Link className="link" to="/cart">Edit cart</Link></p>
        </aside>
      </div>
    </div>
  );
}

export function CheckoutEmpty() {
  return <MascotState pose="idle-standing" title="Nothing to check out" body="Your cart is empty." action={<Link className="btn btn--primary" to="/categories"><Home size={16} /> Browse shops</Link>} />;
}
