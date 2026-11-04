import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Package, Heart, ChevronRight, LifeBuoy, MapPin, Receipt, Bell, ShieldCheck, FileText,
  LogOut, Trash2, UserRound, Pencil, CreditCard,
} from 'lucide-react';
import { client } from '../lib/client';
import { useSession } from '../store/useSession';
import { useUI } from '../store/useUI';
import { formatINR } from '@gowayy/shared-utils';
import { SectionHead } from '../components/ui';
import { downloadInvoice } from '../lib/invoice';
import { usePageMeta } from '../lib/guards';

export function Account() {
  usePageMeta('Account');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const clear = useSession((s) => s.clear);
  const refresh = useSession((s) => s.refresh);
  const showToast = useUI((s) => s.showToast);
  const [editing, setEditing] = useState(false);
  const [names, setNames] = useState({ firstName: user?.firstName ?? '', lastName: user?.lastName ?? '' });

  const orders = useQuery({ queryKey: ['orders'], queryFn: () => client.orders(), enabled: Boolean(user) });
  const bookings = useQuery({ queryKey: ['bookings'], queryFn: () => client.bookings(), enabled: Boolean(user) });
  const payments = useQuery({ queryKey: ['payments'], queryFn: () => client.payments(), enabled: Boolean(user) });
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: () => client.addresses(), enabled: Boolean(user) });
  const wishlist = useQuery({ queryKey: ['wishlist'], queryFn: () => client.wishlist(), enabled: Boolean(user) });

  const saveProfile = useMutation({
    mutationFn: () => client.updateProfile(names),
    onSuccess: async () => { await refresh(); setEditing(false); showToast('Profile updated', 'success'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const logout = async () => {
    try { await client.logout(); } catch { /* session cleared locally */ }
    clear(); await qc.clear(); navigate('/auth/login');
  };
  const deleteAccount = async () => {
    if (!window.confirm('Delete your GOWAYY account? This cannot be undone.')) return;
    try { await client.deleteAccount(); clear(); await qc.clear(); navigate('/auth/login'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not delete account', 'error'); }
  };

  const links = [
    { to: '/orders', icon: Package, label: 'Orders', sub: `${orders.data?.length ?? 0} placed` },
    { to: '/bookings', icon: FileText, label: 'Bookings', sub: `${bookings.data?.length ?? 0} trips & stays` },
    { to: '/account/wishlist', icon: Heart, label: 'Saved products', sub: `${wishlist.data?.items.length ?? 0} saved` },
    { to: '/support', icon: LifeBuoy, label: 'Help & support', sub: 'Tickets, complaints and refunds' },
  ];

  if (!user) {
    return (
      <div className="account-page">
        <SectionHead eyebrow="Account" title="Sign in to GOWAYY" subtitle="Your orders, bookings and saved addresses live in your account." />
        <div className="row row--wrap" style={{ gap: 10 }}>
          <Link className="btn btn--primary" to="/auth/login">Sign in</Link>
          <Link className="btn btn--secondary" to="/auth/register">Create an account</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="account-page stack">
      <header className="account-head">
        <div className="account-avatar" aria-hidden="true">{`${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <h1>{user.firstName} {user.lastName}</h1>
          <p className="small muted account-email">{user.email}</p>
        </div>
        <button className="btn btn--secondary btn--sm" onClick={() => setEditing(!editing)}><Pencil size={14} /> {editing ? 'Cancel' : 'Edit profile'}</button>
      </header>

      {editing && (
        <form className="card grid-2" onSubmit={(e) => { e.preventDefault(); saveProfile.mutate(); }}>
          <label className="field"><span className="label">First name</span><input className="input" value={names.firstName} onChange={(e) => setNames({ ...names, firstName: e.target.value })} /></label>
          <label className="field"><span className="label">Last name</span><input className="input" value={names.lastName} onChange={(e) => setNames({ ...names, lastName: e.target.value })} /></label>
          <div className="row" style={{ gridColumn: '1 / -1' }}><button className="btn btn--primary" disabled={saveProfile.isPending}>{saveProfile.isPending ? 'Saving…' : 'Save changes'}</button></div>
        </form>
      )}

      <div className="grid-2 account-tiles">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="card card--hover account-tile">
            <l.icon size={20} aria-hidden="true" />
            <span className="list-row__body"><span className="list-row__title">{l.label}</span><span className="list-row__sub">{l.sub}</span></span>
            <ChevronRight size={16} className="muted" aria-hidden="true" />
          </Link>
        ))}
      </div>

      <section>
        <SectionHead eyebrow="Delivery" title="Saved addresses" />
        <div className="stack">
          {((addresses.data as Array<{ id: string; label: string; line: string; city: string; pincode: string; name?: string; phone?: string; isDefault?: boolean }> | undefined) ?? []).map((a) => (
            <div className="card address-card" key={a.id}>
              <MapPin size={18} aria-hidden="true" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong>{a.label}{a.isDefault ? ' · default' : ''}</strong>
                <p className="small muted">{a.name ? `${a.name}${a.phone ? ` · ${a.phone}` : ''} · ` : ''}{a.line}, {a.city} {a.pincode}</p>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={async () => { await client.deleteAddress(a.id); await qc.invalidateQueries({ queryKey: ['addresses'] }); showToast('Address removed'); }}>Remove</button>
            </div>
          ))}
          {addresses.data?.length === 0 && <p className="small muted">No saved addresses yet — add one at checkout.</p>}
        </div>
      </section>

      <section>
        <SectionHead eyebrow="Payments" title="Payment records" action={<span className="tiny muted">{payments.data?.length ?? 0} records</span>} />
        <div className="list">
          {((payments.data as Array<{ id: string; method: string; status: string; amountPaise: number; createdAt: string }> | undefined) ?? []).slice(0, 5).map((p) => (
            <div className="list-row" key={p.id}>
              <CreditCard size={16} aria-hidden="true" />
              <span className="list-row__body"><span className="list-row__title small">{formatINR(p.amountPaise)} · {p.method.replace(/_/g, ' ')}</span><span className="list-row__sub tiny muted">{new Date(p.createdAt).toLocaleDateString()} · {p.status.replace(/_/g, ' ')}</span></span>
            </div>
          ))}
          {payments.data?.length === 0 && <p className="small muted">No payments yet.</p>}
        </div>
      </section>

      <section>
        <SectionHead eyebrow="Documents" title="Invoices" />
        <div className="list">
          {((orders.data as Array<{ id: string; reference: string; createdAt: string; price: { totalPaise: number } }> | undefined) ?? []).slice(0, 5).map((o) => (
            <div className="list-row" key={o.id}>
              <Receipt size={16} aria-hidden="true" />
              <span className="list-row__body"><span className="list-row__title small">Invoice {o.reference}</span><span className="list-row__sub tiny muted">{new Date(o.createdAt).toLocaleDateString()} · {formatINR(o.price.totalPaise)}</span></span>
              <button className="btn btn--secondary btn--sm" onClick={() => void downloadInvoice('orders', o.id, o.reference).catch((e: Error) => showToast(e.message, 'error'))}>Download</button>
            </div>
          ))}
          {orders.data?.length === 0 && <p className="small muted">Invoices appear after your first order.</p>}
        </div>
      </section>

      <section className="card account-preferences">
        <div className="between row--wrap"><span className="row" style={{ gap: 8 }}><Bell size={17} aria-hidden="true" /><span className="small">Notifications</span></span><button className="link" onClick={() => useUI.getState().setNotificationsOpen(true)}>Open notification centre</button></div>
        <div className="between row--wrap"><span className="row" style={{ gap: 8 }}><ShieldCheck size={17} aria-hidden="true" /><span className="small">Privacy & data</span></span><Link className="link" to="/support">Privacy requests</Link></div>
        <div className="between row--wrap"><span className="row" style={{ gap: 8 }}><FileText size={17} aria-hidden="true" /><span className="small">Terms of service</span></span><Link className="link" to="/support">Read terms</Link></div>
      </section>

      <section className="account-danger">
        <button className="btn btn--secondary" onClick={() => void logout()}><LogOut size={16} /> Log out</button>
        <button className="btn btn--danger" onClick={() => void deleteAccount()}><Trash2 size={16} /> Delete account</button>
      </section>

      <p className="tiny muted">Signed in as {user.email} · <UserRound size={11} style={{ verticalAlign: -1 }} /> GOWAYY customer account</p>
    </div>
  );
}

export function Wishlist() {
  const q = useQuery({ queryKey: ['wishlist'], queryFn: () => client.wishlist() });
  const items = (q.data?.items ?? []) as Array<{ id: string; slug: string; name: string; brand: string; variants: Array<{ pricePaise: number; stock: number }> }>;
  return (
    <div className="stack">
      <SectionHead eyebrow="Saved" title="Wishlist" />
      {items.length === 0 && <p className="small muted">Nothing saved yet — tap the heart on any product.</p>}
      <div className="grid-3">
        {items.map((p) => (
          <Link key={p.id} to={`/products/${p.slug}`} className="card card--hover">
            <span className="tiny product-brand">{p.brand}</span>
            <p className="small" style={{ marginTop: 4 }}>{p.name}</p>
            <p style={{ fontWeight: 700, marginTop: 6 }}>{formatINR(p.variants[0]?.pricePaise ?? 0)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
