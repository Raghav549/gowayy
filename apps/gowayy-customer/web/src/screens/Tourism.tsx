import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, MapPin, Sparkles, Ticket, UsersRound } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { formatINR, addDays } from '@gowayy/shared-utils';
import type { Booking, ExperienceOffering } from '@gowayy/types';
import { client, idemKey } from '../lib/client';
import { usePageMeta, useRequireAuth } from '../lib/guards';
import { useJourney } from '../store/useJourney';
import { useUI } from '../store/useUI';
import { Field, SectionHead, PriceLines, ImageFrame, Stepper } from '../components/ui';
import { ConnectedRecommendations, DestinationSelect } from './shared';
import { MapView } from '../components/MapView';

type Variant = 'tourism' | 'package' | 'experience';

function localDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
const today = localDate();

function slotTime(value: string, includeDate = false) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', ...(includeDate ? { weekday: 'short', day: 'numeric', month: 'short' } : {}),
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(value));
}

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
  const [slotId, setSlotId] = useState('');
  const [guests, setGuests] = useState(journey?.travellers ?? 2);
  const [answers, setAnswers] = useState({ experienceLevel: '', additionalRequirements: '' });
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const bookingKey = useRef<string | null>(null);

  const offeringsQuery = useQuery({
    queryKey: ['experience-offerings', variant, destination],
    queryFn: () => client.experienceOfferings(destination || undefined, variant === 'package' ? 'package' : 'experience'),
    enabled: variant !== 'tourism',
  });
  const offerings = offeringsQuery.data?.items ?? [];
  const selected = offerings.find((offering) => offering.id === selectedId) ?? null;
  const slotsQuery = useQuery({
    queryKey: ['experience-slots', selected?.id, date],
    queryFn: () => client.experienceSlots(selected!.id, date),
    enabled: variant !== 'tourism' && step === 2 && Boolean(selected) && Boolean(date),
  });
  const slots = slotsQuery.data?.items ?? [];
  const selectedSlot = slots.find((slot) => slot.id === slotId) ?? null;
  const quoteQuery = useQuery({
    queryKey: ['experience-quote', slotId, guests],
    queryFn: () => client.experienceQuote(slotId, guests),
    enabled: variant !== 'tourism' && step === 3 && Boolean(slotId),
    retry: false,
  });

  const attractions = catalogue.attractions.filter((a) => (!destination || a.destinationId === destination));
  const attraction = catalogue.attractions.find((a) => a.id === params.get('attraction'));
  const isPackage = variant === 'package';

  const chooseOffering = (offering: ExperienceOffering) => {
    setSelectedId(offering.id); setStep(1); setSlotId(''); setError(null); setConfirmedBooking(null);
    bookingKey.current = null;
  };
  const chooseDate = (value: string) => {
    setDate(value); setSlotId(''); setError(null); bookingKey.current = null;
  };
  const chooseSlot = (id: string) => {
    setSlotId(id); setError(null); bookingKey.current = null;
  };

  const book = async () => {
    if (!requireAuth() || !selected || !selectedSlot || !quoteQuery.data || submitting) return;
    setSubmitting(true); setError(null);
    bookingKey.current ??= idemKey();
    try {
      const booking = await client.bookTourism({
        offeringId: selected.id, service: variant, slotId: selectedSlot.id, date, guests,
        answers: { experienceLevel: answers.experienceLevel, additionalRequirements: answers.additionalRequirements.trim() },
        journeyId: journey?.id ?? null,
      }, bookingKey.current);
      setConfirmedBooking(booking); setStep(4);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['bookings'] }),
        qc.invalidateQueries({ queryKey: ['experience-slots', selected.id, date] }),
        qc.invalidateQueries({ queryKey: ['experience-offerings'] }),
      ]);
      showToast(`Booking ${booking.reference} saved`, 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create booking');
      await qc.invalidateQueries({ queryKey: ['experience-slots', selected.id, date] });
    } finally { setSubmitting(false); }
  };

  const planVisit = async (destinationId: string) => {
    await patch({ destinationId, title: `My ${catalogue.destinations.find((d) => d.id === destinationId)?.name ?? 'journey'} trip` });
    showToast('Attraction added to your journey context', 'success');
    navigate(`/destinations/${catalogue.destinations.find((d) => d.id === destinationId)?.slug ?? ''}`);
  };

  return (
    <div>
      <SectionHead eyebrow={variant === 'tourism' ? 'Sightseeing' : isPackage ? 'Packages' : 'Experiences'}
        title={variant === 'tourism' ? 'Tourism & attractions' : isPackage ? 'Sightseeing packages' : 'Local Experiences'}
        subtitle={variant === 'tourism' ? 'Plan attractions and connect them with transport, stays and food.' : undefined} />
      <div style={{ maxWidth: 320, marginBottom: 18 }}><DestinationSelect value={destination} onChange={(value) => { setDestination(value); setSelectedId(''); setSlotId(''); setStep(1); }} label="Filter by destination" /></div>

      {attraction && variant === 'tourism' && <div className="card" style={{ marginBottom: 18, borderColor: 'var(--gw-champagne)' }}>
        <div className="between"><h3>{attraction.name}</h3><span className="badge">{attraction.category}</span></div>
        <p className="small muted" style={{ marginTop: 8 }}>{attraction.description}</p>
        <p className="tiny muted" style={{ marginTop: 8 }}>Typical visit {attraction.typicalVisitMinutes} min · {attraction.infoStatus === 'community-reference' ? 'community reference — verify locally' : 'published reference'}</p>
        <button className="btn btn--primary btn--sm" style={{ marginTop: 12 }} onClick={() => void planVisit(attraction.destinationId)}>Plan this visit <ArrowRight size={15} /></button>
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
                <button className="btn btn--secondary btn--sm btn--block" style={{ marginTop: 14 }} onClick={() => void planVisit(a.destinationId)}>Plan visit <ArrowRight size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="stack" aria-label={isPackage ? 'Available packages' : 'Available experiences'}>
            {offeringsQuery.isLoading && <div className="card muted" role="status">Loading verified host offerings…</div>}
            {offeringsQuery.isError && <div className="notice notice--info" role="alert">
              {offeringsQuery.error instanceof Error ? offeringsQuery.error.message : 'Could not load offerings'}
              <button className="btn btn--ghost btn--sm" style={{ marginLeft: 8 }} onClick={() => void offeringsQuery.refetch()}>Retry</button>
            </div>}
            {!offeringsQuery.isLoading && !offeringsQuery.isError && offerings.length === 0 && <div className="empty-state">
              <h3>No verified host offerings here yet</h3><p>Try another destination. Offerings appear only after a verified host publishes them.</p>
            </div>}
            {offerings.map((offering) => (
              <button type="button" key={offering.id} className="card card--hover" aria-pressed={selectedId === offering.id}
                style={{ width: '100%', minWidth: 0, textAlign: 'left', borderColor: selectedId === offering.id ? 'var(--gw-champagne)' : undefined }}
                onClick={() => chooseOffering(offering)}>
                <div className="between row--wrap" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <strong style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{offering.name}</strong>
                  <span className="badge badge--accent" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatINR(offering.pricePaise)} / guest</span>
                </div>
                {offering.description && <p className="small muted" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>{offering.description}</p>}
                <div className="row tiny muted row--wrap" style={{ marginTop: 10, gap: 7 }}>
                  {isPackage ? <Ticket size={13} /> : <Sparkles size={13} />}<span>{offering.durationHours} h</span><span>·</span>
                  <MapPin size={13} /><span>{offering.destinationName ?? 'Location not supplied'}</span><span>·</span><span>Host: {offering.host.name ?? 'name not supplied'}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="card" style={{ minWidth: 0, alignSelf: 'start' }}>
            {selected ? <div className="stack" style={{ marginTop: 0 }}>
              <div className="between row--wrap"><h3 style={{ margin: 0 }}>{selected.name}</h3><span className="badge">{isPackage ? 'Package' : 'Experience'}</span></div>
              <Stepper steps={['Select', 'Details', 'Review', 'Confirmed']} current={step - 1} />

              {step === 1 && <>
                <p className="small muted" style={{ margin: 0 }}>{selected.description || 'The host has not added a description.'}</p>
                <div className="list">
                  <div className="list-row"><Clock3 size={16} /><span className="list-row__body"><span className="list-row__title">{selected.durationHours} hours</span><span className="list-row__sub">Duration supplied by the host</span></span></div>
                  <div className="list-row"><MapPin size={16} /><span className="list-row__body"><span className="list-row__title">{selected.meetingPoint || 'Meeting point not supplied yet'}</span><span className="list-row__sub">{selected.destinationName ?? 'Destination not supplied'}</span></span></div>
                  <div className="list-row"><UsersRound size={16} /><span className="list-row__body"><span className="list-row__title">Hosted by {selected.host.name ?? 'a verified host (name not supplied)'}</span><span className="list-row__sub">Up to {selected.capacity} guests per slot</span></span></div>
                </div>
                <div className="notice"><strong>Before you book</strong><p className="small" style={{ marginBottom: 0 }}>{selected.requirements || 'No additional requirements were supplied by the host.'}</p></div>
                <button type="button" className="btn btn--primary btn--block" onClick={() => { setStep(2); setError(null); }}>Choose date & guests <ArrowRight size={17} /></button>
              </>}

              {step === 2 && <>
                <div className="grid-2" style={{ gap: 10 }}>
                  <Field label="Date"><input className="input" type="date" min={today} value={date} onChange={(e) => chooseDate(e.target.value)} /></Field>
                  <Field label="Guests"><input className="input" type="number" min={1} max={20} inputMode="numeric" value={guests} onChange={(e) => { setGuests(Math.max(1, Math.min(20, Number(e.target.value)))); bookingKey.current = null; }} /></Field>
                </div>
                <Field label="Available times" hint={date ? `Times shown in India Standard Time for ${date}.` : 'Choose a date first.'}>
                  <div className="stack" style={{ gap: 8 }}>
                    {slotsQuery.isLoading && <p className="small muted" role="status">Checking real availability…</p>}
                    {slotsQuery.isError && <div className="notice notice--info" role="alert">{slotsQuery.error instanceof Error ? slotsQuery.error.message : 'Could not load slots'} <button type="button" className="btn btn--ghost btn--sm" onClick={() => void slotsQuery.refetch()}>Retry</button></div>}
                    {!slotsQuery.isLoading && !slotsQuery.isError && slots.length === 0 && <div className="notice" style={{ margin: 0 }}><CalendarDays size={17} /><p className="small" style={{ margin: 0 }}>No future slots are published for this date. Try another date.</p></div>}
                    {slots.map((slot) => <button type="button" key={slot.id} className={`btn ${slotId === slot.id ? 'btn--primary' : 'btn--secondary'}`}
                      aria-pressed={slotId === slot.id} disabled={slot.available < 1} onClick={() => chooseSlot(slot.id)}
                      style={{ width: '100%', minWidth: 0, height: 'auto', minHeight: 48, padding: '10px 12px', justifyContent: 'space-between', flexWrap: 'wrap', whiteSpace: 'normal' }}>
                      <span>{slotTime(slot.startsAt)}–{slotTime(slot.endsAt)}</span><span className="tiny">{slot.available < 1 ? 'Full' : `${slot.available} place${slot.available === 1 ? '' : 's'} left`}</span>
                    </button>)}
                  </div>
                </Field>
                {selectedSlot && selectedSlot.available < guests && <div className="notice notice--info" role="alert">Only {selectedSlot.available} place(s) remain. Reduce the guest count or choose another slot.</div>}
                <Field label="Have you joined this kind of experience before?"><select className="input" value={answers.experienceLevel} onChange={(e) => setAnswers({ ...answers, experienceLevel: e.target.value })}>
                  <option value="">Choose an answer</option><option value="first-time">This is my first time</option><option value="some-experience">I have some experience</option><option value="experienced">I am experienced</option>
                </select></Field>
                <Field label="Accessibility, dietary or other requirements (optional)"><textarea className="input" rows={3} maxLength={1000} value={answers.additionalRequirements} onChange={(e) => setAnswers({ ...answers, additionalRequirements: e.target.value })} placeholder="Share anything the host should know" /></Field>
                <div className="row" style={{ gap: 8 }}><button type="button" className="btn btn--ghost" onClick={() => setStep(1)}>Back</button><button type="button" className="btn btn--primary" disabled={!selectedSlot || selectedSlot.available < guests || !answers.experienceLevel} onClick={() => { setError(null); bookingKey.current = null; setStep(3); }}>Review booking <ArrowRight size={16} /></button></div>
              </>}

              {step === 3 && <>
                {quoteQuery.isLoading && <div className="notice" role="status">Fetching the latest server price and availability…</div>}
                {quoteQuery.isError && <div className="notice notice--info" role="alert">{quoteQuery.error instanceof Error ? quoteQuery.error.message : 'Could not quote this slot'}<button type="button" className="btn btn--ghost btn--sm" onClick={() => void quoteQuery.refetch()}>Retry quote</button></div>}
                {quoteQuery.data && <div className="stack">
                  <div className="list">
                    <div className="list-row"><span className="list-row__body"><span className="list-row__title">{selected.name}</span><span className="list-row__sub">{isPackage ? 'Host-run package' : 'Local experience'} · Hosted by {selected.host.name ?? 'name not supplied'}</span></span></div>
                    <div className="list-row"><CalendarDays size={16} /><span className="list-row__body"><span className="list-row__title">{slotTime(quoteQuery.data.slot.startsAt, true)}</span><span className="list-row__sub">{slotTime(quoteQuery.data.slot.startsAt)}–{slotTime(quoteQuery.data.slot.endsAt)} IST</span></span></div>
                    <div className="list-row"><UsersRound size={16} /><span className="list-row__body"><span className="list-row__title">{guests} guest{guests === 1 ? '' : 's'}</span><span className="list-row__sub">{answers.experienceLevel.replace(/-/g, ' ')}</span></span></div>
                    <div className="list-row"><MapPin size={16} /><span className="list-row__body"><span className="list-row__title">{selected.meetingPoint || 'Meeting point not supplied yet'}</span><span className="list-row__sub">Host requirements: {selected.requirements || 'none supplied'}</span></span></div>
                  </div>
                  {answers.additionalRequirements.trim() && <div className="notice"><strong>Your note for the host</strong><p className="small" style={{ marginBottom: 0, overflowWrap: 'anywhere' }}>{answers.additionalRequirements.trim()}</p></div>}
                  <PriceLines price={quoteQuery.data.price} title="Server price breakdown" />
                  {error && <div className="notice notice--info" role="alert">{error}</div>}
                  <div className="row" style={{ gap: 8 }}><button type="button" className="btn btn--ghost" disabled={submitting} onClick={() => setStep(2)}>Back</button><button type="button" className="btn btn--primary" disabled={submitting} onClick={() => void book()}>{submitting ? 'Saving booking…' : 'Submit booking request'} <ArrowRight size={16} /></button></div>
                  <p className="tiny muted" style={{ margin: 0 }}>The server checks the slot and price again before saving. Your request is sent to the host.</p>
                </div>}
              </>}

              {step === 4 && confirmedBooking && <div className="stack" style={{ textAlign: 'center' }}>
                <CheckCircle2 size={42} color="var(--gw-success)" style={{ alignSelf: 'center' }} />
                <div><h3 style={{ marginBottom: 5 }}>Booking request saved</h3><p className="small muted" style={{ margin: 0 }}>Reference <strong>{confirmedBooking.reference}</strong></p></div>
                <div className="notice" style={{ textAlign: 'left' }}><strong>{confirmedBooking.title}</strong><p className="small" style={{ marginBottom: 0 }}>{date} · {slotTime(confirmedBooking.details.startsAt as string)}–{slotTime(confirmedBooking.details.endsAt as string)} IST · {guests} guest{guests === 1 ? '' : 's'}<br />Total {formatINR(confirmedBooking.price.totalPaise)} · {confirmedBooking.status}</p></div>
                <button type="button" className="btn btn--primary btn--block" onClick={() => navigate(`/checkout/booking?booking=${confirmedBooking.id}`)}>Continue to payment <ArrowRight size={16} /></button>
                <p className="tiny muted" style={{ margin: 0 }}>Your booking is stored. The host has been notified; confirmation and payment state are tracked against this reference.</p>
              </div>}
            </div> : <>
              <h3>{isPackage ? 'Choose a package' : 'Choose an experience'}</h3>
              <p className="small muted">Select a verified host offering to see its details and real availability.</p>
            </>}
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
