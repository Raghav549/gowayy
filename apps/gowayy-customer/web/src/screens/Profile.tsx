import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRound, LogOut, MapPin, Plus, Trash2, ShieldAlert, Bell, HelpCircle, Camera, CreditCard, ArrowRight } from 'lucide-react';
import { addressSchema } from '@gowayy/validation';
import { catalogue } from '@gowayy/catalog';
import { client } from '../lib/client';
import { usePageMeta } from '../lib/guards';
import { useSession } from '../store/useSession';
import { useUI } from '../store/useUI';
import { SectionHead, EmptyState, Field } from '../components/ui';
import { registerWebPush, unregisterWebPush } from '../lib/push';
import type { NotificationPreferences } from '@gowayy/types';

const preferenceLabels: Array<{ key: keyof Omit<NotificationPreferences, 'updatedAt'>; label: string }> = [
  { key: 'pushEnabled', label: 'Push notifications' },
  { key: 'bookingUpdates', label: 'Booking and travel updates' },
  { key: 'orderUpdates', label: 'Order and delivery updates' },
  { key: 'paymentUpdates', label: 'Payment and refund updates' },
  { key: 'partnerUpdates', label: 'Partner updates' },
  { key: 'marketing', label: 'Offers and marketing' },
];

function PushPreferences() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState('This browser has not been registered from this screen.');
  const preferences = useQuery({ queryKey: ['notification-preferences'], queryFn: () => client.notificationPreferences(), retry: 0 });
  const update = async (key: keyof Omit<NotificationPreferences, 'updatedAt'>, value: boolean) => {
    setBusy(true);
    try {
      const next = await client.updateNotificationPreferences({ [key]: value });
      qc.setQueryData(['notification-preferences'], next); showToast('Notification preference saved', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not save preference', 'error'); }
    finally { setBusy(false); }
  };
  const enable = async () => {
    setBusy(true);
    try {
      await registerWebPush(true);
      setDeviceStatus('Registered with the server. Actual delivery depends on the configured Web Push provider and browser.');
      showToast('Browser push registration confirmed by the server', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Browser push registration failed';
      setDeviceStatus(message); showToast(message, 'error');
    } finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true);
    try { await unregisterWebPush(); setDeviceStatus('This browser was unregistered on the server and unsubscribed locally.'); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Could not unregister browser push', 'error'); }
    finally { setBusy(false); }
  };

  return <div className="card" id="notifications">
    <h3>Push notifications</h3>
    <p className="small muted">Device registration and category preferences are separate. A registered subscription is not proof of delivery.</p>
    {preferences.isError ? <div className="notice notice--info" role="alert">{preferences.error instanceof Error ? preferences.error.message : 'Preferences unavailable'}</div>
      : preferences.data ? <div className="stack" style={{ marginTop: 12 }}>
        {preferenceLabels.map(({ key, label }) => <label className="between small" key={key} style={{ minHeight: 36, gap: 12 }}>
          <span>{label}</span><input type="checkbox" checked={preferences.data[key]} disabled={busy || (key !== 'pushEnabled' && !preferences.data.pushEnabled)} onChange={(event) => void update(key, event.target.checked)} />
        </label>)}
        <div className="row row--wrap" style={{ gap: 8 }}>
          <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => void enable()}><Bell size={15} /> Enable this browser</button>
          <button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => void disable()}>Unregister</button>
        </div>
      </div> : <p className="small muted">Loading preferences…</p>}
    <p className="tiny muted" aria-live="polite">{deviceStatus}</p>
  </div>;
}

export function Profile() {
  usePageMeta('Your profile');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const refresh = useSession((s) => s.refresh);
  const clear = useSession((s) => s.clear);
  const showToast = useUI((s) => s.showToast);
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [address, setAddress] = useState({ label: '', line: '', city: '', pincode: '' });
  const [savedPlaceId, setSavedPlaceId] = useState(catalogue.places[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  const addresses = useQuery({ queryKey: ['addresses'], queryFn: () => client.addresses(), enabled: Boolean(user) });
  const saved = useQuery({ queryKey: ['saved-places'], queryFn: () => client.savedPlaces(), enabled: Boolean(user) });
  const payments = useQuery({ queryKey: ['payments'], queryFn: () => client.payments(), enabled: Boolean(user) });
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: () => client.notifications(), enabled: Boolean(user) });

  if (!user) return <EmptyState title="Sign in to view your profile" body="One account connects every GOWAYY service." action={<Link className="btn btn--primary" to="/auth/login">Sign in</Link>} />;

  const saveProfile = async () => {
    setSaving(true);
    try { await client.updateProfile({ firstName, lastName }); await refresh(); showToast('Profile updated', 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not update', 'error'); }
    finally { setSaving(false); }
  };
  const addAddress = async () => {
    const parsed = addressSchema.safeParse(address);
    if (!parsed.success) { showToast(parsed.error.issues[0].message, 'error'); return; }
    try { await client.createAddress(parsed.data); await qc.invalidateQueries({ queryKey: ['addresses'] }); setAddress({ label: '', line: '', city: '', pincode: '' }); showToast('Address saved', 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not save', 'error'); }
  };
  const savePlace = async () => { try { await client.savePlace({ placeId: savedPlaceId }); await qc.invalidateQueries({ queryKey: ['saved-places'] }); showToast('Place saved', 'success'); } catch (e) { showToast(e instanceof Error ? e.message : 'Could not save', 'error'); } };
  const logout = async () => { try { await client.logout(); } catch { /* local only */ } clear(); navigate('/'); };
  const deleteAccount = async () => {
    if (!window.confirm('Permanently delete your account? This soft-deletes the profile and invalidates sessions.')) return;
    try { await client.deleteAccount(); clear(); navigate('/'); showToast('Account deleted', 'success'); } catch (e) { showToast(e instanceof Error ? e.message : 'Could not delete', 'error'); }
  };

  return (
    <div>
      <SectionHead eyebrow="Account" title="Profile & settings" subtitle="One profile, addresses, payment records, notifications and support across every service." />
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 16 }}>
          <div className="avatar" style={{ width: 56, height: 56, fontSize: 20 }}>{`${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()}</div>
          <div><h3>{user.firstName} {user.lastName}</h3><p className="small muted">{user.email}</p><div className="row tiny muted" style={{ marginTop: 6 }}>Roles: <span className="badge">{user.roles.join(', ')}</span> · joined {new Date(user.createdAt).toLocaleDateString()}</div></div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Personal details</h3>
          <div className="grid-2" style={{ gap: 10, marginTop: 14 }}>
            <Field label="First name"><input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></Field>
            <Field label="Last name"><input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
          </div>
          <Field label="Email" hint="Email changes require a verified OTP provider."><input className="input" value={user.email} disabled /></Field>
          <button className="btn btn--primary" onClick={() => void saveProfile()} disabled={saving}>Save changes</button>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Preferences</h3>
            <div className="stack" style={{ marginTop: 14 }}>
              <div className="between"><span className="row small"><span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', background: 'linear-gradient(135deg,#EDE3F7,#421080)' }} /> Appearance</span><span className="badge badge--accent">Lavender identity</span></div>
              <div className="between"><span className="row small"><Bell size={16} /> Notifications</span><a className="btn btn--secondary btn--sm" href="#notifications">{notifications.data?.unreadCount ?? 0} unread</a></div>
              <div className="between"><span className="row small"><CreditCard size={16} /> Payment records</span><span className="badge">{payments.data?.length ?? 0}</span></div>
            </div>
          </div>
          <PushPreferences />
          <div className="card">
            <h3>Quick links</h3>
            <div className="stack" style={{ marginTop: 12 }}>
              <Link className="btn btn--secondary btn--block" to="/bookings">My bookings <ArrowRight size={15} /></Link>
              <Link className="btn btn--secondary btn--block" to="/orders">My orders <ArrowRight size={15} /></Link>
              <Link className="btn btn--secondary btn--block" to="/partner">Partner mode <ArrowRight size={15} /></Link>
              <Link className="btn btn--secondary btn--block" to="/support"><HelpCircle size={15} /> Customer support</Link>
              <Link className="btn btn--secondary btn--block" to="/credits"><Camera size={15} /> Image credits & licensing</Link>
            </div>
          </div>
        </div>
      </div>

      <section className="section grid-2">
        <div className="card">
          <h3>Saved addresses</h3>
          <div className="list" style={{ marginTop: 12 }}>
            {(addresses.data as Array<{ id: string; label: string; line: string; city: string; pincode: string }> | undefined)?.map((a) => (
              <div className="list-row" key={a.id}><MapPin size={16} /><span className="list-row__body"><span className="list-row__title">{a.label}</span><span className="list-row__sub">{a.line}, {a.city} {a.pincode}</span></span>
                <button className="btn btn--ghost btn--sm" aria-label="Delete address" onClick={async () => { await client.deleteAddress(a.id); await qc.invalidateQueries({ queryKey: ['addresses'] }); }}><Trash2 size={15} /></button></div>
            ))}
          </div>
          <div className="divider" />
          <div className="grid-2" style={{ gap: 10 }}>
            <Field label="Label"><input className="input" placeholder="Home" value={address.label} onChange={(e) => setAddress({ ...address, label: e.target.value })} /></Field>
            <Field label="PIN code"><input className="input" inputMode="numeric" maxLength={6} value={address.pincode} onChange={(e) => setAddress({ ...address, pincode: e.target.value.replace(/\D/g, '') })} /></Field>
          </div>
          <Field label="Address"><input className="input" placeholder="Street and area" value={address.line} onChange={(e) => setAddress({ ...address, line: e.target.value })} /></Field>
          <Field label="City"><input className="input" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} /></Field>
          <button className="btn btn--secondary" onClick={() => void addAddress()}><Plus size={15} /> Add address</button>
        </div>
        <div className="card">
          <h3>Saved places</h3>
          <div className="list" style={{ marginTop: 12 }}>
            {(saved.data as Array<{ id: string; label: string; place: { name: string } }> | undefined)?.map((s) => (
              <div className="list-row" key={s.id}><MapPin size={16} /><span className="list-row__body"><span className="list-row__title">{s.label}</span><span className="list-row__sub">{s.place.name}</span></span>
                <button className="btn btn--ghost btn--sm" aria-label="Remove saved place" onClick={async () => { await client.deleteSavedPlace(s.id); await qc.invalidateQueries({ queryKey: ['saved-places'] }); }}><Trash2 size={15} /></button></div>
            ))}
          </div>
          <Field label="Add a place"><select className="select" value={savedPlaceId} onChange={(e) => setSavedPlaceId(e.target.value)}>{catalogue.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <button className="btn btn--secondary" onClick={() => void savePlace()}><Plus size={15} /> Save place</button>
        </div>
      </section>

      <section className="section card">
        <h3>Session & privacy</h3>
        <div className="row row--wrap" style={{ gap: 10, marginTop: 14 }}>
          <button className="btn btn--secondary" onClick={() => void logout()}><LogOut size={16} /> Sign out</button>
          <button className="btn btn--danger" onClick={() => void deleteAccount()}><ShieldAlert size={16} /> Delete account</button>
        </div>
        <p className="tiny muted" style={{ marginTop: 10 }}>Sessions are stored server-side and the token is kept in local storage (Expo Secure Store on mobile). Account deletion soft-deletes the profile.</p>
      </section>
    </div>
  );
}
