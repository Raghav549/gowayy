import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, ArrowRight, CreditCard } from 'lucide-react';
import { formatINR } from '@gowayy/shared-utils';
import { client } from '../lib/client';
import { usePageMeta } from '../lib/guards';
import { useUI } from '../store/useUI';
import { SectionHead, StatusBadge, EmptyState, Spinner, PriceLines } from '../components/ui';

export function Orders() {
  usePageMeta('Your orders');
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const q = useQuery({ queryKey: ['orders'], queryFn: () => client.orders() });
  const cancel = async (id: string) => {
    if (!window.confirm('Cancel this order? Grocery stock will be restored.')) return;
    try { await client.transitionOrder(id, 'cancelled'); await qc.invalidateQueries(); showToast('Order cancelled', 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not cancel', 'error'); }
  };
  return (
    <div>
      <SectionHead eyebrow="Order history" title="Your orders" subtitle="Food and grocery orders with server-authoritative status." action={<Link className="btn btn--secondary" to="/food">Order food <ArrowRight size={16} /></Link>} />
      {q.isLoading && <Spinner />}
      {q.data?.length === 0 && <EmptyState title="No orders yet" body="Order food or groceries and they will appear here." action={<Link className="btn btn--primary" to="/groceries">Shop groceries</Link>} />}
      <div className="stack">
        {q.data?.map((o) => (
          <div className="card" key={o.id}>
            <div className="between row--wrap"><div><div className="eyebrow">{o.reference} · {o.service}</div><h3 style={{ marginTop: 4 }}>{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</h3><p className="small muted" style={{ marginTop: 6 }}>Deliver to: {o.deliveryAddress}{o.slot ? ` · slot ${o.slot}` : ''}</p></div><StatusBadge status={o.status} /></div>
            <div className="divider" />
            <div className="grid-2">
              <div><div className="eyebrow">Items</div><div className="stack" style={{ marginTop: 8 }}>{o.items.map((i) => <div className="between small" key={i.id}><span>{i.quantity}× {i.name}</span><span>{formatINR(i.unitPricePaise * i.quantity)}</span></div>)}</div></div>
              <PriceLines price={o.price} title="Order total" />
            </div>
            <div className="row row--wrap" style={{ gap: 10, marginTop: 16 }}>
              {!o.paymentId && !['cancelled','refunded'].includes(o.status) && <Link className="btn btn--primary btn--sm" to={`/checkout?order=${o.id}`}><CreditCard size={15} /> Pay in sandbox</Link>}
              {!['delivered','cancelled','refunded'].includes(o.status) && <button className="btn btn--danger btn--sm" onClick={() => void cancel(o.id)}>Cancel order</button>}
              {o.journeyId && <Link className="btn btn--secondary btn--sm" to={`/journey/${o.journeyId}`}>Open trip</Link>}
              <Link className="btn btn--ghost btn--sm" to="/support">Report an issue</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
