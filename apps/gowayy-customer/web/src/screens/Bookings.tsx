import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { downloadInvoice } from '../lib/invoice';
import { ClipboardList, ArrowRight, Star, Download, CreditCard, XCircle } from 'lucide-react';
import { formatINR } from '@gowayy/shared-utils';
import { SERVICE_LABELS, progressFor } from '@gowayy/booking-engine';
import { client } from '../lib/client';
import { usePageMeta } from '../lib/guards';
import { useUI } from '../store/useUI';
import { SectionHead, StatusBadge, PriceLines, EmptyState, SkeletonList, Skeleton } from '../components/ui';

export function Bookings() {
  usePageMeta('Your bookings');
  const q = useQuery({ queryKey: ['bookings'], queryFn: () => client.bookings() });
  const [filter, setFilter] = useState<'all' | 'active' | 'past'>('all');
  const list = (q.data ?? []).filter((b) => filter === 'all' ? true : filter === 'active'
    ? !['completed', 'cancelled', 'refunded', 'failed'].includes(b.status)
    : ['completed', 'cancelled', 'refunded', 'failed'].includes(b.status));
  return (
    <div>
      <SectionHead eyebrow="Booking history" title="Your bookings"  action={<Link className="btn btn--secondary" to="/">Plan a journey <ArrowRight size={16} /></Link>} />
      <div className="chips" style={{ marginBottom: 18 }}>
        {(['all', 'active', 'past'] as const).map((f) => <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}
      </div>
      {q.isLoading && <SkeletonList rows={4} />}
      {q.data?.length === 0 && <EmptyState title="No bookings yet" body="Book a cab, stay, tour or parcel and it will appear here." action={<Link className="btn btn--primary" to="/cabs">Book a cab</Link>} />}
      <div className="list">
        {list.map((b) => (
          <Link key={b.id} to={`/bookings/${b.id}`} className="list-row card--hover">
            <div className="list-row__body">
              <div className="row" style={{ gap: 8 }}><span className="list-row__title">{b.title}</span><StatusBadge status={b.status} /></div>
              <div className="list-row__sub">{b.reference} · {SERVICE_LABELS[b.service]} · {new Date(b.createdAt).toLocaleString()}</div>
            </div>
            <div style={{ textAlign: 'right' }}><strong>{formatINR(b.price.totalPaise)}</strong><div className="tiny muted">{b.paymentId ? 'Payment linked' : 'Payment pending'}</div></div>
            <ArrowRight size={16} />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function BookingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['booking', id], queryFn: () => client.booking(id ?? ''), enabled: Boolean(id) });
  usePageMeta('Booking details');
  if (q.isLoading) return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><Skeleton style={{ height: 22, width: 160, borderRadius: 8 }} /><SkeletonList rows={3} /><Skeleton style={{ height: 120, borderRadius: 16 }} /></div>;
  const b = q.data?.booking;
  if (!b) return <EmptyState title="Booking not found" body="It may have been removed." action={<Link className="btn btn--primary" to="/bookings">All bookings</Link>} />;

  const cancel = async () => {
    if (!window.confirm('Cancel this booking?')) return;
    setBusy(true);
    try { await client.cancelBooking(b.id, 'Cancelled by customer'); await qc.invalidateQueries(); showToast('Booking cancelled', 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not cancel', 'error'); }
    finally { setBusy(false); }
  };
  const review = async () => {
    setBusy(true);
    try { await client.reviewBooking(b.id, rating, comment); await qc.invalidateQueries(); showToast('Review saved (verified booking)', 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not save review', 'error'); }
    finally { setBusy(false); }
  };
  const invoice = async () => {
    try { await downloadInvoice('bookings', b.id, b.reference); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Invoice could not be downloaded', 'error'); }
  };

  return (
    <div>
      <Link className="btn btn--ghost btn--sm" to="/bookings">← All bookings</Link>
      <div className="between row--wrap" style={{ marginTop: 14 }}>
        <div><div className="eyebrow">{b.reference} · {SERVICE_LABELS[b.service]}</div><h1 style={{ marginTop: 6 }}>{b.title}</h1></div>
        <StatusBadge status={b.status} />
      </div>
      <div className="card" style={{ marginTop: 18 }}><div className="between small"><span>Booking progress</span><span>{progressFor(b.status)}%</span></div><div className="progress" style={{ marginTop: 8 }}><div style={{ width: `${progressFor(b.status)}%` }} /></div></div>

      <div className="grid-2 section">
        <div className="card">
          <SectionHead eyebrow="Status history" title="Server events" />
          <div className="timeline">
            {b.statusHistory.map((h, i) => <div className="timeline__item" key={`${h.status}-${i}`}><span className="timeline__dot" /><div><strong className="small">{h.status.replace(/_/g, ' ')}</strong><div className="tiny muted">{new Date(h.at).toLocaleString()} · by {h.by}{h.note ? ` · ${h.note}` : ''}</div></div></div>)}
          </div>
          {q.data?.payment && <div className="notice notice--info" style={{ marginTop: 10 }}>Payment {q.data.payment.status} · {formatINR(q.data.payment.amountPaise)}</div>}
        </div>
        <div className="stack">
          <div className="card"><h3>Price breakdown</h3><div style={{ marginTop: 14 }}><PriceLines price={b.price} /></div></div>
          <div className="card">
            <h3>Details</h3>
            <div className="stack" style={{ marginTop: 12 }}>
              {Object.entries(b.details).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)).map(([k, v]) => <div className="between small" key={k}><span className="muted">{k.replace(/([A-Z])/g, ' $1')}</span><span>{String(v)}</span></div>)}
            </div>
          </div>
        </div>
      </div>

      <div className="section card">
        <h3>Actions</h3>
        <div className="row row--wrap" style={{ gap: 10, marginTop: 14 }}>
          {!b.paymentId && !['cancelled', 'refunded'].includes(b.status) && <Link className="btn btn--primary" to={`/checkout/booking?booking=${b.id}`}><CreditCard size={16} /> Complete payment</Link>}
          {!['completed', 'cancelled', 'refunded', 'in_progress'].includes(b.status) && <button className="btn btn--danger" onClick={() => void cancel()} disabled={busy}><XCircle size={16} /> Cancel booking</button>}
          <button className="btn btn--secondary" onClick={() => void invoice()}><Download size={16} /> Download invoice</button>
          {b.journeyId && <Link className="btn btn--secondary" to={`/journey/${b.journeyId}`}>Open trip</Link>}
          <button className="btn btn--ghost" onClick={() => navigate('/support')}>Get help</button>
        </div>
        <p className="tiny muted" style={{ marginTop: 10 }}>Cancellation refunds are calculated on the server. Client-side success never changes a booking status.</p>
      </div>

      {b.status === 'completed' && <div className="section card">
        <h3>Leave a verified review</h3>
        <p className="small muted" style={{ marginTop: 6 }}>Only completed bookings can be reviewed — no fabricated ratings.</p>
        <div className="row" style={{ marginTop: 14, gap: 8 }}>{[1,2,3,4,5].map((n) => <button key={n} className="btn btn--ghost btn--sm" onClick={() => setRating(n)} aria-label={`${n} stars`}><Star size={20} fill={n <= rating ? 'var(--gw-champagne)' : 'none'} color="var(--gw-champagne)" /></button>)}</div>
        <textarea className="textarea" style={{ marginTop: 10 }} placeholder="How was it?" value={comment} onChange={(e) => setComment(e.target.value)} />
        <button className="btn btn--primary" style={{ marginTop: 10 }} onClick={() => void review()} disabled={busy}>Submit review</button>
      </div>}
    </div>
  );
}
