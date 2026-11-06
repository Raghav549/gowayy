import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, ArrowRight, ArrowLeft, CreditCard, Receipt, PackageCheck, ShieldCheck, Copy } from 'lucide-react';
import { formatINR } from '@gowayy/shared-utils';
import { client } from '../lib/client';
import { usePageMeta } from '../lib/guards';
import { useUI } from '../store/useUI';
import { downloadInvoice } from '../lib/invoice';
import { SectionHead, StatusBadge, EmptyState, Spinner, PriceLines, SkeletonList, Skeleton, SkeletonOrderCard } from '../components/ui';

interface OrderView {
  id: string; reference: string; service: string; status: string; createdAt: string;
  items: Array<{ id: string; name: string; quantity: number; unitPricePaise: number }>;
  price: { totalPaise: number; taxPaise: number; lines: Array<{ label: string; paise: number }>; subtotalPaise?: number; commissionPaise?: number };
  deliveryAddress?: { label?: string; line?: string; city?: string; pincode?: string; phone?: string; name?: string };
  deliveryCode?: string | null;
  deliveryVerification?: { required: boolean; verified: boolean };
  paymentStatus?: string; paymentMethod?: string; paymentId?: string | null;
}

const TRACK: Array<{ id: string; label: string }> = [
  { id: 'created', label: 'Order placed' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'packed', label: 'Packed' },
  { id: 'out_for_delivery', label: 'Out for delivery' },
  { id: 'delivered', label: 'Delivered' },
];

function DeliveryCard({ order }: { order: OrderView }) {
  const showToast = useUI((s) => s.showToast);
  if (!order.deliveryCode) return null;
  return (
    <div className="delivery-code-card">
      <PackageCheck size={20} aria-hidden="true" />
      <div style={{ flex: 1 }}>
        <span className="eyebrow">Delivery code</span>
        <strong className="delivery-code">{order.deliveryCode}</strong>
        <p className="tiny muted">Show this to the delivery partner at handover. It can be used once.</p>
      </div>
      <button className="icon-btn" aria-label="Copy delivery code" onClick={() => { void navigator.clipboard?.writeText(order.deliveryCode ?? ''); showToast('Delivery code copied', 'success'); }}><Copy size={15} /></button>
    </div>
  );
}

function Tracking({ status }: { status: string }) {
  const index = TRACK.findIndex((t) => t.id === status);
  const cancelled = status === 'cancelled' || status === 'refunded';
  return (
    <ol className="order-track">
      {TRACK.map((t, i) => (
        <li key={t.id} className={`${!cancelled && i <= index ? 'is-done' : ''} ${!cancelled && i === index ? 'is-current' : ''}`}>
          <span className="order-track__dot" />{t.label}
        </li>
      ))}
      {cancelled && <li className="is-cancelled">{status === 'refunded' ? 'Refunded' : 'Cancelled'}</li>}
    </ol>
  );
}

function OrderCard({ order, expanded = false }: { order: OrderView; expanded?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const showToast = useUI((s) => s.showToast);
  const [open, setOpen] = useState(expanded);
  const cancel = async () => {
    if (!window.confirm('Cancel this order?')) return;
    try { await client.transitionOrder(order.id, 'cancelled'); showToast('Order cancelled', 'success'); await qc.invalidateQueries({ queryKey: ['orders'] }); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not cancel', 'error'); }
  };
  return (
    <div className="card order-card">
      <div className="between row--wrap">
        <div>
          <div className="eyebrow">{order.reference} · {order.service === 'marketplace' ? 'Shop' : order.service}</div>
          <h3 style={{ marginTop: 4, fontSize: 17 }}>{order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ').slice(0, 90)}</h3>
          <p className="tiny muted" style={{ marginTop: 4 }}>{new Date(order.createdAt).toLocaleString()}{order.deliveryAddress?.city ? ` · ${order.deliveryAddress.city}` : ''}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <Tracking status={order.status} />

      <div className="between"><strong>{formatINR(order.price.totalPaise)}</strong>
        <button className="link" onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'View details'}</button>
      </div>

      {open && (
        <div className="order-details">
          <DeliveryCard order={order} />
          <div className="grid-2">
            <div>
              <div className="eyebrow">Items</div>
              <div className="stack" style={{ marginTop: 8 }}>
                {order.items.map((i) => <div className="between small" key={i.id}><span>{i.quantity}× {i.name}</span><span>{formatINR(i.unitPricePaise * i.quantity)}</span></div>)}
              </div>
            </div>
            <PriceLines price={order.price as never} title="Bill" />
          </div>
          {order.deliveryAddress && (
            <p className="small muted" style={{ marginTop: 10 }}>Deliver to: {order.deliveryAddress.name ? `${order.deliveryAddress.name}, ` : ''}{order.deliveryAddress.line}{order.deliveryAddress.city ? `, ${order.deliveryAddress.city}` : ''} {order.deliveryAddress.pincode ?? ''}</p>
          )}
          <div className="row row--wrap" style={{ gap: 10, marginTop: 14 }}>
            {order.paymentMethod !== 'cod' && !['paid', 'captured', 'cod_due'].includes(order.paymentStatus ?? '') && !['cancelled', 'refunded'].includes(order.status) && (
              <button className="btn btn--primary btn--sm" onClick={() => navigate(`/checkout/booking?order=${order.id}`)}><CreditCard size={15} /> Complete payment</button>
            )}
            <button className="btn btn--secondary btn--sm" onClick={() => void downloadInvoice('orders', order.id, order.reference).catch((e: Error) => showToast(e.message, 'error'))}><Receipt size={15} /> Invoice</button>
            {!['delivered', 'cancelled', 'refunded'].includes(order.status) && <button className="btn btn--danger btn--sm" onClick={() => void cancel()}>Cancel order</button>}
            <Link className="btn btn--ghost btn--sm" to="/support">Report an issue</Link>
          </div>
          <p className="tiny muted row" style={{ gap: 6, marginTop: 10 }}><ShieldCheck size={12} /> Delivery must be verified with your code before it is marked complete.</p>
        </div>
      )}
    </div>
  );
}

export function Orders() {
  usePageMeta('Your orders');
  const q = useQuery({ queryKey: ['orders'], queryFn: () => client.orders() });
  return (
    <div>
      <SectionHead eyebrow="Order history" title="Your orders" action={<Link className="btn btn--secondary" to="/categories">Shop <ArrowRight size={16} /></Link>} />
      {q.isLoading && <SkeletonList rows={4} />}
      {q.isError && <div className="notice notice--info" role="alert">Orders could not be loaded. <button className="link" onClick={() => void q.refetch()}>Retry</button></div>}
      {q.data?.length === 0 && <EmptyState title="No orders yet" body="Food, groceries and shop orders will appear here with tracking, invoices and delivery codes." action={<Link className="btn btn--primary" to="/categories"><ShoppingBag size={16} /> Start shopping</Link>} />}
      <div className="stack">
        {(q.data as OrderView[] | undefined)?.map((o) => <OrderCard key={o.id} order={o} />)}
      </div>
    </div>
  );
}

export function OrderDetail() {
  const { id = '' } = useParams();
  usePageMeta('Order details');
  const q = useQuery({ queryKey: ['order-detail', id], queryFn: async () => (await client.orderDetail?.(id)) as unknown as { order: OrderView; payment: { status: string; method: string } | null } , enabled: Boolean(id) });
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }, [id]);
  if (q.isLoading) return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><Skeleton style={{ height: 20, width: 140 }} /><SkeletonOrderCard /><Skeleton style={{ height: 180, borderRadius: 16 }} /></div>;
  if (!q.data?.order) return <EmptyState title="Order not found" body="This order is not available on your account." action={<Link className="btn btn--primary" to="/orders"><ArrowLeft size={16} /> All orders</Link>} />;
  return (
    <div className="stack">
      <Link className="btn btn--ghost btn--sm" to="/orders" style={{ alignSelf: 'start' }}><ArrowLeft size={16} /> All orders</Link>
      <OrderCard order={q.data.order} expanded />
    </div>
  );
}
