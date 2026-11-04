import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CarFront, UtensilsCrossed, ShoppingBasket, BedDouble, Mountain, FileCheck } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { client } from '../lib/client';
import { useUI } from '../store';
import { Field } from '@gowayy/ui';

const TYPES = [
  { id: 'driver', label: 'Driver / delivery partner', icon: CarFront, hint: 'Cabs, shared taxis, parcels, food & grocery delivery' },
  { id: 'restaurant', label: 'Restaurant owner', icon: UtensilsCrossed, hint: 'Menu, orders, preparation and earnings' },
  { id: 'grocery', label: 'Grocery store owner', icon: ShoppingBasket, hint: 'Products, stock, delivery coverage, orders' },
  { id: 'property', label: 'Hotel / homestay owner', icon: BedDouble, hint: 'Rooms, pricing, availability, bookings' },
  { id: 'tour_operator', label: 'Tour operator', icon: Mountain, hint: 'Packages, activities, schedules, capacity' },
] as const;

/** Partner onboarding: pick a business type, claim a listing or register a vehicle. */
export function Onboarding() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [type, setType] = useState<(typeof TYPES)[number]['id'] | null>(null);
  const [listingId, setListingId] = useState('');
  const [driver, setDriver] = useState({ name: '', phone: '', vehicleClass: 'veh_sedan', licenceNumber: '', vehicleRegistration: '', insuranceNumber: '', services: ['cab'] as string[] });

  const claim = useMutation({
    mutationFn: () => client.claimPartner(type as 'restaurant' | 'grocery' | 'property' | 'tour_operator', listingId),
    onSuccess: () => { showToast('Listing claimed — verification is now pending review', 'success'); void qc.invalidateQueries(); nav('/'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const registerDriver = useMutation({
    mutationFn: () => client.registerDriver(driver),
    onSuccess: () => { showToast('Driver profile created — verification pending', 'success'); void qc.invalidateQueries(); nav('/'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const listings = type === 'restaurant' ? catalogue.restaurants : type === 'grocery' ? catalogue.groceryStores : type === 'property' ? catalogue.properties : [];
  const needsListing = type === 'restaurant' || type === 'grocery' || type === 'property';

  return (
    <div className="stack" style={{ maxWidth: 560, margin: '4vh auto' }}>
      <h1 style={{ fontSize: 26 }}>What kind of partner are you?</h1>
      <p className="small muted">One account can hold several partner roles. Verification is required before going live.</p>
      <div className="stack" style={{ gap: 10 }}>
        {TYPES.map((t) => (
          <button key={t.id} className={`radio-row ${type === t.id ? 'radio-row--active' : ''}`} onClick={() => { setType(t.id); setListingId(''); }}>
            <t.icon size={20} style={{ color: 'var(--gw-champagne)' }} />
            <span className="list-row__body"><span className="list-row__title">{t.label}</span><span className="list-row__sub">{t.hint}</span></span>
          </button>
        ))}
      </div>

      {type && type !== 'driver' && (
        needsListing ? (
        <div className="card stack" style={{ gap: 12 }}>
          <Field label="Choose your business listing">
            <select className="select" value={listingId} onChange={(e) => setListingId(e.target.value)}>
              <option value="">Select…</option>
              {listings.map((l) => <option key={l.id} value={l.id}>{l.name} — {('destinationId' in l ? catalogue.destinations.find((d) => d.id === l.destinationId)?.name ?? '' : '')}</option>)}
            </select>
          </Field>
          <button className="btn btn--primary" disabled={!listingId || claim.isPending} onClick={() => claim.mutate()}>{claim.isPending ? 'Claiming…' : 'Claim this business'}</button>
          <p className="tiny muted"><FileCheck size={12} style={{ verticalAlign: -1 }} /> Your listing goes live after GOWAYY operations verify your documents.</p>
        </div>
      ) : (
        <div className="card"><p className="small">Tour operators create their own packages under Manage → tours.</p><button className="btn btn--primary btn--block" disabled={claim.isPending} onClick={() => claim.mutate()}>Become a tour operator</button></div>
      ))}

      {type === 'driver' && (
        <div className="card stack" style={{ gap: 12 }}>
          <Field label="Full name"><input className="input" value={driver.name} onChange={(e) => setDriver({ ...driver, name: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={driver.phone} onChange={(e) => setDriver({ ...driver, phone: e.target.value })} /></Field>
          <Field label="Vehicle class">
            <select className="select" value={driver.vehicleClass} onChange={(e) => setDriver({ ...driver, vehicleClass: e.target.value })}>
              {catalogue.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Driving licence number"><input className="input" value={driver.licenceNumber} onChange={(e) => setDriver({ ...driver, licenceNumber: e.target.value })} /></Field>
          <Field label="Vehicle registration"><input className="input" value={driver.vehicleRegistration} onChange={(e) => setDriver({ ...driver, vehicleRegistration: e.target.value })} /></Field>
          <Field label="Insurance number"><input className="input" value={driver.insuranceNumber} onChange={(e) => setDriver({ ...driver, insuranceNumber: e.target.value })} /></Field>
          <button className="btn btn--primary" disabled={!driver.name || !driver.phone || !driver.licenceNumber || registerDriver.isPending} onClick={() => registerDriver.mutate()}>{registerDriver.isPending ? 'Registering…' : 'Register as driver'}</button>
        </div>
      )}
      <button className="btn btn--secondary btn--sm" onClick={() => nav('/')}>Skip for now</button>
    </div>
  );
}
