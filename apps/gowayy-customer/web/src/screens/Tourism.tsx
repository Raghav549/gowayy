import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Mountain, Sparkles, Ticket, ArrowRight, Clock3, MapPin, Info } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { formatINR, addDays } from '@gowayy/shared-utils';
import { priceTourism } from '@gowayy/pricing-engine';
import { client, idemKey } from '../lib/client';
import { usePageMeta, useRequireAuth } from '../lib/guards';
import { useJourney } from '../store/useJourney';
import { useUI } from '../store/useUI';
import { Field, SectionHead, PriceLines, ImageFrame, Stepper } from '../components/ui';
import { ConnectedRecommendations, DestinationSelect } from './shared';
import { MapView } from '../components/MapView';

type Variant = 'tourism' | 'package' | 'experience';
const today = new Date().toISOString().slice(0, 10);

export function Tourism({ variant }: { variant: Variant }) {
  const [params] = useSearchParams();
  usePageMeta(variant === 'package' ? 'Sightseeing packages' : variant === 'experience' ? 'Local experiences' : 'Tourism & sightseeing');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const requireAuth = useRequireAuth();
  const journey = useJourney((s) => s.journey);
  const patch = useJourney((s) => s.patch);
  const showToast = useUI((s) => s.showToast);
  const [destination, setDestination] = useState(journey?.destinationId ?? '');
  const [selectedId, setSelectedId] = useState(params.get('offering') ?? '');
  const [date, setDate] = useState(addDays(today, 2));
  const [guests, setGuests] = useState(journey?.travellers ?? 2);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attractions = catalogue.attractions.filter((a) => (!destination || a.destinationId === destination));
  const offerings = (variant === 'package' ? catalogue.tourPackages : catalogue.experiences)
    .filter((o) => !destination || o.destinationId === destination)
    .map((o) => ({ id: o.id, name: o.name, description: o.description, pricePaise: o.pricePaise, duration: variant === 'package' ? `${(o as typeof catalogue.tourPackages[number]).durationHours} h` : `${(o as typeof catalogue.experiences[number]).durationMinutes} min`, includes: variant === 'package' ? (o as typeof catalogue.tourPackages[number]).includes : [`Host: ${(o as typeof catalogue.experiences[number]).host}`], destinationId: o.destinationId }));
  const selected = offerings.find((o) => o.id === selectedId);
  const quote = useMemo(() => selected ? priceTourism({ basePaise: selected.pricePaise, guests, service: variant === 'tourism' ? 'tourism' : variant }) : null, [selected, guests, variant]);
  const attraction = catalogue.attractions.find((a) => a.id === params.get('attraction'));

  const book = async () => {
    if (!requireAuth() || !selected) return;
    setSubmitting(true); setError(null);
    try {
      const booking = await client.bookTourism({ offeringId: selected.id, service: variant, date, guests, journeyId: journey?.id ?? null }, idemKey());
      await qc.invalidateQueries({ queryKey: ['bookings'] });
      showToast('Tourism request created — awaiting confirmation', 'success');
      navigate(`/checkout/booking?booking=${booking.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create booking'); }
    finally { setSubmitting(false); }
  };
  const planVisit = async (id: string, destinationId: string) => {
    await patch({ destinationId, title: `My ${catalogue.destinations.find((d) => d.id === destinationId)?.name ?? 'journey'} trip` });
    showToast('Attraction added to your journey context', 'success');
    navigate(`/destinations/${catalogue.destinations.find((d) => d.id === destinationId)?.slug ?? ''}`);
  };

  return (
    <div>
      <SectionHead eyebrow={variant === 'tourism' ? 'Sightseeing' : variant === 'package' ? 'Packages' : 'Experiences'}
        title={variant === 'tourism' ? 'Tourism & attractions' : variant === 'package' ? 'Sightseeing packages' : 'Local experiences'}
        subtitle={variant === 'tourism' ? 'Attractions from the destination catalogue. Plan a visit to connect transport, stays and food.' : 'Sightseeing packages and local experiences with clear prices and durations.'} />
      <div style={{ maxWidth: 320, marginBottom: 18 }}><DestinationSelect value={destination} onChange={setDestination} label="Filter by destination" /></div>

      {attraction && variant === 'tourism' && <div className="card" style={{ marginBottom: 18, borderColor: 'var(--gw-champagne)' }}>
        <div className="between"><h3>{attraction.name}</h3><span className="badge">{attraction.category}</span></div>
        <p className="small muted" style={{ marginTop: 8 }}>{attraction.description}</p>
        <p className="tiny muted" style={{ marginTop: 8 }}>Typical visit {attraction.typicalVisitMinutes} min · {attraction.infoStatus === 'community-reference' ? 'community reference — verify locally' : 'published reference'}</p>
        <button className="btn btn--primary btn--sm" style={{ marginTop: 12 }} onClick={() => void planVisit(attraction.id, attraction.destinationId)}>Plan this visit <ArrowRight size={15} /></button>
      </div>}

      {variant === 'tourism' ? (
        <div className="grid-3">
          {attractions.map((a) => (
            <div className="card card--pad0 card--hover" key={a.id}>
              {a.image && <ImageFrame asset={a.image} variant="16-9" />}
              <div style={{ padding: 16 }}>
                <div className="between"><strong>{a.name}</strong><span className="badge">{a.category}</span></div>
                <p className="small muted" style={{ marginTop: 8 }}>{a.description}</p>
                <div className="row tiny muted" style={{ marginTop: 10 }}><Clock3 size={13} /> {a.typicalVisitMinutes ?? '—'} min · <MapPin size={13} /> {catalogue.destinations.find((d) => d.id === a.destinationId)?.name}</div>
                <button className="btn btn--secondary btn--sm btn--block" style={{ marginTop: 14 }} onClick={() => void planVisit(a.id, a.destinationId)}>Plan visit <ArrowRight size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid-2">
          <div className="stack">
            {offerings.map((o) => (
              <button key={o.id} className="card card--hover" style={{ width: '100%', textAlign: 'left', borderColor: selectedId === o.id ? 'var(--gw-champagne)' : undefined }} onClick={() => setSelectedId(o.id)}>
                <div className="between"><strong>{o.name}</strong><span className="badge badge--accent">{formatINR(o.pricePaise)} / guest</span></div>
                <p className="small muted" style={{ marginTop: 8 }}>{o.description}</p>
                <div className="row tiny muted" style={{ marginTop: 10 }}>{variant === 'package' ? <Ticket size={13} /> : <Sparkles size={13} />} {o.duration} · {o.includes.join(' · ')}</div>
                
              </button>
            ))}
            {offerings.length === 0 && <div className="empty-state"><h3>No offerings here yet</h3><p>Try another destination.</p></div>}
          </div>
          <div className="card" style={{ alignSelf: 'start' }}>
            <h3>{variant === 'package' ? 'Book this package' : 'Book this experience'}</h3>
            {selected ? <div className="stack" style={{ marginTop: 14 }}>
              <p className="small"><strong>{selected.name}</strong></p>
              <Stepper steps={["Travel details", "Review & pay"]} current={step - 1} />
              {step === 1 && <>
                <div className="grid-2" style={{ gap: 10 }}>
                  <Field label="Travel date"><input className="input" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                  <Field label="Travellers"><input className="input" type="number" min={1} max={20} value={guests} onChange={(e) => setGuests(Number(e.target.value))} /></Field>
                </div>
                <button type="button" className="btn btn--primary btn--block" disabled={!date} onClick={() => setStep(2)}>Review booking <ArrowRight size={17} /></button>
              </>}
              {step === 2 && <>
                <div className="small muted">{date} · {guests} traveller(s) · {selected.duration}</div>
                {quote && <PriceLines price={quote} title="Price breakdown" />}
                {error && <div className="notice notice--info" role="alert">{error}</div>}
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn btn--ghost" onClick={() => setStep(1)}>Back</button>
                  <button className="btn btn--primary" onClick={() => void book()} disabled={submitting}>{submitting ? 'Reserving…' : 'Continue to payment'} <ArrowRight size={17} /></button>
                </div>
                <p className="tiny muted">Your booking is confirmed once the operator accepts it.</p>
              </>}
            </div> : <p className="small muted" style={{ marginTop: 12 }}>Select an offering to continue.</p>}
          </div>
        </div>
      )}

      {variant === 'tourism' && <section className="section">
        <SectionHead eyebrow="Map" title="Attraction map" />
        <MapView pins={attractions.map((a) => ({ id: a.id, label: a.name, ...a.coords, kind: 'attraction' }))} height={320} />
      </section>}
      <ConnectedRecommendations destinationId={journey?.destinationId ?? destination ?? null} />
    </div>
  );
}
