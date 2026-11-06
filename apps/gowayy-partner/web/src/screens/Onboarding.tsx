import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CarFront, UtensilsCrossed, ShoppingBasket, BedDouble, Mountain, FileCheck, MapPin } from 'lucide-react';
import { client } from '../lib/client';
import { useUI } from '../store';
import { Field } from '@gowayy/ui';

const TYPES = [
  { id: 'driver', label: 'Driver / delivery partner', icon: CarFront, hint: 'Cabs, shared taxis, parcels, food & grocery delivery' },
  { id: 'restaurant', label: 'Restaurant owner', icon: UtensilsCrossed, hint: 'Menu, orders, preparation and earnings' },
  { id: 'grocery', label: 'Grocery / marketplace store owner', icon: ShoppingBasket, hint: 'Create a store or claim an existing listing' },
  { id: 'property', label: 'Hotel / homestay owner', icon: BedDouble, hint: 'Rooms, pricing, availability, bookings' },
  { id: 'tour_operator', label: 'Tour operator', icon: Mountain, hint: 'Packages, activities, schedules, capacity' },
] as const;

type Listing = { id: string; name: string; destinationId?: string };

/** Partner onboarding uses live catalogue data; new stores persist through the same owned-store RPC as Manage. */
export function Onboarding() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [type, setType] = useState<(typeof TYPES)[number]['id'] | null>(null);
  const [groceryMode, setGroceryMode] = useState<'create' | 'claim'>('create');
  const [listingId, setListingId] = useState('');
  const [locating, setLocating] = useState(false);
  const [driver, setDriver] = useState({ name: '', phone: '', vehicleClass: 'veh_sedan', licenceNumber: '', vehicleRegistration: '', insuranceNumber: '', services: ['cab'] as string[] });
  const [store, setStore] = useState({ name: '', destinationId: '', description: '', address: '', phone: '', lat: '', lng: '', openingHours: '', deliveryCoverageKm: '8' });
  const catalogQuery = useQuery({ queryKey: ['catalog'], queryFn: () => client.catalog() });
  const destinationsQuery = useQuery({ queryKey: ['destinations'], queryFn: () => client.destinations?.() as unknown as Promise<{ items: Array<{ id: string; name: string }> }> });

  const claim = useMutation({
    mutationFn: () => client.claimPartner(type as 'restaurant' | 'grocery' | 'property' | 'tour_operator', listingId),
    onSuccess: () => { showToast('Listing claimed — verification is now pending review', 'success'); void qc.invalidateQueries(); nav('/'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const createStore = useMutation({
    mutationFn: async () => {
      const lat = Number(store.lat); const lng = Number(store.lng);
      if (store.name.trim().length < 2 || !store.destinationId || store.address.trim().length < 5) throw new Error('Enter the store name, destination and complete address');
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Enter valid store coordinates or use current location');
      if (store.phone && !/^\d{10}$/.test(store.phone)) throw new Error('Enter a 10-digit store phone number');
      await client.claimPartner('grocery', '');
      if (!client.createPartnerStore) throw new Error('Store creation is unavailable on this backend');
      return client.createPartnerStore({
        name: store.name.trim(), destinationId: store.destinationId, description: store.description.trim(),
        address: store.address.trim(), phone: store.phone, lat, lng,
        openingHours: store.openingHours.trim(), deliveryCoverageKm: Number(store.deliveryCoverageKm),
      });
    },
    onSuccess: async () => { showToast('Store saved. It will appear publicly after verification.', 'success'); await qc.invalidateQueries(); nav('/manage'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const registerDriver = useMutation({
    mutationFn: () => client.registerDriver(driver),
    onSuccess: () => { showToast('Driver profile created — verification pending', 'success'); void qc.invalidateQueries(); nav('/'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  const listings: Listing[] = type === 'restaurant' ? catalogQuery.data?.restaurants ?? []
    : type === 'grocery' ? catalogQuery.data?.stores ?? []
      : type === 'property' ? catalogQuery.data?.properties ?? [] : [];
  const destinations = destinationsQuery.data?.items ?? catalogQuery.data?.destinations ?? [];
  const needsListing = type === 'restaurant' || type === 'grocery' || type === 'property';

  const useCurrentLocation = () => {
    if (!navigator.geolocation) { showToast('This browser does not support location. Enter the coordinates manually.', 'error'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      setStore((current) => ({ ...current, lat: position.coords.latitude.toFixed(6), lng: position.coords.longitude.toFixed(6) }));
      setLocating(false); showToast('Current coordinates added. Confirm they identify the store entrance.', 'success');
    }, (error) => {
      setLocating(false);
      showToast(error.code === error.PERMISSION_DENIED ? 'Location permission was denied. Enter the store coordinates manually.' : 'Could not retrieve location. Check GPS and retry or enter coordinates.', 'error');
    }, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 });
  };

  return (
    <div className="stack" style={{ maxWidth: 640, width: '100%', margin: '4vh auto', padding: '0 16px', boxSizing: 'border-box' }}>
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

      {type === 'grocery' && <div className="chips" role="tablist" aria-label="Store onboarding"><button role="tab" aria-selected={groceryMode === 'create'} className={`chip ${groceryMode === 'create' ? 'chip--active' : ''}`} onClick={() => setGroceryMode('create')}>Create new store</button><button role="tab" aria-selected={groceryMode === 'claim'} className={`chip ${groceryMode === 'claim' ? 'chip--active' : ''}`} onClick={() => setGroceryMode('claim')}>Claim existing</button></div>}

      {type && type !== 'driver' && (needsListing && (type !== 'grocery' || groceryMode === 'claim') ? (
        <div className="card stack" style={{ gap: 12 }}>
          <Field label="Choose your business listing">
            <select className="select" value={listingId} onChange={(e) => setListingId(e.target.value)} disabled={catalogQuery.isLoading}>
              <option value="">{catalogQuery.isLoading ? 'Loading live listings…' : 'Select…'}</option>
              {listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.name}{listing.destinationId ? ` — ${destinations.find((d) => d.id === listing.destinationId)?.name ?? ''}` : ''}</option>)}
            </select>
          </Field>
          {!catalogQuery.isLoading && listings.length === 0 && <p className="small muted">No claimable listings are currently available for this business type.</p>}
          <button className="btn btn--primary" disabled={!listingId || claim.isPending} onClick={() => claim.mutate()}>{claim.isPending ? 'Claiming…' : 'Claim this business'}</button>
          <p className="tiny muted"><FileCheck size={12} style={{ verticalAlign: -1 }} /> Your listing goes live after GOWAYY operations verify your documents.</p>
        </div>
      ) : type === 'grocery' ? (
        <form className="card stack" style={{ gap: 12 }} onSubmit={(event) => { event.preventDefault(); createStore.mutate(); }}>
          <h2 style={{ fontSize: 18 }}>Create your store</h2>
          <div className="grid-2" style={{ gap: 10 }}>
            <Field label="Store name"><input className="input" required value={store.name} onChange={(e) => setStore({ ...store, name: e.target.value })} /></Field>
            <Field label="Destination"><select className="select" required value={store.destinationId} onChange={(e) => setStore({ ...store, destinationId: e.target.value })}><option value="">Choose…</option>{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}</select></Field>
          </div>
          <Field label="Store address"><input className="input" required value={store.address} onChange={(e) => setStore({ ...store, address: e.target.value })} /></Field>
          <Field label="Description"><textarea className="input" rows={3} value={store.description} onChange={(e) => setStore({ ...store, description: e.target.value })} /></Field>
          <div className="grid-2" style={{ gap: 10 }}>
            <Field label="Phone"><input className="input" inputMode="numeric" maxLength={10} value={store.phone} onChange={(e) => setStore({ ...store, phone: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Opening hours"><input className="input" placeholder="Actual opening hours" value={store.openingHours} onChange={(e) => setStore({ ...store, openingHours: e.target.value })} /></Field>
            <Field label="Latitude"><input className="input" required inputMode="decimal" value={store.lat} onChange={(e) => setStore({ ...store, lat: e.target.value })} /></Field>
            <Field label="Longitude"><input className="input" required inputMode="decimal" value={store.lng} onChange={(e) => setStore({ ...store, lng: e.target.value })} /></Field>
          </div>
          <button type="button" className="btn btn--secondary btn--sm" disabled={locating} onClick={useCurrentLocation}><MapPin size={15} /> {locating ? 'Locating…' : 'Use my current location'}</button>
          <p className="tiny muted">Location is requested only when you tap the button. Confirm the coordinates identify the store entrance; you can also enter them manually.</p>
          <Field label="Delivery coverage (km)"><input className="input" type="number" min={0.1} max={40} step={0.1} value={store.deliveryCoverageKm} onChange={(e) => setStore({ ...store, deliveryCoverageKm: e.target.value })} /></Field>
          <button className="btn btn--primary" disabled={createStore.isPending}>{createStore.isPending ? 'Creating store…' : 'Create store for verification'}</button>
        </form>
      ) : (
        <div className="card"><p className="small">Tour operators create their own packages under Manage → tours.</p><button className="btn btn--primary btn--block" disabled={claim.isPending} onClick={() => claim.mutate()}>Become a tour operator</button></div>
      ))}

      {type === 'driver' && (
        <div className="card stack" style={{ gap: 12 }}>
          <Field label="Full name"><input className="input" value={driver.name} onChange={(e) => setDriver({ ...driver, name: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" inputMode="numeric" maxLength={10} value={driver.phone} onChange={(e) => setDriver({ ...driver, phone: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Vehicle class"><select className="select" value={driver.vehicleClass} onChange={(e) => setDriver({ ...driver, vehicleClass: e.target.value })}>{(catalogQuery.data?.vehicles ?? []).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></Field>
          <Field label="Driving licence number"><input className="input" value={driver.licenceNumber} onChange={(e) => setDriver({ ...driver, licenceNumber: e.target.value })} /></Field>
          <Field label="Vehicle registration"><input className="input" value={driver.vehicleRegistration} onChange={(e) => setDriver({ ...driver, vehicleRegistration: e.target.value })} /></Field>
          <Field label="Insurance number"><input className="input" value={driver.insuranceNumber} onChange={(e) => setDriver({ ...driver, insuranceNumber: e.target.value })} /></Field>
          <button className="btn btn--primary" disabled={!driver.name || !/^\d{10}$/.test(driver.phone) || !driver.licenceNumber || registerDriver.isPending} onClick={() => registerDriver.mutate()}>{registerDriver.isPending ? 'Registering…' : 'Register as driver'}</button>
        </div>
      )}
      <button className="btn btn--secondary btn--sm" onClick={() => nav('/')}>Skip for now</button>
    </div>
  );
}
