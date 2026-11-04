import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRound, Truck, Power, ShieldCheck, ClipboardCheck, ArrowRight, Info } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { driverRegistrationSchema } from '@gowayy/validation';
import { formatINR } from '@gowayy/shared-utils';
import { client } from '../lib/client';
import { usePageMeta } from '../lib/guards';
import { useSession } from '../store/useSession';
import { useUI } from '../store/useUI';
import { SectionHead, EmptyState, DemoBanner, Field, StatusBadge, Spinner } from '../components/ui';

const SERVICES = ['cab', 'food', 'grocery', 'parcel'] as const;

export function Partner() {
  usePageMeta('Partner mode');
  const user = useSession((s) => s.user);
  const refresh = useSession((s) => s.refresh);
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [form, setForm] = useState({ name: '', phone: '', vehicleClass: 'hatchback', licenceNumber: '', vehicleRegistration: '', insuranceNumber: '' });
  const [enabled, setEnabled] = useState<string[]>(['cab']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [claimRole, setClaimRole] = useState<'restaurant' | 'grocery' | 'property'>('restaurant');
  const [claimListing, setClaimListing] = useState(catalogue.restaurants[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  const driver = useQuery({ queryKey: ['driver-me'], queryFn: () => client.driverMe(), enabled: Boolean(user) });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => client.jobs(), enabled: Boolean(user) && Boolean(driver.data?.driver) });
  const requests = useQuery({ queryKey: ['partner-requests'], queryFn: () => client.partnerRequests(), enabled: Boolean(user) });
  usePageMeta('Partner mode');

  if (!user) return <EmptyState title="Sign in to open partner mode" body="Partner functions are role-specific sections of the same app. There is no admin panel." action={<Link className="btn btn--primary" to="/auth/login">Sign in</Link>} />;

  const register = async () => {
    const parsed = driverRegistrationSchema.safeParse({ ...form, services: enabled });
    if (!parsed.success) { const e: Record<string, string> = {}; parsed.error.issues.forEach((i) => { e[String(i.path[0])] = i.message; }); setErrors(e); return; }
    setErrors({}); setBusy(true);
    try { await client.registerDriver(parsed.data); await refresh(); await qc.invalidateQueries(); showToast('Driver profile created — verification pending', 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not register', 'error'); }
    finally { setBusy(false); }
  };
  const toggleOnline = async () => {
    if (!driver.data?.driver) return;
    setBusy(true);
    try { await client.updateDriver({ online: !driver.data.driver.online }); await qc.invalidateQueries(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not change status', 'error'); }
    finally { setBusy(false); }
  };
  const verifyDemo = async () => { try { await client.verifyDriverDemo(); await qc.invalidateQueries(); showToast('Demo verification applied (not a real document check)', 'info'); } catch (e) { showToast(e instanceof Error ? e.message : 'Failed', 'error'); } };
  const acceptJob = async (id: string) => {
    try { await client.acceptJob(id); await qc.invalidateQueries(); showToast('Job accepted under dispatch rules', 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Dispatch rejected this job', 'error'); }
  };
  const claim = async () => {
    try { await client.claimPartner(claimRole, claimListing); await refresh(); await qc.invalidateQueries(); showToast('Partner role claimed for this listing', 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not claim', 'error'); }
  };
  const confirmBooking = async (id: string, status: string) => {
    try { await client.transitionBooking(id, status, 'Partner action'); await qc.invalidateQueries(); showToast(`Booking ${status}`, 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not update', 'error'); }
  };
  const advanceOrder = async (id: string, status: string) => {
    try { await client.transitionOrder(id, status); await qc.invalidateQueries(); showToast(`Order ${status}`, 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not update', 'error'); }
  };

  const claimOptions = claimRole === 'restaurant' ? catalogue.restaurants : claimRole === 'grocery' ? catalogue.groceryStores : catalogue.properties;

  return (
    <div>
      <SectionHead eyebrow="Role-specific section" title="Partner mode" subtitle="Driver, restaurant, grocery and property tools live inside the same customer app. There is no admin panel or admin login." />
      <DemoBanner>Document verification here is a labelled demo action. Real permits, licence checks and operator agreements are required before production.</DemoBanner>

      <div className="section grid-2">
        <div className="card">
          <h3>Driver & delivery partner</h3>
          {driver.isLoading && <Spinner />}
          {!driver.data?.driver ? <div className="stack" style={{ marginTop: 14 }}>
            <p className="small muted">Register with your details, vehicle and document numbers. Verification is required before going online.</p>
            <div className="grid-2" style={{ gap: 10 }}>
              <Field label="Full name" error={errors.name}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Phone" error={errors.phone}><input className="input" inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} /></Field>
            </div>
            <Field label="Vehicle class"><select className="select" value={form.vehicleClass} onChange={(e) => setForm({ ...form, vehicleClass: e.target.value })}><option value="hatchback">Hatchback</option><option value="sedan">Sedan</option><option value="suv">SUV</option><option value="premium">Premium car</option><option value="bike">Bike / scooter</option></select></Field>
            <div className="grid-2" style={{ gap: 10 }}>
              <Field label="Driving licence" error={errors.licenceNumber}><input className="input" value={form.licenceNumber} onChange={(e) => setForm({ ...form, licenceNumber: e.target.value })} /></Field>
              <Field label="Vehicle registration" error={errors.vehicleRegistration}><input className="input" value={form.vehicleRegistration} onChange={(e) => setForm({ ...form, vehicleRegistration: e.target.value })} /></Field>
            </div>
            <Field label="Insurance number" error={errors.insuranceNumber}><input className="input" value={form.insuranceNumber} onChange={(e) => setForm({ ...form, insuranceNumber: e.target.value })} /></Field>
            <div><div className="label">Enabled services</div><div className="chips" style={{ marginTop: 8 }}>{SERVICES.map((s) => <button key={s} className={`chip ${enabled.includes(s) ? 'active' : ''}`} onClick={() => setEnabled(enabled.includes(s) ? enabled.filter((x) => x !== s) : [...enabled, s])}>{s}</button>)}</div>{errors.services && <div className="error">{errors.services}</div>}</div>
            <button className="btn btn--primary btn--block" onClick={() => void register()} disabled={busy}>Register as driver</button>
          </div> : <div className="stack" style={{ marginTop: 14 }}>
            <div className="between"><div><strong className="small">{driver.data.driver.name}</strong><div className="tiny muted">{driver.data.driver.vehicleClass} · {driver.data.driver.phone}</div></div><StatusBadge status={driver.data.driver.verification === 'verified' ? 'confirmed' : 'requested'} /></div>
            <div className="card card--flat"><div className="eyebrow">Dispatch rules</div><pre className="tiny muted" style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--gw-mono)' }}>{JSON.stringify(driver.data.dispatchRules, null, 2)}</pre></div>
            <div className="row row--wrap" style={{ gap: 8 }}>
              {driver.data.driver.verification !== 'verified' && <button className="btn btn--secondary btn--sm" onClick={() => void verifyDemo()}><ShieldCheck size={15} /> Demo-verify documents</button>}
              <button className="btn btn--primary btn--sm" disabled={driver.data.driver.verification !== 'verified' || busy} onClick={() => void toggleOnline()}><Power size={15} /> Go {driver.data.driver.online ? 'offline' : 'online'}</button>
            </div>
            <p className="tiny muted">Online: {driver.data.driver.online ? 'yes' : 'no'} · Active job: {driver.data.driver.activeJobId ?? 'none'}</p>
            <div><div className="label">Service modes</div><div className="chips" style={{ marginTop: 8 }}>{SERVICES.map((s) => {
              const active = driver.data?.driver?.services.includes(s);
              return <button key={s} className={`chip ${active ? 'active' : ''}`} onClick={async () => {
                const next = active ? driver.data!.driver!.services.filter((x) => x !== s) : [...driver.data!.driver!.services, s];
                try { await client.updateDriver({ services: next }); await qc.invalidateQueries(); } catch (e) { showToast(e instanceof Error ? e.message : 'Vehicle not eligible', 'error'); }
              }}>{s}{active ? ' ✓' : ''}</button>;
            })}</div></div>
          </div>}
        </div>

        <div className="card">
          <h3>Partner listing claim</h3>
          <p className="small muted" style={{ marginTop: 8 }}>Claim a seeded listing to accept its bookings and advance its orders. In production this requires document verification.</p>
          <div className="stack" style={{ marginTop: 14 }}>
            <Field label="Partner role"><select className="select" value={claimRole} onChange={(e) => { const role = e.target.value as typeof claimRole; setClaimRole(role); setClaimListing((role === 'restaurant' ? catalogue.restaurants : role === 'grocery' ? catalogue.groceryStores : catalogue.properties)[0]?.id ?? ''); }}><option value="restaurant">Restaurant</option><option value="grocery">Grocery store</option><option value="property">Property owner</option></select></Field>
            <Field label="Listing"><select className="select" value={claimListing} onChange={(e) => setClaimListing(e.target.value)}>{claimOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
            <button className="btn btn--secondary" onClick={() => void claim()}><ClipboardCheck size={15} /> Claim listing</button>
            <p className="tiny muted">Current roles: {user.roles.join(', ')}</p>
          </div>
        </div>
      </div>

      <section className="section">
        <SectionHead eyebrow="Dispatch" title="Available jobs" subtitle="Assignment is decided by server-side dispatch rules. A driver carrying a passenger cannot receive an unrelated delivery." />
        {jobs.isLoading && <Spinner />}
        {jobs.data?.items.length === 0 && <p className="small muted">No open jobs right now.</p>}
        <div className="list">{jobs.data?.items.map((j) => (
          <div className="list-row" key={j.id}><Truck size={17} /><span className="list-row__body"><span className="list-row__title">{j.service} · {j.bookingId ?? j.orderId}</span><span className="list-row__sub">{j.status} · created {new Date(j.createdAt).toLocaleTimeString()}</span></span>
            <button className="btn btn--primary btn--sm" onClick={() => void acceptJob(j.id)}>Accept <ArrowRight size={14} /></button></div>
        ))}</div>
      </section>

      <section className="section grid-2">
        <div className="card">
          <h3>Incoming booking requests</h3>
          <div className="list" style={{ marginTop: 12 }}>
            {requests.data?.bookings.length === 0 && <p className="small muted">No pending requests for your roles.</p>}
            {requests.data?.bookings.map((b) => <div className="card card--flat" key={b.id}>
              <div className="between"><strong className="small">{b.reference} · {b.title}</strong><StatusBadge status={b.status} /></div>
              <div className="tiny muted" style={{ marginTop: 4 }}>{formatINR(b.price.totalPaise)} · {b.service}</div>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                {b.status !== 'confirmed' && <button className="btn btn--primary btn--sm" onClick={() => void confirmBooking(b.id, 'confirmed')}>Confirm</button>}
                {['confirmed','assigned'].includes(b.status) && <button className="btn btn--secondary btn--sm" onClick={() => void confirmBooking(b.id, 'in_progress')}>Start</button>}
                {b.status === 'in_progress' && <button className="btn btn--secondary btn--sm" onClick={() => void confirmBooking(b.id, 'completed')}>Complete</button>}
              </div>
            </div>)}
          </div>
        </div>
        <div className="card">
          <h3>Incoming orders</h3>
          <div className="list" style={{ marginTop: 12 }}>
            {requests.data?.orders.length === 0 && <p className="small muted">No pending orders for your roles.</p>}
            {requests.data?.orders.map((o) => <div className="card card--flat" key={o.id}>
              <div className="between"><strong className="small">{o.reference} · {o.service}</strong><StatusBadge status={o.status} /></div>
              <div className="tiny muted" style={{ marginTop: 4 }}>{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')} · {formatINR(o.price.totalPaise)}</div>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                {o.status === 'created' && <button className="btn btn--primary btn--sm" onClick={() => void advanceOrder(o.id, 'accepted')}>Accept</button>}
                {['accepted','preparing'].includes(o.status) && <button className="btn btn--secondary btn--sm" onClick={() => void advanceOrder(o.id, 'preparing')}>Preparing</button>}
                {['preparing','packed'].includes(o.status) && <button className="btn btn--secondary btn--sm" onClick={() => void advanceOrder(o.id, 'out_for_delivery')}>Out for delivery</button>}
                {o.status === 'out_for_delivery' && <button className="btn btn--secondary btn--sm" onClick={() => void advanceOrder(o.id, 'delivered')}>Delivered</button>}
              </div>
            </div>)}
          </div>
        </div>
      </section>

      <div className="notice"><Info size={14} /> Partner permissions are enforced server-side with role checks and dispatch eligibility. No interface here can change another user's account, approve documents in production, or view platform-wide administration.</div>
    </div>
  );
}
