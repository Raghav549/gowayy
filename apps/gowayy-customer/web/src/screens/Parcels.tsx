import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Package, ArrowRight, Route as RouteIcon } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { estimateRoute } from '@gowayy/location-engine';
import { priceParcel } from '@gowayy/pricing-engine';
import { formatDistance, formatDuration } from '@gowayy/shared-utils';
import { parcelBookingSchema } from '@gowayy/validation';
import { client, idemKey } from '../lib/client';
import { usePageMeta, useRequireAuth } from '../lib/guards';
import { useJourney } from '../store/useJourney';
import { useUI } from '../store/useUI';
import { Field, SectionHead, PriceLines } from '../components/ui';
import { PlaceSelect, ConnectedRecommendations } from './shared';
import { MapView } from '../components/MapView';

export function Parcels() {
  usePageMeta('Parcel delivery', 'Send a parcel between known pickup and delivery points with a distance-based server-calculated price.');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const requireAuth = useRequireAuth();
  const journey = useJourney((s) => s.journey);
  const showToast = useUI((s) => s.showToast);
  const [pickupId, setPickupId] = useState(journey?.pickup?.id ?? 'plc_siliguri_stand');
  const [dropoffId, setDropoffId] = useState(journey?.dropoff?.id ?? 'plc_darjeeling');
  const [weightKg, setWeightKg] = useState(1);
  const [description, setDescription] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = catalogue.places.find((p) => p.id === pickupId);
  const to = catalogue.places.find((p) => p.id === dropoffId);
  const route = useMemo(() => (from && to ? estimateRoute(from, to) : null), [from, to]);
  const quote = useMemo(() => (route ? priceParcel({ distanceKm: route.distanceKm, weightKg }) : null), [route, weightKg]);

  const submit = async () => {
    if (!requireAuth()) return;
    const input = { pickupId, dropoffId, weightKg, description, recipientPhone, journeyId: journey?.id ?? null };
    const parsed = parcelBookingSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { next[String(i.path[0])] = i.message; });
      setErrors(next); return;
    }
    setErrors({}); setServerError(null); setSubmitting(true);
    try {
      const booking = await client.bookParcel(parsed.data, idemKey());
      await qc.invalidateQueries({ queryKey: ['bookings'] });
      showToast('Parcel request created — awaiting a delivery partner', 'success');
      navigate(`/checkout/booking?booking=${booking.id}`);
    } catch (e) { setServerError(e instanceof Error ? e.message : 'Could not create parcel request'); }
    finally { setSubmitting(false); }
  };

  return (
    <div>
      <SectionHead eyebrow="Local commerce" title="Parcel delivery" subtitle="Pickup and delivery between known places, with a server-calculated distance-based price." />
      <div className="grid-2">
        <div className="card">
          <h3>Parcel details</h3>
          <div className="stack" style={{ marginTop: 16 }}>
            <Field label="Pickup" error={errors.pickupId}><PlaceSelect value={pickupId} onChange={setPickupId} label="Pickup" /></Field>
            <Field label="Delivery point" error={errors.dropoffId}><PlaceSelect value={dropoffId} onChange={setDropoffId} label="Delivery point" /></Field>
            <Field label="Weight (kg)" error={errors.weightKg}><input className="input" type="number" min={0.1} max={30} step={0.1} value={weightKg} onChange={(e) => setWeightKg(Number(e.target.value))} /></Field>
            <Field label="Contents description" error={errors.description}><input className="input" placeholder="e.g. Documents in a sealed envelope" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
            <Field label="Recipient phone" error={errors.recipientPhone}><input className="input" inputMode="numeric" maxLength={10} placeholder="10-digit mobile number" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value.replace(/\D/g, ''))} /></Field>
            <div className="notice"><Package size={14} /> Prohibited items, insurance and operator acceptance rules must be configured before real dispatch.</div>
          </div>
        </div>
        <div className="stack">
          <div className="card card--pad0"><MapView pins={[from && { ...from, label: from.name }, to && { ...to, label: to.name }].filter(Boolean) as never} route={route?.points} height={240} /></div>
          <div className="card">
            <div className="between"><h3>Price estimate</h3><span className="badge">Server-calculated</span></div>
            {route && quote && <>
              <div className="row small muted" style={{ margin: '14px 0', gap: 16 }}><span><RouteIcon size={14} /> {formatDistance(route.distanceKm)}</span><span>{formatDuration(route.durationMin)}</span></div>
              <PriceLines price={quote} />
            </>}
            {serverError && <div className="notice notice--info" style={{ marginTop: 12 }} role="alert">{serverError}</div>}
            <button className="btn btn--primary btn--block" style={{ marginTop: 16 }} onClick={() => void submit()} disabled={submitting}>{submitting ? 'Creating request…' : 'Request pickup'} <ArrowRight size={17} /></button>
            <p className="tiny muted" style={{ marginTop: 8 }}>A delivery partner must accept the job before dispatch.</p>
          </div>
        </div>
      </div>
      <ConnectedRecommendations destinationId={journey?.destinationId ?? null} />
    </div>
  );
}
