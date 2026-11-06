import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { client } from '../lib/client';
import { useUI } from '../store';
import { Badge, SectionHead, Skeleton, SkeletonList } from '@gowayy/ui';
import { formatINR } from '@gowayy/shared-utils';

const NEXT: Record<string, string> = {
  requested: 'confirmed', confirmed: 'in_progress', created: 'accepted', accepted: 'preparing', preparing: 'out_for_delivery', awaiting_payment: 'confirmed',
};

export function Inbox() {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const [tab, setTab] = useState<'bookings' | 'orders'>('bookings');
  const inbox = useQuery({ queryKey: ['partner-inbox'], queryFn: () => client.partnerInbox(), refetchInterval: 10000 });
  const data = inbox.data as Record<string, any[]> | undefined;

  const advanceBooking = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => client.transitionBooking(id, status, 'partner update'),
    onSuccess: async () => { showToast('Booking updated — customer sees it in real time', 'success'); await qc.invalidateQueries(); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const advanceOrder = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => client.transitionOrder(id, status),
    onSuccess: async () => { showToast('Order advanced', 'success'); await qc.invalidateQueries(); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  if (inbox.isLoading) return <><Skeleton style={{ height: 22, width: 160, borderRadius: 8 }} /><SkeletonList rows={5} /></>;
  const bookings = (data?.bookings ?? []) as any[];
  const orders = (data?.orders ?? []) as any[];

  return (
    <div className="stack">
      <SectionHead eyebrow="Requests" title="Inbox" subtitle="Accept or advance work. Every change is server-authoritative and syncs to the customer app." />
      <div className="chips">
        <button className={`chip ${tab === 'bookings' ? 'chip--active' : ''}`} onClick={() => setTab('bookings')}>Bookings ({bookings.length})</button>
        <button className={`chip ${tab === 'orders' ? 'chip--active' : ''}`} onClick={() => setTab('orders')}>Orders ({orders.length})</button>
      </div>
      {tab === 'bookings' && (
        <div className="list">
          {bookings.length === 0 && <p className="small muted">No pending bookings.</p>}
          {bookings.map((b) => {
            const next = NEXT[b.status];
            return (
              <div className="list-row" key={b.id} style={{ flexWrap: 'wrap' }}>
                <span className="list-row__body"><span className="list-row__title">{b.reference} · {b.title}</span><span className="list-row__sub">{b.service} · {formatINR(b.price?.totalPaise ?? 0)} · {new Date(b.createdAt).toLocaleString()}</span></span>
                <Badge tone="warning">{b.status.replace(/_/g, ' ')}</Badge>
                {next && <button className="btn btn--primary btn--sm" onClick={() => advanceBooking.mutate({ id: b.id, status: next })}><CheckCircle2 size={14} /> {next.replace(/_/g, ' ')}</button>}
                <Link className="btn btn--ghost btn--sm" to={`/inbox`}>Details</Link>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'orders' && (
        <div className="list">
          {orders.length === 0 && <p className="small muted">No active orders.</p>}
          {orders.map((o) => {
            const next = NEXT[o.status];
            return (
              <div className="list-row" key={o.id} style={{ flexWrap: 'wrap' }}>
                <span className="list-row__body"><span className="list-row__title">{o.reference} · {o.service}</span><span className="list-row__sub">{o.items.map((i: any) => `${i.name} ×${i.quantity}`).join(', ')} · {formatINR(o.price?.totalPaise ?? 0)}</span></span>
                <Badge tone="warning">{o.status.replace(/_/g, ' ')}</Badge>
                {next && <button className="btn btn--primary btn--sm" onClick={() => advanceOrder.mutate({ id: o.id, status: next })}><CheckCircle2 size={14} /> {next.replace(/_/g, ' ')}</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
