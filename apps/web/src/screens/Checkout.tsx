import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, ShieldCheck, ArrowRight, CheckCircle2, Wallet } from 'lucide-react';
import { formatINR } from '@gowayy/shared-utils';
import { client, idemKey } from '../lib/client';
import { usePageMeta } from '../lib/guards';
import { useUI } from '../store/useUI';
import { SectionHead, PriceLines, Spinner, DemoBanner, StatusBadge } from '../components/ui';

export function Checkout() {
  usePageMeta('Secure checkout');
  const [params] = useSearchParams();
  const bookingId = params.get('booking');
  const orderId = params.get('order');
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [method, setMethod] = useState<'upi' | 'upi_intent' | 'gateway' | 'cash'>('upi');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const booking = useQuery({ queryKey: ['booking', bookingId], queryFn: () => client.booking(bookingId ?? ''), enabled: Boolean(bookingId) });
  const order = useQuery({ queryKey: ['order', orderId], queryFn: () => client.order(orderId ?? ''), enabled: Boolean(orderId) });
  const b = booking.data?.booking;
  const o = order.data?.order;
  const record = b ?? o;
  const payment = booking.data?.payment ?? order.data?.payment;
  const label = b ? b.title : o ? o.items.map((i: { name: string }) => i.name).join(', ') : '';

  const pay = async () => {
    if (!record) return;
    setBusy(true); setError(null);
    try {
      const p = await client.initPayment({ bookingId, orderId, method, amountPaise: record.price.totalPaise, idempotencyKey: idemKey() });
      if (method === 'cash') { showToast('Pay-on-delivery recorded; no sandbox charge', 'info'); setDone(true); }
      else {
        const result = await client.captureSandboxPayment(p.id);
        if (result.payment.status !== 'captured') throw new Error('Payment was not captured by the server');
        showToast('Sandbox payment captured and verified server-side', 'success');
        setDone(true);
      }
      await qc.invalidateQueries();
    } catch (e) { setError(e instanceof Error ? e.message : 'Payment failed'); }
    finally { setBusy(false); }
  };

  if (!bookingId && !orderId) return <div className="empty-state"><h3>Nothing to check out</h3><p>Open a booking or order to pay.</p></div>;
  if ((booking.isLoading && bookingId) || (order.isLoading && orderId)) return <Spinner />;
  if (!record) return <div className="empty-state"><h3>Record not found</h3><p>{error ?? 'This booking or order is unavailable.'}</p><Link className="btn btn--primary" to="/bookings">My bookings</Link></div>;

  return (
    <div>
      <SectionHead eyebrow="Checkout" title="Complete payment" subtitle={`${record.reference} · ${label}`} />
      <DemoBanner>Payments use a sandbox provider. The client never decides success: the server signs a provider event and verifies its HMAC signature before marking a payment captured. No real money moves.</DemoBanner>
      <div className="grid-2 section">
        <div className="card">
          <h3>Choose a payment method</h3>
          <div className="stack" style={{ marginTop: 14 }}>
            {([
              ['upi', 'UPI (sandbox)', 'Collect request simulated by the server'],
              ['upi_intent', 'UPI Intent (sandbox)', 'Deep-link intent, confirmation via webhook'],
              ['gateway', 'Verified gateway (sandbox)', 'Server-side order + signed webhook'],
              ['cash', 'Cash / pay later', 'No charge; settlement recorded as pending'],
            ] as const).map(([value, label, hint]) => (
              <button key={value} className="list-row" style={{ width: '100%', textAlign: 'left', borderColor: method === value ? 'var(--gw-champagne)' : undefined }} onClick={() => setMethod(value)}>
                <Wallet size={18} style={{ color: 'var(--gw-champagne)' }} /><span className="list-row__body"><span className="list-row__title">{label}</span><span className="list-row__sub">{hint}</span></span>{method === value && <span className="badge badge--accent">Selected</span>}
              </button>
            ))}
          </div>
          <div className="notice notice--info" style={{ marginTop: 16 }}><ShieldCheck size={14} /> Idempotency keys prevent duplicate charges; webhook events are deduplicated by event id.</div>
        </div>
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="between"><h3>Summary</h3>{payment && <StatusBadge status={payment.status} />}</div>
          <div style={{ marginTop: 14 }}><PriceLines price={record.price} /></div>
          {error && <div className="notice notice--demo" style={{ marginTop: 12 }} role="alert">{error}</div>}
          {done || payment?.status === 'captured' ? (
            <div className="notice notice--info" style={{ marginTop: 16 }}><CheckCircle2 size={16} /> Payment recorded. The booking still requires partner confirmation — payment success does not confirm a booking.</div>
          ) : (
            <button className="btn btn--primary btn--block" style={{ marginTop: 16 }} onClick={() => void pay()} disabled={busy}>
              {busy ? 'Processing…' : method === 'cash' ? 'Record pay-later' : `Pay ${formatINR(record.price.totalPaise)} (sandbox)`} <ArrowRight size={17} />
            </button>
          )}
          <div className="row row--wrap" style={{ gap: 10, marginTop: 16 }}>
            <Link className="btn btn--secondary btn--sm" to={bookingId ? '/bookings' : '/orders'}>View {bookingId ? 'booking' : 'order'}</Link>
            {record.journeyId && <Link className="btn btn--secondary btn--sm" to={`/journey/${record.journeyId}`}>Open trip</Link>}
          </div>
        </div>
      </div>
      <div className="card">
        <h3>Transaction ledger</h3>
        <Transactions />
      </div>
    </div>
  );
}

function Transactions() {
  const q = useQuery({ queryKey: ['transactions'], queryFn: () => client.transactions() });
  if (q.isLoading) return <Spinner />;
  if (!q.data?.length) return <p className="small muted" style={{ marginTop: 10 }}>No transactions recorded yet.</p>;
  return <div className="list" style={{ marginTop: 12 }}>{q.data.map((t) => <div className="list-row" key={t.id}><span className="list-row__body"><span className="list-row__title">{t.type}</span><span className="list-row__sub">{t.note}</span></span><span className="small">{formatINR(t.amountPaise)}</span></div>)}</div>;
}
