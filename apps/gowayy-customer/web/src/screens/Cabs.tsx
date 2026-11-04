import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CarFront, Users, Clock3, Route as RouteIcon, ArrowRight, Info, CalendarClock, MapPin } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { cabBookingSchema, type CabBookingInput } from '@gowayy/validation';
import { formatINR, formatDistance, formatDuration } from '@gowayy/shared-utils';
import { estimateRoute } from '@gowayy/location-engine';
import { quoteCabFare, quoteSharedTaxiFare } from '@gowayy/pricing-engine';
import { client, idemKey } from '../lib/client';
import { usePageMeta, useRequireAuth } from '../lib/guards';
import { useJourney } from '../store/useJourney';
import { useUI } from '../store/useUI';
import { Field, SectionHead, PriceLines, Stepper } from '../components/ui';
import { PlaceSelect, ConnectedRecommendations } from './shared';
import { MapView } from '../components/MapView';

export function Cabs() {
  usePageMeta('Book cabs & shared taxis', 'Book hatchbacks, sedans, SUVs, airport transfers, outstation cabs and operator-defined shared taxis with a server-calculated fare.');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const requireAuth = useRequireAuth();
  const journey = useJourney((s) => s.journey);
  const patchJourney = useJourney((s) => s.patch);
  const showToast = useUI((s) => s.showToast);
  const [tab, setTab] = useState<'private' | 'shared'>(params.get('shared') ? 'shared' : 'private');
  const [sharedRouteId, setSharedRouteId] = useState(params.get('shared') ?? catalogue.sharedTaxiRoutes[0]?.id ?? '');
  const [sharedSeats, setSharedSeats] = useState(1);
  const [departureTime, setDepartureTime] = useState('');
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CabBookingInput>({
    resolver: zodResolver(cabBookingSchema), mode: 'onChange',
    defaultValues: {
      pickupId: journey?.pickup?.id ?? 'plc_bagdogra', dropoffId: journey?.dropoff?.id ?? 'plc_darjeeling',
      vehicleClassId: 'sedan', tripType: 'one_way', scheduledAt: null, passengers: journey?.travellers ?? 1, journeyId: journey?.id ?? null,
    },
  });
  useEffect(() => {
    if (journey) {
      form.setValue('journeyId', journey.id);
      if (journey.pickup) form.setValue('pickupId', journey.pickup.id);
      if (journey.dropoff) form.setValue('dropoffId', journey.dropoff.id);
      if (journey.travellers) form.setValue('passengers', journey.travellers);
    }
  }, [journey, form]);

  const values = form.watch();
  const from = catalogue.places.find((p) => p.id === values.pickupId);
  const to = catalogue.places.find((p) => p.id === values.dropoffId);
  const vehicle = catalogue.vehicles.find((v) => v.id === values.vehicleClassId);
  const route = useMemo(() => (from && to ? estimateRoute(from, to) : null), [from, to]);
  const quote = useMemo(() => (route && vehicle ? quoteCabFare({ distanceKm: route.distanceKm, durationMin: route.durationMin, vehicle, tripType: values.tripType, passengers: values.passengers }) : null), [route, vehicle, values.tripType, values.passengers]);

  const sharedRoute = catalogue.sharedTaxiRoutes.find((r) => r.id === sharedRouteId);
  const sharedQuote = sharedRoute ? quoteSharedTaxiFare(sharedRoute.pricePaise, sharedSeats) : null;

  const submit = form.handleSubmit(async (d) => {
    if (!requireAuth()) return;
    setSubmitting(true); setServerError(null);
    try {
      const booking = await client.bookCab(d, idemKey());
      await patchJourney({ pickup: d.pickupId, dropoff: d.dropoffId, travellers: d.passengers });
      await qc.invalidateQueries({ queryKey: ['bookings'] });
      showToast('Cab request created — awaiting partner confirmation', 'success');
      navigate(`/checkout/booking?booking=${booking.id}`);
    } catch (e) { setServerError(e instanceof Error ? e.message : 'Could not create the booking'); }
    finally { setSubmitting(false); }
  });

  const submitShared = async () => {
    if (!requireAuth() || !sharedRoute) return;
    setSubmitting(true); setServerError(null);
    try {
      const booking = await client.bookSharedTaxi({ routeId: sharedRoute.id, seats: sharedSeats, departureTime: departureTime || sharedRoute.departureTimes[0], journeyId: journey?.id ?? null }, idemKey());
      await qc.invalidateQueries({ queryKey: ['bookings'] });
      showToast('Shared-taxi seat request created', 'success');
      navigate(`/checkout/booking?booking=${booking.id}`);
    } catch (e) { setServerError(e instanceof Error ? e.message : 'Could not create the booking'); }
    finally { setSubmitting(false); }
  };

  return (
    <div>
      <SectionHead eyebrow="Transport" title="Cabs & shared taxis" subtitle="Airport transfers, outstation cabs and fixed-route shared taxis across the hills." />
      <Stepper steps={["Ride details", "Choose vehicle", "Review & pay"]} current={step - 1} />
      <div className="chips" style={{ marginBottom: 18 }}>
        <button className={`chip ${tab === 'private' ? 'active' : ''}`} onClick={() => setTab('private')}>Private cab</button>
        <button className={`chip ${tab === 'shared' ? 'active' : ''}`} onClick={() => setTab('shared')}>Shared taxi</button>
      </div>

      {tab === 'private' ? (
        <form onSubmit={submit} className="grid-2" noValidate>
          <div className="card">
            <h3>{step === 1 ? "Where are you going?" : "Choose a vehicle"}</h3>
            <div className="stack" style={{ marginTop: 16 }}>
              <Field label="Pickup" error={form.formState.errors.pickupId?.message}><PlaceSelect value={values.pickupId} onChange={(v) => form.setValue('pickupId', v, { shouldValidate: true })} label="Pickup" /></Field>
              <Field label="Destination" error={form.formState.errors.dropoffId?.message}><PlaceSelect value={values.dropoffId} onChange={(v) => form.setValue('dropoffId', v, { shouldValidate: true })} label="Destination" /></Field>
              <div className="grid-2" style={{ gap: 12 }}>
                <Field label="Trip type"><select className="select" value={values.tripType} onChange={(e) => form.setValue('tripType', e.target.value as 'one_way' | 'round_trip')}><option value="one_way">One way</option><option value="round_trip">Round trip</option></select></Field>
                <Field label="Passengers" error={form.formState.errors.passengers?.message}><input className="input" type="number" min={1} max={8} {...form.register('passengers', { valueAsNumber: true })} /></Field>
              </div>
              <Field label="Schedule (optional)" hint="Leave empty for an on-request pickup."><input className="input" type="datetime-local" onChange={(e) => form.setValue('scheduledAt', e.target.value ? new Date(e.target.value).toISOString() : null)} /></Field>
              {step === 2 && <div>
                <div className="label" style={{ marginBottom: 8 }}>Vehicle class</div>
                <div className="grid-2" style={{ gap: 8 }}>
                  {catalogue.vehicles.filter((v) => v.category !== 'shared').map((v) => (
                    <button type="button" key={v.id} className={`card card--flat ${values.vehicleClassId === v.id ? '' : ''}`} style={{ textAlign: 'left', borderColor: values.vehicleClassId === v.id ? 'var(--gw-champagne)' : undefined, padding: 12 }} onClick={() => form.setValue('vehicleClassId', v.id, { shouldValidate: true })}>
                      <div className="between"><strong className="small">{v.name}</strong>{values.vehicleClassId === v.id && <span className="badge badge--accent">Selected</span>}</div>
                      <div className="tiny muted" style={{ marginTop: 4 }}>{v.seats} seats · {formatINR(v.perKmPaise)}/km</div>
                    </button>
                  ))}
                </div>
              </div>}
              {step === 1 && <button type="button" className="btn btn--primary btn--block" disabled={!values.pickupId || !values.dropoffId} onClick={() => setStep(2)}>See vehicles <ArrowRight size={17} /></button>}
            </div>
          </div>
          <div className="stack">
            <div className="card card--pad0">
              <MapView pins={[from && { ...from, label: from.name, kind: from.kind }, to && { ...to, label: to.name, kind: to.kind }].filter(Boolean) as never}
                route={route?.points} height={240} />
            </div>
            {step === 2 && <div className="card">
              <div className="between"><h3>Fare estimate</h3></div>
              {route && quote ? <>
                <div className="grid-2" style={{ gap: 8, margin: '14px 0' }}>
                  <div className="card card--flat"><div className="eyebrow">Distance</div><div className="small" style={{ marginTop: 4 }}><RouteIcon size={14} /> {formatDistance(route.distanceKm)}</div></div>
                  <div className="card card--flat"><div className="eyebrow">Estimated time</div><div className="small" style={{ marginTop: 4 }}><Clock3 size={14} /> {formatDuration(route.durationMin)}</div></div>
                </div>
                <PriceLines price={quote} />
              </> : <p className="small muted" style={{ marginTop: 10 }}>Choose a pickup, destination and vehicle to see a fare estimate.</p>}
              {serverError && <div className="notice notice--info" style={{ marginTop: 12 }} role="alert">{serverError}</div>}
              <div className="row row--wrap" style={{ marginTop: 16, gap: 8 }}>
                <button type="button" className="btn btn--ghost" onClick={() => setStep(1)}><ArrowRight size={16} style={{ transform: 'rotate(180deg)' }} /> Back</button>
                <button className="btn btn--primary" type="submit" disabled={!form.formState.isValid || !quote || submitting}>{submitting ? 'Reserving…' : 'Continue to payment'} <ArrowRight size={17} /></button>
              </div>
            </div>}
          </div>
        </form>
      ) : (
        <div className="grid-2">
          <div className="card">
            <h3>Designated stands & fixed routes</h3>
            <p className="small muted" style={{ marginTop: 6 }}>Fixed routes, departure windows and per-seat fares published by the operator.</p>
            <div className="list" style={{ marginTop: 16 }}>
              {catalogue.sharedTaxiRoutes.map((r) => (
                <button key={r.id} className="list-row" style={{ width: '100%', textAlign: 'left', borderColor: sharedRouteId === r.id ? 'var(--gw-champagne)' : undefined }} onClick={() => { setSharedRouteId(r.id); setDepartureTime(r.departureTimes[0] ?? ''); }}>
                  <CarFront size={18} style={{ color: 'var(--gw-champagne)' }} />
                  <span className="list-row__body"><span className="list-row__title">{catalogue.places.find((p) => p.id === r.fromId)?.name} → {catalogue.places.find((p) => p.id === r.toId)?.name}</span><span className="list-row__sub">{r.stand} · {formatINR(r.pricePaise)} / seat · {r.seatsTotal} seats</span></span>
                </button>
              ))}
            </div>
            {step === 1 && <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 16 }} disabled={!sharedRoute} onClick={() => setStep(2)}>Choose seats <ArrowRight size={17} /></button>}
          </div>
          {step === 2 && <div className="card">
            <h3>Seats, departure & review</h3>
            {sharedRoute && <div className="stack" style={{ marginTop: 16 }}>
              <div className="notice notice--info"><Info size={14} /> {sharedRoute.permitNote}</div>
              <Field label="Departure"><select className="select" value={departureTime || sharedRoute.departureTimes[0]} onChange={(e) => setDepartureTime(e.target.value)}>{sharedRoute.departureTimes.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
              <Field label="Seats"><div className="row"><button type="button" className="btn btn--secondary btn--sm" onClick={() => setSharedSeats(Math.max(1, sharedSeats - 1))}>−</button><strong style={{ minWidth: 24, textAlign: 'center' }}>{sharedSeats}</strong><button type="button" className="btn btn--secondary btn--sm" onClick={() => setSharedSeats(Math.min(8, sharedSeats + 1))}>+</button><span className="small muted row"><Users size={14} /> {sharedRoute.seatsTotal} total seats</span></div></Field>
              {sharedQuote && <PriceLines price={sharedQuote} title="Operator fare" />}
              {serverError && <div className="notice notice--info" role="alert">{serverError}</div>}
              <div className="row row--wrap" style={{ gap: 8 }}>
                <button type="button" className="btn btn--ghost" onClick={() => setStep(1)}><ArrowRight size={16} style={{ transform: 'rotate(180deg)' }} /> Back</button>
                <button className="btn btn--primary" onClick={() => void submitShared()} disabled={submitting}>{submitting ? 'Reserving…' : 'Continue to payment'} <ArrowRight size={17} /></button>
              </div>
            </div>}
          </div>}
        </div>
      )}

      <ConnectedRecommendations destinationId={journey?.destinationId ?? null} />
    </div>
  );
}
