import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CarFront, BedDouble, Mountain, UtensilsCrossed, ShoppingBasket, Sparkles, MapPin, CalendarDays, Users, ArrowRight, CheckCircle2, Circle, Clock3 } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { client } from '../lib/client';
import { usePageMeta } from '../lib/guards';
import { useJourney } from '../store/useJourney';
import { useUI } from '../store/useUI';
import { SectionHead, EmptyState, StatusBadge, Skeleton, SkeletonList } from '../components/ui';
import { ConnectedRecommendations, DestinationSelect } from './shared';

const ICONS: Record<string, typeof CarFront> = {
  cab: CarFront, hotel: BedDouble, homestay: BedDouble, tourism: Mountain, food: UtensilsCrossed, grocery: ShoppingBasket, experience: Sparkles,
};
const HREFS: Record<string, string> = { cab: '/cabs', hotel: '/hotels', homestay: '/hotels', tourism: '/packages', food: '/food', grocery: '/groceries', experience: '/experiences' };

export function JourneyDashboard() {
  const { id } = useParams();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const setJourney = useJourney((s) => s.set);
  const q = useQuery({ queryKey: ['journey', id], queryFn: () => client.journey(id ?? ''), enabled: Boolean(id) });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [travellers, setTravellers] = useState(1);
  const [destinationId, setDestinationId] = useState('');
  const [saving, setSaving] = useState(false);
  usePageMeta(q.data?.journey.title ?? 'Your journey');

  useEffect(() => {
    if (q.data?.journey) {
      const j = q.data.journey;
      setStartDate(j.startDate ?? ''); setEndDate(j.endDate ?? ''); setTravellers(j.travellers); setDestinationId(j.destinationId ?? '');
      setJourney(j);
    }
  }, [q.data, setJourney]);

  if (q.isLoading) return <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><Skeleton style={{ height: 20, width: 160 }} /><SkeletonList rows={4} /><Skeleton style={{ height: 160, borderRadius: 16 }} /></div>;
  const journey = q.data?.journey;
  if (!journey) return <EmptyState title="Journey not found" body="Start a new journey from the home screen." action={<Link className="btn btn--primary" to="/">Go home</Link>} />;
  const destination = catalogue.destinations.find((d) => d.id === journey.destinationId);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await client.updateJourney(journey.id, { startDate: startDate || null, endDate: endDate || null, travellers, destinationId: destinationId || null, title: destinationId ? `My ${catalogue.destinations.find((d) => d.id === destinationId)?.name ?? ''} trip` : journey.title });
      setJourney(updated); await qc.invalidateQueries({ queryKey: ['journey', id] });
      showToast('Journey context saved — you will not be asked again', 'success');
    } catch (e) { showToast(e instanceof Error ? e.message : 'Could not save', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="eyebrow">Shared journey dashboard</div>
      <h1 style={{ marginTop: 6 }}>{journey.title}</h1>
      <div className="row row--wrap small muted" style={{ marginTop: 12, gap: 18 }}>
        {destination && <span className="row"><MapPin size={15} /> {destination.name}</span>}
        {journey.pickup && <span className="row"><CarFront size={15} /> From {journey.pickup.name}</span>}
        {journey.startDate && <span className="row"><CalendarDays size={15} /> {journey.startDate} → {journey.endDate ?? 'open'}</span>}
        <span className="row"><Users size={15} /> {journey.travellers} traveller(s)</span>
      </div>

      <section className="section">
        <SectionHead eyebrow="One connected trip" title="Journey components" subtitle="Each component opens independently while keeping this journey context." />
        <div className="grid-3">
          {(q.data?.components ?? []).map((c) => {
            const Icon = ICONS[c.service] ?? Circle;
            return (
              <div className="card" key={c.service}>
                <div className="between"><span className="row"><Icon size={18} style={{ color: 'var(--gw-champagne)' }} /><strong>{c.label}</strong></span>
                  {c.state === 'booked' ? <CheckCircle2 size={17} color="var(--gw-success)" /> : c.state === 'pending' ? <Clock3 size={17} color="var(--gw-warning)" /> : <Circle size={17} className="muted" />}
                </div>
                <p className="small muted" style={{ marginTop: 10 }}>{c.state === 'booked' ? c.statusLabel : c.state === 'pending' ? `${c.statusLabel} — awaiting partner` : 'Not booked yet'}</p>
                <div className="row" style={{ gap: 8, marginTop: 14 }}>
                  {c.bookingId && <Link className="btn btn--secondary btn--sm" to={`/bookings/${c.bookingId}`}>Open</Link>}
                  <Link className="btn btn--ghost btn--sm" to={HREFS[c.service] ?? '/'}>{c.state === 'not_booked' ? 'Book' : 'Add another'} <ArrowRight size={13} /></Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section grid-2">
        <div className="card">
          <h3>Trip details</h3>
          <div className="stack" style={{ marginTop: 14 }}>
            <DestinationSelect value={destinationId} onChange={setDestinationId} label="Active destination" />
            <div className="grid-2" style={{ gap: 10 }}>
              <label className="field" style={{ marginBottom: 0 }}><span className="label">Start date</span><input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
              <label className="field" style={{ marginBottom: 0 }}><span className="label">End date</span><input className="input" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></label>
            </div>
            <label className="field" style={{ marginBottom: 0 }}><span className="label">Travellers</span><input className="input" type="number" min={1} max={20} value={travellers} onChange={(e) => setTravellers(Number(e.target.value))} /></label>
            <button className="btn btn--primary btn--block" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save journey context'}</button>
            <p className="tiny muted">Saved once, prefilled everywhere: cabs, stays, tourism and checkout.</p>
          </div>
        </div>
        <div className="card">
          <h3>Linked records</h3>
          {journey.serviceIds.length === 0 ? <p className="small muted" style={{ marginTop: 10 }}>No bookings or orders linked to this journey yet.</p> : (
            <div className="list" style={{ marginTop: 12 }}>
              {journey.serviceIds.map((sid) => <Link key={sid} to={`/bookings/${sid}`} className="list-row"><span className="list-row__body"><span className="list-row__title">Record {sid.slice(-8)}</span><span className="list-row__sub">Open booking / order details</span></span><ArrowRight size={15} /></Link>)}
            </div>
          )}
          <div className="divider" />
          <div className="stack small muted">
            <div>Pickup: {journey.pickup?.name ?? 'Not set'}</div>
            <div>Destination: {journey.dropoff?.name ?? destination?.name ?? 'Not set'}</div>
            <div>Preferences: {journey.preferences.length ? journey.preferences.join(', ') : 'None'}</div>
          </div>
        </div>
      </section>

      <ConnectedRecommendations destinationId={journey.destinationId} title="Complete your journey" />
    </div>
  );
}
