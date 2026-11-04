import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BedDouble, ArrowRight, MapPin, Users, Check, Star, CalendarDays } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { stayBookingSchema, type StayBookingInput } from '@gowayy/validation';
import { formatINR, nightsBetween, addDays } from '@gowayy/shared-utils';
import { priceStay } from '@gowayy/pricing-engine';
import { client, idemKey } from '../lib/client';
import { usePageMeta, useRequireAuth } from '../lib/guards';
import { useJourney } from '../store/useJourney';
import { useUI } from '../store/useUI';
import { Field, SectionHead, PriceLines, ImageFrame, EmptyState, StatusBadge } from '../components/ui';
import { DestinationSelect, DemoListingBadge, ConnectedRecommendations, DataNotice } from './shared';
import { MapView } from '../components/MapView';

const today = new Date().toISOString().slice(0, 10);

export function Hotels() {
  usePageMeta('Hotels, homestays & lodges', 'Filter hotels, homestays, lodges, guesthouses and hostels by destination, dates, guests, price and amenities.');
  const [destination, setDestination] = useState('');
  const [type, setType] = useState('');
  const [maxPrice, setMaxPrice] = useState(0);
  const [amenity, setAmenity] = useState('');
  const journey = useJourney((s) => s.journey);
  const amenities = Array.from(new Set(catalogue.properties.flatMap((p) => p.amenities)));
  const list = catalogue.properties.filter((p) =>
    (!destination || p.destinationId === destination) &&
    (!type || p.propertyType === type) &&
    (!maxPrice || Math.min(...p.rooms.map((r) => r.nightlyRatePaise)) <= maxPrice * 100) &&
    (!amenity || p.amenities.includes(amenity)));

  return (
    <div>
      <SectionHead eyebrow="Stays" title="Hotels, homestays & lodges" subtitle="Every property has independent seeded room inventory; availability is checked on the server for every night." />
      <div className="card card--flat grid-4" style={{ marginBottom: 20 }}>
        <DestinationSelect value={destination} onChange={setDestination} label="Destination" />
        <Field label="Property type"><select className="select" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{['hotel','homestay','lodge','guesthouse','resort','hostel','camp'].map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
        <Field label="Max price / night"><select className="select" value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))}><option value={0}>Any price</option>{[2000,4000,6000,9000].map((p) => <option key={p} value={p}>Up to {formatINR(p * 100)}</option>)}</select></Field>
        <Field label="Amenity"><select className="select" value={amenity} onChange={(e) => setAmenity(e.target.value)}><option value="">Any amenity</option>{amenities.map((a) => <option key={a} value={a}>{a}</option>)}</select></Field>
      </div>
      <div className="grid-3">
        {list.map((p) => (
          <Link key={p.id} to={`/hotels/${p.id}`} className="card card--pad0 card--hover" style={{ display: 'block' }}>
            {p.image && <ImageFrame asset={p.image} variant="16-9" />}
            <div style={{ padding: 16 }}>
              <div className="between"><strong>{p.name}</strong><DemoListingBadge /></div>
              <div className="small muted" style={{ marginTop: 6 }}><BedDouble size={14} /> {p.propertyType} · {catalogue.destinations.find((d) => d.id === p.destinationId)?.name}</div>
              <div className="tag-list" style={{ marginTop: 10 }}>{p.amenities.slice(0, 3).map((a) => <span className="tag" key={a}>{a}</span>)}</div>
              <div className="between" style={{ marginTop: 14 }}><span className="small">from <strong>{formatINR(Math.min(...p.rooms.map((r) => r.nightlyRatePaise)))}</strong> / night</span><ArrowRight size={16} /></div>
              <p className="tiny muted" style={{ marginTop: 8 }}>No ratings shown: only reviews from completed bookings are displayed.</p>
            </div>
          </Link>
        ))}
      </div>
      {list.length === 0 && <EmptyState title="No properties match" body="Adjust the filters to see seeded listings." />}
      <ConnectedRecommendations destinationId={journey?.destinationId ?? destination ?? null} />
      <DataNotice />
    </div>
  );
}

export function PropertyDetail() {
  const { id } = useParams();
  const property = catalogue.properties.find((p) => p.id === id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const requireAuth = useRequireAuth();
  const journey = useJourney((s) => s.journey);
  const showToast = useUI((s) => s.showToast);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  usePageMeta(property?.name ?? 'Property');

  const reviews = useQuery({ queryKey: ['reviews', id], queryFn: () => client.reviews(id), enabled: Boolean(id) });
  const form = useForm<StayBookingInput>({ resolver: zodResolver(stayBookingSchema), mode: 'onChange', defaultValues: {
    propertyId: property?.id ?? '', roomId: property?.rooms[0]?.id ?? '', checkIn: addDays(today, 1), checkOut: addDays(today, 2),
    adults: 2, children: 0, rooms: 1, guestName: '', journeyId: journey?.id ?? null,
  } });
  const values = form.watch();
  const room = property?.rooms.find((r) => r.id === values.roomId);
  const nights = nightsBetween(values.checkIn, values.checkOut);
  const quote = useMemo(() => (property && room && nights > 0 ? priceStay({ nightlyRatePaise: room.nightlyRatePaise, nights, rooms: values.rooms, taxesPercent: property.taxesPercent }) : null), [property, room, nights, values.rooms]);

  if (!property) return <EmptyState title="Property not found" body="This listing is not in the catalogue." action={<Link className="btn btn--primary" to="/hotels">Back to stays</Link>} />;

  const submit = form.handleSubmit(async (d) => {
    if (!requireAuth()) return;
    setSubmitting(true); setServerError(null);
    try {
      const booking = await client.bookStay(d, idemKey());
      await qc.invalidateQueries({ queryKey: ['bookings'] });
      showToast('Reservation request created — awaiting property confirmation', 'success');
      navigate(`/checkout?booking=${booking.id}`);
    } catch (e) { setServerError(e instanceof Error ? e.message : 'Could not create reservation'); }
    finally { setSubmitting(false); }
  });

  return (
    <div>
      <Link className="btn btn--ghost btn--sm" to="/hotels">← All stays</Link>
      <div style={{ marginTop: 12 }}>{property.image && <ImageFrame asset={property.image} variant="hero" />}</div>
      <div className="between row--wrap" style={{ marginTop: 20 }}>
        <div><div className="eyebrow">{property.propertyType} · demo listing</div><h1 style={{ marginTop: 6 }}>{property.name}</h1><p className="muted small row" style={{ marginTop: 8 }}><MapPin size={14} /> {catalogue.destinations.find((d) => d.id === property.destinationId)?.name}</p></div>
        <div className="row"><DemoListingBadge /></div>
      </div>

      <div className="grid-2 section" style={{ marginTop: 26 }}>
        <div className="stack">
          <div className="card"><h3>About this property</h3><p className="small muted" style={{ marginTop: 8 }}>{property.description}</p>
            <div className="tag-list" style={{ marginTop: 14 }}>{property.amenities.map((a) => <span className="tag" key={a}><Check size={11} /> {a}</span>)}</div>
            <div className="divider" />
            <div className="stack small"><div><strong>House rules.</strong> <span className="muted">{property.houseRules}</span></div><div><strong>Cancellation.</strong> <span className="muted">{property.cancellationPolicy}</span></div><div><strong>Taxes.</strong> <span className="muted">{property.taxesPercent}% on the room subtotal.</span></div></div>
          </div>
          <div className="card">
            <h3>Rooms</h3>
            <div className="list" style={{ marginTop: 12 }}>
              {property.rooms.map((r) => (
                <button key={r.id} className="list-row" style={{ width: '100%', textAlign: 'left', borderColor: values.roomId === r.id ? 'var(--gw-champagne)' : undefined }} onClick={() => form.setValue('roomId', r.id, { shouldValidate: true })}>
                  <span className="list-row__body"><span className="list-row__title">{r.name}</span><span className="list-row__sub">{r.capacityAdults} adults · {r.capacityChildren} children · {r.totalRooms} units in seeded inventory</span></span>
                  <span className="small"><strong>{formatINR(r.nightlyRatePaise)}</strong>/night</span>
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>Verified reviews</h3>
            {reviews.data?.length === 0 && <p className="small muted" style={{ marginTop: 8 }}>No verified reviews yet. Ratings are only shown after a completed booking — none are fabricated.</p>}
            <div className="list" style={{ marginTop: 10 }}>{reviews.data?.map((r) => <div className="card card--flat" key={r.id}><div className="row"><Star size={14} fill="var(--gw-champagne)" color="var(--gw-champagne)" /> <strong className="small">{r.rating}/5</strong></div><p className="small muted" style={{ marginTop: 6 }}>{r.comment || 'No comment'}</p></div>)}</div>
          </div>
          <div className="card card--pad0"><MapView pins={[{ id: property.id, label: property.name, ...property.coords, kind: 'hotel' }]} height={220} /></div>
        </div>

        <form className="card" onSubmit={submit} noValidate style={{ alignSelf: 'start' }}>
          <h3>Reserve a room</h3>
          <div className="stack" style={{ marginTop: 14 }}>
            <div className="grid-2" style={{ gap: 10 }}>
              <Field label="Check-in" error={form.formState.errors.checkIn?.message}><input className="input" type="date" min={today} {...form.register('checkIn')} /></Field>
              <Field label="Check-out" error={form.formState.errors.checkOut?.message}><input className="input" type="date" min={values.checkIn} {...form.register('checkOut')} /></Field>
            </div>
            <div className="grid-2" style={{ gap: 10 }}>
              <Field label="Adults"><input className="input" type="number" min={1} max={12} {...form.register('adults', { valueAsNumber: true })} /></Field>
              <Field label="Children"><input className="input" type="number" min={0} max={12} {...form.register('children', { valueAsNumber: true })} /></Field>
            </div>
            <div className="grid-2" style={{ gap: 10 }}>
              <Field label="Rooms"><input className="input" type="number" min={1} max={8} {...form.register('rooms', { valueAsNumber: true })} /></Field>
              <Field label="Guest name" error={form.formState.errors.guestName?.message}><input className="input" placeholder="Full name" {...form.register('guestName')} /></Field>
            </div>
            {quote && <PriceLines price={quote} title={`${nights} night(s) · ${values.rooms} room(s)`} />}
            {!quote && <p className="small muted">Choose valid dates to see a price.</p>}
            {serverError && <div className="notice notice--demo" role="alert">{serverError}</div>}
            <button className="btn btn--primary btn--block" type="submit" disabled={!form.formState.isValid || !quote || submitting}>{submitting ? 'Sending request…' : 'Request reservation'} <ArrowRight size={17} /></button>
            <p className="tiny muted">Availability is checked server-side for every night. Confirmation requires the property partner to accept.</p>
          </div>
        </form>
      </div>
      <ConnectedRecommendations destinationId={property.destinationId} title="Complete your stay" />
    </div>
  );
}
