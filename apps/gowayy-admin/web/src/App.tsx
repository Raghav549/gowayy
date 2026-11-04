import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck, BarChart3, CalendarDays, ChevronRight, Image as ImageIcon, LayoutDashboard, LifeBuoy,
  LogOut, MapPin, Percent, Plus, ScrollText, Search, Settings2, ShieldCheck, ShoppingBag, Store,
  Trash2, Users, Wallet,
} from 'lucide-react';
import { formatINR } from '@gowayy/shared-utils';
import type { User } from '@gowayy/types';
import { admin, client, errorText } from './lib/client';
import { useSession, useUI } from './store';
import { Badge, Card, DataTable, Field, Modal, Stat, ToastHost, type Column } from './components/ui';
import { Posters, ServiceAreas, Destinations } from './sections/content';
import './styles.css';

type SectionId = 'overview' | 'customers' | 'partners' | 'catalog' | 'tourism' | 'posters' | 'coverage' | 'orders' | 'bookings' | 'finance' | 'promotions' | 'support' | 'analytics' | 'audit' | 'roles' | 'settings';

const NAV: Array<{ id: SectionId; label: string; icon: typeof LayoutDashboard; group: string }> = [
  { id: 'tourism', label: 'Destinations', icon: MapPin, group: 'Content' },
  { id: 'posters', label: 'Posters', icon: ImageIcon, group: 'Content' },
  { id: 'coverage', label: 'Cities & service areas', icon: MapPin, group: 'Serviceability' },
  { id: 'audit', label: 'Audit log', icon: ScrollText, group: 'Governance' },
];

// The console is deliberately scoped to content, posters and serviceability.
// Legacy sections remain in the codebase for API compatibility but are not routable.
const ADMIN_SECTIONS = new Set<SectionId>(['tourism', 'posters', 'coverage', 'audit']);

const statusTone = (status?: string) => status === 'active' || status === 'captured' || status === 'paid' || status === 'delivered' || status === 'verified' ? 'good' : status === 'suspended' || status === 'refunded' || status === 'cancelled' || status === 'rejected' ? 'bad' : status === 'pending' || status === 'requires_action' ? 'warn' : 'neutral';

function Login() {
  const setAuth = useSession((s) => s.setAuth);
  const sessionError = useSession((s) => s.error);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const result = await client.login(email, password);
      const user = result.user as User;
      if (!user.roles.includes('admin')) throw new Error('This account does not have admin access.');
      setAuth(user, result.session.token);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-login">
      <div className="admin-login__brand"><img src="/brand/g-symbol.svg" alt="" /><span>GOWAYY</span><em>ADMIN</em></div>
      <form className="card admin-login__card" onSubmit={submit}>
        <h1>Operations console</h1>
        <p className="muted small">Restricted access. Administrators only — customer and partner accounts are rejected by the server.</p>
        <Field label="Email address"><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
        <Field label="Password"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        {(error ?? sessionError) && <div className="notice" role="alert">{error ?? sessionError}</div>}
        <button className="btn btn--primary" disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in to admin'}</button>
        <p className="tiny muted">Every admin action is recorded in the audit log with the acting account.</p>
      </form>
    </div>
  );
}

function Shell({ section, onSection, children }: { section: SectionId; onSection: (s: SectionId) => void; children: ReactNode }) {
  const user = useSession((s) => s.user)!;
  const clear = useSession((s) => s.clear);
  const [navOpen, setNavOpen] = useState(false);
  const groups = useMemo(() => {
    const map = new Map<string, typeof NAV>();
    for (const item of NAV) map.set(item.group, [...(map.get(item.group) ?? []), item]);
    return [...map.entries()];
  }, []);
  const active = NAV.find((n) => n.id === section);
  return (
    <div className="admin-shell">
      <aside className={`admin-nav ${navOpen ? 'is-open' : ''}`} aria-label="Admin sections">
        <div className="admin-nav__brand"><img src="/brand/g-symbol.svg" alt="" /><div><strong>GOWAYY</strong><span>ADMIN CONSOLE</span></div></div>
        <nav>
          {groups.map(([group, items]) => (
            <div className="admin-nav__group" key={group}>
              <span className="admin-nav__label">{group}</span>
              {items.map((item) => (
                <button key={item.id} className={section === item.id ? 'is-active' : ''} onClick={() => { onSection(item.id); setNavOpen(false); }}>
                  <item.icon size={17} aria-hidden="true" /> {item.label}
                  {item.id === 'partners' && <ChevronRight size={14} className="admin-nav__chev" />}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-nav__foot">
          <div className="small"><strong>{user.firstName} {user.lastName}</strong><br /><span className="muted tiny">{user.email}</span></div>
          <button className="btn btn--ghost btn--sm" onClick={() => { clear(); window.location.reload(); }}><LogOut size={15} /> Sign out</button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <button className="btn btn--secondary btn--sm admin-menu" onClick={() => setNavOpen(!navOpen)} aria-expanded={navOpen}>Sections</button>
          <div><span className="eyebrow">Admin</span><h1>{active?.label}</h1></div>
          <div className="admin-topbar__right">
            <span className="pill"><ShieldCheck size={14} /> Signed in as admin</span>
            <span className="admin-avatar" aria-hidden="true">{user.firstName[0]}</span>
          </div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}

function Overview() {
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => admin<{ totals: Record<string, number>; recentActivity: Array<Record<string, string>>; recentOrders: Array<Record<string, unknown>>; serviceAvailability: Record<string, boolean> }>('/overview') });
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const toggleService = async (name: string, enabled: boolean) => {
    try {
      await admin('/settings', { method: 'PATCH', body: { services: { [name]: enabled } } });
      showToast(`${name} ${enabled ? 'enabled' : 'paused'}`, 'success');
      await qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (e) { showToast(errorText(e), 'error'); }
  };
  if (q.isLoading) return <p className="muted">Loading the control centre…</p>;
  if (q.isError) return <div className="notice" role="alert">Overview could not be loaded: {errorText(q.error)}</div>;
  const t = q.data!.totals;
  return (
    <div className="stack-lg">
      <div className="stat-grid">
        <Stat label="Customers" value={t.customers} hint="registered customer accounts" />
        <Stat label="Partners" value={t.partners} hint={`${t.activePartners} active · ${t.pendingApprovals} awaiting review`} tone="gold" />
        <Stat label="Gross revenue" value={formatINR(t.revenuePaise)} hint="captured payments, all services" tone="dark" />
        <Stat label="Orders" value={t.orders} hint={`${t.bookings} bookings`} />
        <Stat label="Open tickets" value={t.openTickets} hint="support queue" />
        <Stat label="Stores" value={t.stores} hint={`${t.products} catalog products`} />
      </div>

      <div className="grid-2">
        <Card title="Service availability" action={<span className="tiny muted">Live to the customer app</span>}>
          <div className="stack">
            {Object.entries(q.data!.serviceAvailability).map(([name, enabled]) => (
              <div className="between" key={name}>
                <span className="small" style={{ textTransform: 'capitalize' }}>{name}</span>
                <button role="switch" aria-checked={enabled} aria-label={`Toggle ${name}`} className={`switch ${enabled ? 'is-on' : ''}`} onClick={() => void toggleService(name, !enabled)}><span /></button>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Recent audit activity">
          <ol className="activity">
            {q.data!.recentActivity.map((a) => (
              <li key={a.id}><span>{a.action}</span><span className="tiny muted">{new Date(a.createdAt).toLocaleString()}</span></li>
            ))}
          </ol>
        </Card>
      </div>

      <Card title="Latest orders">
        <DataTable
          rows={q.data!.recentOrders as Array<{ id: string; reference: string; service: string; status: string; price: { totalPaise: number }; createdAt: string }>}
          columns={[
            { key: 'ref', header: 'Reference', render: (r) => <code>{r.reference}</code> },
            { key: 'service', header: 'Service', render: (r) => r.service },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status.replace(/_/g, ' ')}</Badge> },
            { key: 'total', header: 'Total', render: (r) => formatINR(r.price.totalPaise) },
          ]}
        />
      </Card>
    </div>
  );
}

interface CustomerRow { id: string; name: string; email: string; status: string; orders: number; bookings: number; spendPaise: number; tickets: number; demo: boolean; createdAt: string }
function Customers() {
  const [term, setTerm] = useState('');
  const q = useQuery({ queryKey: ['admin', 'customers', term], queryFn: () => admin<{ items: CustomerRow[] }>(`/customers?q=${encodeURIComponent(term)}`) });
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const update = async (id: string, status: string) => {
    if (status === 'suspended' && !window.confirm('Suspend this customer and end their sessions?')) return;
    try { await admin(`/customers/${id}`, { method: 'PATCH', body: { status } }); showToast(`Customer ${status}`, 'success'); await qc.invalidateQueries({ queryKey: ['admin'] }); }
    catch (e) { showToast(errorText(e), 'error'); }
  };
  const columns: Array<Column<CustomerRow>> = [
    { key: 'name', header: 'Customer', render: (r) => <div><strong>{r.name}</strong><div className="tiny muted">{r.email}</div></div> },
    { key: 'activity', header: 'Activity', render: (r) => <div className="tiny">{r.orders} orders · {r.bookings} bookings · {r.tickets} tickets</div> },
    { key: 'spend', header: 'Lifetime value', render: (r) => formatINR(r.spendPaise) },
    { key: 'joined', header: 'Joined', render: (r) => new Date(r.createdAt).toLocaleDateString() },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
    { key: 'actions', header: '', render: (r) => r.status === 'active'
      ? <button className="btn btn--danger btn--sm" onClick={() => void update(r.id, 'suspended')}>Suspend</button>
      : <button className="btn btn--secondary btn--sm" onClick={() => void update(r.id, 'active')}>Reactivate</button> },
  ];
  return (
    <div className="stack-lg">
      <div className="toolbar">
        <div className="searchbox"><Search size={16} /><input className="input" placeholder="Search name or email" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search customers" /></div>
        <span className="tiny muted">{q.data?.items.length ?? 0} customers</span>
      </div>
      <Card><DataTable rows={q.data?.items ?? []} columns={columns} loading={q.isLoading} empty="No customers match this search." /></Card>
      <p className="tiny muted">Suspension ends every active session immediately; the account is refused at sign-in.</p>
    </div>
  );
}

interface PartnerRow { id: string; name: string; email: string; roles: string[]; businessName: string | null; approval: string; status: string; orders: number; documents: Array<{ id: string; type: string; status: string }>; driver: { verification: string; vehicleClass: string; online: boolean } | null }
function Partners() {
  const [filter, setFilter] = useState('all');
  const q = useQuery({ queryKey: ['admin', 'partners'], queryFn: () => admin<{ items: PartnerRow[] }>('/partners') });
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const update = async (id: string, body: Record<string, unknown>) => {
    try { await admin(`/partners/${id}`, { method: 'PATCH', body }); showToast('Partner updated', 'success'); await qc.invalidateQueries({ queryKey: ['admin'] }); }
    catch (e) { showToast(errorText(e), 'error'); }
  };
  const rows = (q.data?.items ?? []).filter((p) => filter === 'all' || p.approval === filter || p.status === filter);
  const columns: Array<Column<PartnerRow>> = [
    { key: 'name', header: 'Partner', render: (r) => <div><strong>{r.businessName ?? r.name}</strong><div className="tiny muted">{r.email}</div><div className="tiny muted">{r.roles.join(' · ')}{r.driver?.online ? ' · online' : ''}</div></div> },
    { key: 'docs', header: 'Verification', render: (r) => <div className="row row--wrap" style={{ gap: 4 }}><Badge tone={statusTone(r.approval)}>{r.approval}</Badge>{r.documents.length > 0 && <span className="tiny muted">{r.documents.filter((d) => d.status === 'verified').length}/{r.documents.length} docs</span>}</div> },
    { key: 'orders', header: 'Orders', render: (r) => r.orders },
    { key: 'status', header: 'Account', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
    { key: 'actions', header: 'Review', render: (r) => (
      <div className="row row--wrap" style={{ gap: 6 }}>
        {r.approval !== 'verified' && <button className="btn btn--secondary btn--sm" onClick={() => void update(r.id, { approval: 'verified' })}>Approve</button>}
        {r.approval !== 'rejected' && <button className="btn btn--ghost btn--sm" onClick={() => void update(r.id, { approval: 'rejected' })}>Reject</button>}
        {r.status === 'active'
          ? <button className="btn btn--danger btn--sm" onClick={() => void update(r.id, { status: 'suspended' })}>Suspend</button>
          : <button className="btn btn--secondary btn--sm" onClick={() => void update(r.id, { status: 'active' })}>Reactivate</button>}
      </div>
    ) },
  ];
  return (
    <div className="stack-lg">
      <div className="toolbar">
        <div className="chips">{['all', 'pending', 'verified', 'rejected', 'suspended'].map((f) => <button key={f} className={`chip ${filter === f ? 'chip--active' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}</div>
      </div>
      <Card><DataTable rows={rows} columns={columns} loading={q.isLoading} empty="No partners in this filter." /></Card>
      <p className="tiny muted">Approval changes the partner's verification status server-side. Only approved partners can accept bookings and orders.</p>
    </div>
  );
}

function Catalog() {
  const [tab, setTab] = useState<'stores' | 'categories' | 'products'>('stores');
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const stores = useQuery({ queryKey: ['admin', 'stores'], queryFn: () => admin<{ items: Array<Record<string, unknown>> }>('/stores') });
  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => admin<{ items: Array<Record<string, unknown>> }>('/categories') });
  const products = useQuery({ queryKey: ['admin', 'products'], queryFn: () => admin<{ items: Array<Record<string, unknown>> }>('/products') });
  const [showStore, setShowStore] = useState(false);
  const [storeForm, setStoreForm] = useState({ name: '', categoryId: '', address: '', phone: '', openingHours: '09:00–20:00', deliveryCoverageKm: '5' });
  const [showCategory, setShowCategory] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', image: '', description: '' });
  const [busy, setBusy] = useState(false);

  const createStore = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await admin('/stores', { method: 'POST', body: { ...storeForm, deliveryCoverageKm: Number(storeForm.deliveryCoverageKm) } });
      showToast('Store created', 'success'); setShowStore(false); setStoreForm({ name: '', categoryId: '', address: '', phone: '', openingHours: '09:00–20:00', deliveryCoverageKm: '5' });
      await qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) { showToast(errorText(err), 'error'); } finally { setBusy(false); }
  };
  const createCategory = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await admin('/categories', { method: 'POST', body: categoryForm });
      showToast('Category created', 'success'); setShowCategory(false); setCategoryForm({ name: '', image: '', description: '' });
      await qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) { showToast(errorText(err), 'error'); } finally { setBusy(false); }
  };
  const patch = async (resource: string, id: string, body: Record<string, unknown>) => {
    try { await admin(`/${resource}/${id}`, { method: 'PATCH', body }); showToast('Updated', 'success'); await qc.invalidateQueries({ queryKey: ['admin'] }); }
    catch (err) { showToast(errorText(err), 'error'); }
  };

  const storeRows = (stores.data?.items ?? []) as Array<{ id: string; name: string; categoryName: string; status: string; verified: boolean; productCount: number; address: string; openingHours: string }>;
  const categoryRows = (categories.data?.items ?? []) as Array<{ id: string; name: string; active: boolean; productCount: number; image?: string }>;
  const productRows = (products.data?.items ?? []) as Array<{ id: string; name: string; brand: string; category: string; storeId: string; stock: number; published: boolean; active: boolean; featured: boolean; variants: Array<{ pricePaise: number }> }>;

  return (
    <div className="stack-lg">
      <div className="toolbar between">
        <div className="chips">
          {(['stores', 'categories', 'products'] as const).map((t) => <button key={t} className={`chip ${tab === t ? 'chip--active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
        </div>
        {tab === 'stores' && <button className="btn btn--primary btn--sm" onClick={() => setShowStore(true)}><Plus size={15} /> New store</button>}
        {tab === 'categories' && <button className="btn btn--primary btn--sm" onClick={() => setShowCategory(true)}><Plus size={15} /> New category</button>}
      </div>

      {tab === 'stores' && <Card><DataTable rows={storeRows} loading={stores.isLoading} columns={[
        { key: 'name', header: 'Store', render: (r) => <div><strong>{r.name}</strong><div className="tiny muted">{r.categoryName} · {r.address || 'no address'}</div></div> },
        { key: 'products', header: 'Products', render: (r) => r.productCount },
        { key: 'hours', header: 'Hours', render: (r) => <span className="tiny">{r.openingHours}</span> },
        { key: 'verified', header: 'Verified', render: (r) => <Badge tone={r.verified ? 'good' : 'warn'}>{r.verified ? 'verified' : 'unverified'}</Badge> },
        { key: 'status', header: 'Status', render: (r) => <div className="row" style={{ gap: 6 }}><Badge tone={statusTone(r.status)}>{r.status}</Badge>
          <button className="btn btn--ghost btn--sm" onClick={() => void patch('stores', r.id, { status: r.status === 'active' ? 'paused' : 'active' })}>{r.status === 'active' ? 'Pause' : 'Activate'}</button>
          <button className="btn btn--ghost btn--sm" onClick={() => void patch('stores', r.id, { verified: !r.verified })}>{r.verified ? 'Unverify' : 'Verify'}</button></div> },
      ]} /></Card>}

      {tab === 'categories' && <Card><DataTable rows={categoryRows} loading={categories.isLoading} columns={[
        { key: 'name', header: 'Category', render: (r) => <div className="row">{r.image ? <img src={r.image} alt="" className="thumb" /> : <span className="thumb thumb--empty" />}<strong>{r.name}</strong></div> },
        { key: 'products', header: 'Products', render: (r) => r.productCount },
        { key: 'active', header: 'Visible', render: (r) => <button role="switch" aria-checked={r.active} className={`switch ${r.active ? 'is-on' : ''}`} onClick={() => void patch('categories', r.id, { active: !r.active })}><span /></button> },
      ]} /></Card>}

      {tab === 'products' && <Card><DataTable rows={productRows} loading={products.isLoading} columns={[
        { key: 'name', header: 'Product', render: (r) => <div><strong>{r.name}</strong><div className="tiny muted">{r.brand} · {r.category}</div></div> },
        { key: 'price', header: 'Price', render: (r) => formatINR(r.variants?.[0]?.pricePaise ?? 0) },
        { key: 'stock', header: 'Stock', render: (r) => <span className={r.stock <= 3 ? 'text-warn' : ''}>{r.stock}</span> },
        { key: 'state', header: 'State', render: (r) => <div className="row" style={{ gap: 6 }}><Badge tone={r.published ? 'good' : 'warn'}>{r.published ? 'published' : 'draft'}</Badge>{r.featured && <Badge tone="gold">featured</Badge>}</div> },
        { key: 'actions', header: '', render: (r) => <div className="row" style={{ gap: 6 }}>
          <button className="btn btn--ghost btn--sm" onClick={() => void patch('products', r.id, { published: !r.published })}>{r.published ? 'Unpublish' : 'Publish'}</button>
          <button className="btn btn--ghost btn--sm" onClick={() => void patch('products', r.id, { featured: !r.featured })}>{r.featured ? 'Unfeature' : 'Feature'}</button>
        </div> },
      ]} /></Card>}

      {showStore && <Modal title="Create store" onClose={() => setShowStore(false)}>
        <form className="form-grid" onSubmit={createStore}>
          <Field label="Store name"><input className="input" value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} required /></Field>
          <Field label="Category"><select className="input" value={storeForm.categoryId} onChange={(e) => setStoreForm({ ...storeForm, categoryId: e.target.value })}><option value="">General</option>{categoryRows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Address"><input className="input" value={storeForm.address} onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={storeForm.phone} onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })} /></Field>
          <Field label="Opening hours"><input className="input" value={storeForm.openingHours} onChange={(e) => setStoreForm({ ...storeForm, openingHours: e.target.value })} /></Field>
          <Field label="Delivery coverage (km)"><input className="input" type="number" min={1} max={40} value={storeForm.deliveryCoverageKm} onChange={(e) => setStoreForm({ ...storeForm, deliveryCoverageKm: e.target.value })} /></Field>
          <div className="form-actions"><button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Create store'}</button></div>
        </form>
      </Modal>}

      {showCategory && <Modal title="Create category" onClose={() => setShowCategory(false)}>
        <form className="form-grid" onSubmit={createCategory}>
          <Field label="Category name"><input className="input" value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} required /></Field>
          <Field label="Image URL" hint="Upload through the partner app first, then paste the /uploads path here."><input className="input" value={categoryForm.image} onChange={(e) => setCategoryForm({ ...categoryForm, image: e.target.value })} /></Field>
          <Field label="Description"><textarea className="input" rows={3} value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} /></Field>
          {categoryForm.image && <img src={categoryForm.image} alt="Category preview" className="preview" />}
          <div className="form-actions"><button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Create category'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

function Orders() {
  const [service, setService] = useState('');
  const q = useQuery({ queryKey: ['admin', 'orders', service], queryFn: () => admin<{ items: Array<Record<string, never>> }>(`/orders?service=${service}`) });
  const rows = (q.data?.items ?? []) as unknown as Array<{ id: string; reference: string; service: string; status: string; paymentStatus?: string; price: { totalPaise: number }; createdAt: string; deliveryVerification?: { required: boolean; verified: boolean }; userId: string }>;
  return (
    <div className="stack-lg">
      <div className="toolbar"><div className="chips">{['', 'food', 'grocery', 'marketplace'].map((s) => <button key={s || 'all'} className={`chip ${service === s ? 'chip--active' : ''}`} onClick={() => setService(s)}>{s || 'all services'}</button>)}</div></div>
      <Card><DataTable rows={rows} loading={q.isLoading} columns={[
        { key: 'ref', header: 'Reference', render: (r) => <code>{r.reference}</code> },
        { key: 'service', header: 'Service', render: (r) => r.service },
        { key: 'payment', header: 'Payment', render: (r) => <Badge tone={statusTone(r.paymentStatus)}>{r.paymentStatus ?? 'unpaid'}</Badge> },
        { key: 'delivery', header: 'Delivery code', render: (r) => <span className="tiny">{r.deliveryVerification?.verified ? 'verified' : r.deliveryVerification?.required ? 'awaiting partner' : 'not required'}</span> },
        { key: 'total', header: 'Total', render: (r) => formatINR(r.price.totalPaise) },
        { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status.replace(/_/g, ' ')}</Badge> },
        { key: 'when', header: 'Placed', render: (r) => <span className="tiny muted">{new Date(r.createdAt).toLocaleString()}</span> },
      ]} /></Card>
      <p className="tiny muted">Delivery codes are shown to partners only as masked state here; the plain code is never exposed in the admin list.</p>
    </div>
  );
}

function Bookings() {
  const q = useQuery({ queryKey: ['admin', 'bookings'], queryFn: () => admin<{ items: Array<Record<string, never>> }>('/bookings') });
  const rows = (q.data?.items ?? []) as unknown as Array<{ id: string; reference: string; service: string; title: string; status: string; price: { totalPaise: number }; createdAt: string }>;
  return (
    <div className="stack-lg">
      <div className="stat-grid">
        <Stat label="Bookings" value={rows.length} hint="transport, stays, tours and parcels" />
        <Stat label="Confirmed" value={rows.filter((b) => b.status === 'confirmed').length} tone="gold" />
        <Stat label="Value" value={formatINR(rows.reduce((n, b) => n + b.price.totalPaise, 0))} tone="dark" />
      </div>
      <Card><DataTable rows={rows} loading={q.isLoading} columns={[
        { key: 'ref', header: 'Reference', render: (b) => <code>{b.reference}</code> },
        { key: 'title', header: 'Booking', render: (b) => <div><strong>{b.title}</strong><div className="tiny muted">{b.service}</div></div> },
        { key: 'value', header: 'Value', render: (b) => formatINR(b.price.totalPaise) },
        { key: 'status', header: 'Status', render: (b) => <Badge tone={statusTone(b.status)}>{b.status.replace(/_/g, ' ')}</Badge> },
        { key: 'when', header: 'Created', render: (b) => <span className="tiny muted">{new Date(b.createdAt).toLocaleString()}</span> },
      ]} /></Card>
    </div>
  );
}

function Finance() {
  const q = useQuery({ queryKey: ['admin', 'payments'], queryFn: () => admin<{ items: Array<Record<string, never>>; reconciliation: { capturedPaise: number; refundedPaise: number; pendingPaise: number } }>('/payments') });
  const settlements = useQuery({ queryKey: ['admin', 'settlements'], queryFn: () => admin<{ items: Array<{ id: string; userId: string; partner: string | null; amountPaise: number; status: string; createdAt: string }>; commissionPercent: number }>('/settlements') });
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const rows = (q.data?.items ?? []) as unknown as Array<{ id: string; method: string; status: string; amountPaise: number; createdAt: string; userId: string }>;
  const refund = async (id: string) => {
    if (!window.confirm('Record a full refund for this captured payment?')) return;
    try { await admin(`/payments/${id}/refund`, { method: 'POST', body: { full: true, reason: 'Admin refund' } }); showToast('Refund recorded; customer notified', 'success'); await qc.invalidateQueries({ queryKey: ['admin'] }); }
    catch (e) { showToast(errorText(e), 'error'); }
  };
  const paySettlement = async (id: string) => {
    if (!window.confirm('Mark this settlement as paid?')) return;
    try { await admin(`/settlements/${id}/pay`, { method: 'POST' }); showToast('Settlement marked paid', 'success'); await qc.invalidateQueries({ queryKey: ['admin'] }); }
    catch (e) { showToast(errorText(e), 'error'); }
  };
  return (
    <div className="stack-lg">
      <div className="stat-grid">
        <Stat label="Captured" value={formatINR(q.data?.reconciliation.capturedPaise ?? 0)} hint="verified by the provider" tone="dark" />
        <Stat label="Refunded" value={formatINR(q.data?.reconciliation.refundedPaise ?? 0)} hint="recorded refunds" />
        <Stat label="Awaiting action" value={formatINR(q.data?.reconciliation.pendingPaise ?? 0)} hint="requires customer action" tone="gold" />
        <Stat label="Commission" value={`${settlements.data?.commissionPercent ?? 15}%`} hint="platform share of completed orders" />
      </div>
      <Card title="Payments"><DataTable rows={rows} loading={q.isLoading} columns={[
        { key: 'id', header: 'Payment', render: (p) => <code className="tiny">{p.id}</code> },
        { key: 'method', header: 'Method', render: (p) => p.method.replace(/_/g, ' ') },
        { key: 'amount', header: 'Amount', render: (p) => formatINR(p.amountPaise) },
        { key: 'status', header: 'Status', render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge> },
        { key: 'when', header: 'Date', render: (p) => <span className="tiny muted">{new Date(p.createdAt).toLocaleDateString()}</span> },
        { key: 'actions', header: '', render: (p) => p.status === 'captured' ? <button className="btn btn--danger btn--sm" onClick={() => void refund(p.id)}>Refund</button> : <span className="tiny muted">—</span> },
      ]} /></Card>
      <Card title="Partner settlements"><DataTable rows={settlements.data?.items ?? []} loading={settlements.isLoading} columns={[
        { key: 'partner', header: 'Partner', render: (s) => <span className="small">{s.partner ?? s.userId}</span> },
        { key: 'amount', header: 'Amount', render: (s) => formatINR(s.amountPaise) },
        { key: 'status', header: 'Status', render: (s) => <Badge tone={statusTone(s.status)}>{s.status}</Badge> },
        { key: 'actions', header: '', render: (s) => s.status !== 'paid' ? <button className="btn btn--secondary btn--sm" onClick={() => void paySettlement(s.id)}>Mark paid</button> : <span className="tiny muted">settled</span> },
      ]} /></Card>
      <p className="tiny muted">Refunds are recorded against the payment and notify the customer. Card data is never stored by GOWAYY.</p>
    </div>
  );
}

interface BannerRow { id: string; title: string; subtitle: string; href: string; image: string | null; active: boolean; order: number }
function Promotions() {
  const banners = useQuery({ queryKey: ['admin', 'banners'], queryFn: () => admin<{ items: BannerRow[] }>('/banners') });
  const offers = useQuery({ queryKey: ['admin', 'offers'], queryFn: () => admin<{ items: Array<{ id: string; title: string; code?: string; active: boolean; discountPercent?: number; discountPaise?: number }>; coupons: Array<{ code: string; description: string; active: boolean }> }>('/offers') });
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [form, setForm] = useState({ title: '', subtitle: '', href: '/', image: '' });
  const [busy, setBusy] = useState(false);
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await admin('/banners', { method: 'POST', body: { ...form, image: form.image || null, active: true } });
      showToast('Banner published', 'success'); setForm({ title: '', subtitle: '', href: '/', image: '' });
      await qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) { showToast(errorText(err), 'error'); } finally { setBusy(false); }
  };
  const toggleBanner = async (b: BannerRow) => {
    try { await admin(`/banners/${b.id}`, { method: 'PATCH', body: { active: !b.active } }); await qc.invalidateQueries({ queryKey: ['admin'] }); }
    catch (e) { showToast(errorText(e), 'error'); }
  };
  const removeBanner = async (id: string) => {
    if (!window.confirm('Delete this banner?')) return;
    try { await admin(`/banners/${id}`, { method: 'DELETE' }); showToast('Banner deleted', 'success'); await qc.invalidateQueries({ queryKey: ['admin'] }); }
    catch (e) { showToast(errorText(e), 'error'); }
  };
  const toggleOffer = async (id: string, active: boolean) => {
    try { await admin(`/offers/${id}`, { method: 'PATCH', body: { active } }); await qc.invalidateQueries({ queryKey: ['admin'] }); }
    catch (e) { showToast(errorText(e), 'error'); }
  };
  return (
    <div className="stack-lg">
      <div className="grid-2">
        <Card title="New banner">
          <form className="form-grid" onSubmit={create}>
            <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
            <Field label="Subtitle"><input className="input" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></Field>
            <Field label="Link" hint="Customer app path, e.g. /explore or /products/slug"><input className="input" value={form.href} onChange={(e) => setForm({ ...form, href: e.target.value })} /></Field>
            <Field label="Image URL" hint="Use a rights-verified image already stored under /images or /uploads."><input className="input" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} /></Field>
            <div className="banner-preview">
              {form.image ? <img src={form.image} alt="Banner preview" /> : <div className="banner-preview__empty"><ImageIcon size={18} /> Image preview</div>}
              <div className="banner-preview__copy"><span className="eyebrow">Featured</span><strong>{form.title || 'Banner title'}</strong><span className="tiny">{form.subtitle || 'Supporting line'}</span></div>
            </div>
            <div className="form-actions"><button className="btn btn--primary" disabled={busy || !form.title}>{busy ? 'Publishing…' : 'Publish banner'}</button></div>
          </form>
        </Card>
        <Card title="Live banners">
          <div className="stack">
            {(banners.data?.items ?? []).map((b) => (
              <div className="banner-row" key={b.id}>
                {b.image ? <img src={b.image} alt="" /> : <span className="thumb thumb--empty" />}
                <div style={{ flex: 1, minWidth: 0 }}><strong className="small">{b.title}</strong><div className="tiny muted">{b.href}</div></div>
                <button role="switch" aria-checked={b.active} aria-label={`Toggle ${b.title}`} className={`switch ${b.active ? 'is-on' : ''}`} onClick={() => void toggleBanner(b)}><span /></button>
                <button className="icon-btn" aria-label="Delete banner" onClick={() => void removeBanner(b.id)}><Trash2 size={15} /></button>
              </div>
            ))}
            {banners.data?.items.length === 0 && <p className="empty">No banners yet.</p>}
          </div>
        </Card>
      </div>
      <Card title="Offers and coupons">
        <DataTable rows={(offers.data?.items ?? []) as Array<{ id: string; title: string; code?: string; active: boolean }>} columns={[
          { key: 'title', header: 'Offer', render: (o) => <strong className="small">{o.title}</strong> },
          { key: 'code', header: 'Code', render: (o) => o.code ? <code>{o.code}</code> : '—' },
          { key: 'active', header: 'Visible', render: (o) => <button role="switch" aria-checked={o.active} className={`switch ${o.active ? 'is-on' : ''}`} onClick={() => void toggleOffer(o.id, !o.active)}><span /></button> },
        ]} />
        <div className="stack" style={{ marginTop: 14 }}>
          {(offers.data?.coupons ?? []).map((c) => <div className="between" key={c.code}><span className="small"><code>{c.code}</code> · {c.description}</span><Badge tone={c.active ? 'good' : 'warn'}>{c.active ? 'active' : 'paused'}</Badge></div>)}
        </div>
      </Card>
    </div>
  );
}

function Support() {
  const q = useQuery({ queryKey: ['admin', 'support'], queryFn: () => admin<{ items: Array<{ id: string; subject: string; body: string; status: string; customerEmail: string | null; createdAt: string; resolution?: string }> }>('/support') });
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const resolve = async (id: string) => {
    try { await admin(`/support/${id}`, { method: 'PATCH', body: { status: 'resolved', resolution: 'Resolved by GOWAYY support' } }); showToast('Ticket resolved', 'success'); await qc.invalidateQueries({ queryKey: ['admin'] }); }
    catch (e) { showToast(errorText(e), 'error'); }
  };
  return (
    <div className="stack-lg">
      <Card title="Support queue"><DataTable rows={q.data?.items ?? []} loading={q.isLoading} empty="No support tickets." columns={[
        { key: 'subject', header: 'Ticket', render: (t) => <div><strong className="small">{t.subject}</strong><div className="tiny muted">{t.body.slice(0, 110)}</div></div> },
        { key: 'customer', header: 'Customer', render: (t) => <span className="tiny">{t.customerEmail ?? '—'}</span> },
        { key: 'status', header: 'Status', render: (t) => <Badge tone={statusTone(t.status)}>{t.status}</Badge> },
        { key: 'actions', header: '', render: (t) => t.status !== 'resolved' ? <button className="btn btn--secondary btn--sm" onClick={() => void resolve(t.id)}>Resolve</button> : <span className="tiny muted">closed</span> },
      ]} /></Card>
    </div>
  );
}

function Analytics() {
  const q = useQuery({ queryKey: ['admin', 'analytics'], queryFn: () => admin<{ days: Array<{ date: string; revenuePaise: number; orders: number; bookings: number }>; byService: Record<string, { count: number; valuePaise: number }>; byDestination: Record<string, number> }>('/analytics') });
  if (q.isLoading) return <p className="muted">Loading analytics…</p>;
  if (!q.data) return <div className="notice">Analytics unavailable: {errorText(q.error)}</div>;
  const max = Math.max(1, ...q.data.days.map((d) => d.revenuePaise));
  return (
    <div className="stack-lg">
      <Card title="Revenue — last 14 days">
        <div className="chart" role="img" aria-label="Daily revenue for the last 14 days">
          {q.data.days.map((d) => (
            <div className="chart__bar" key={d.date} title={`${d.date}: ${formatINR(d.revenuePaise)}`}>
              <div style={{ height: `${Math.max(3, (d.revenuePaise / max) * 100)}%` }} />
              <span>{d.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid-2">
        <Card title="By service"><DataTable rows={Object.entries(q.data.byService).map(([service, v]) => ({ id: service, service, ...v }))} columns={[
          { key: 'service', header: 'Service', render: (r) => r.service },
          { key: 'count', header: 'Count', render: (r) => r.count },
          { key: 'value', header: 'Value', render: (r) => formatINR(r.valuePaise) },
        ]} /></Card>
        <Card title="Demand by destination"><DataTable rows={Object.entries(q.data.byDestination).map(([name, count]) => ({ id: name, name, count }))} columns={[
          { key: 'name', header: 'Destination', render: (r) => r.name },
          { key: 'count', header: 'Bookings', render: (r) => r.count },
        ]} /></Card>
      </div>
    </div>
  );
}

function AuditLog() {
  const [term, setTerm] = useState('');
  const q = useQuery({ queryKey: ['admin', 'audit', term], queryFn: () => admin<{ items: Array<{ id: string; action: string; actor: string; createdAt: string; meta?: Record<string, unknown> }> }>(`/audit?q=${encodeURIComponent(term)}`) });
  return (
    <div className="stack-lg">
      <div className="toolbar"><div className="searchbox"><Search size={16} /><input className="input" placeholder="Filter by action or actor" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Filter audit log" /></div></div>
      <Card><DataTable rows={q.data?.items ?? []} loading={q.isLoading} columns={[
        { key: 'action', header: 'Action', render: (a) => <code>{a.action}</code> },
        { key: 'actor', header: 'Actor', render: (a) => <span className="tiny">{a.actor}</span> },
        { key: 'meta', header: 'Details', render: (a) => <span className="tiny muted">{a.meta ? JSON.stringify(a.meta) : '—'}</span> },
        { key: 'when', header: 'Time', render: (a) => <span className="tiny muted">{new Date(a.createdAt).toLocaleString()}</span> },
      ]} /></Card>
    </div>
  );
}

function Roles() {
  const rows = [
    { id: 'customer', role: 'Customer', read: 'Own orders, bookings, payments', write: 'Own profile, addresses, reviews', restricted: 'No admin or partner data' },
    { id: 'partner', role: 'Partner', read: 'Own store, orders, bookings, earnings', write: 'Catalog, pricing, order status, verification codes', restricted: 'No other partner, no platform finance' },
    { id: 'admin', role: 'Admin', read: 'All platform records and audit history', write: 'Verification, refunds, settlements, banners, settings', restricted: 'No raw card data, no payment capture override' },
    { id: 'support', role: 'Support (proposed)', read: 'Tickets and customer contact', write: 'Ticket replies and resolutions', restricted: 'No finance or catalog writes' },
  ];
  return (
    <div className="stack-lg">
      <Card title="Role matrix"><DataTable rows={rows} columns={[
        { key: 'role', header: 'Role', render: (r) => <strong>{r.role}</strong> },
        { key: 'read', header: 'Can read', render: (r) => <span className="small">{r.read}</span> },
        { key: 'write', header: 'Can change', render: (r) => <span className="small">{r.write}</span> },
        { key: 'restricted', header: 'Explicitly denied', render: (r) => <span className="small muted">{r.restricted}</span> },
      ]} /></Card>
      <p className="tiny muted">Roles are enforced by the API on every request. Hiding a control in the interface is never treated as authorisation.</p>
    </div>
  );
}

function Settings() {
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => admin<{ services: Record<string, boolean>; appConfig: Record<string, unknown> }>('/settings') });
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [config, setConfig] = useState<{ supportEmail: string; announcement: string; maintenance: boolean; commissionPercent: number }>({ supportEmail: '', announcement: '', maintenance: false, commissionPercent: 15 });
  useEffect(() => {
    if (!q.data) return;
    const c = q.data.appConfig as Partial<typeof config>;
    setConfig({ supportEmail: c.supportEmail ?? 'support@gowayy.app', announcement: c.announcement ?? '', maintenance: Boolean(c.maintenance), commissionPercent: Number(c.commissionPercent ?? 15) });
  }, [q.data]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await admin('/settings', { method: 'PATCH', body: { appConfig: config } }); showToast('Settings saved', 'success'); await qc.invalidateQueries({ queryKey: ['admin'] }); }
    catch (err) { showToast(errorText(err), 'error'); }
  };
  const toggle = async (name: string, enabled: boolean) => {
    try { await admin('/settings', { method: 'PATCH', body: { services: { [name]: enabled } } }); await qc.invalidateQueries({ queryKey: ['admin'] }); showToast('Service availability updated', 'success'); }
    catch (e) { showToast(errorText(e), 'error'); }
  };
  if (q.isLoading) return <p className="muted">Loading settings…</p>;
  return (
    <div className="grid-2">
      <Card title="Service availability">
        <div className="stack">{Object.entries(q.data?.services ?? {}).map(([name, enabled]) => (
          <div className="between" key={name}><span className="small" style={{ textTransform: 'capitalize' }}>{name}</span><button role="switch" aria-checked={enabled} aria-label={`Toggle ${name}`} className={`switch ${enabled ? 'is-on' : ''}`} onClick={() => void toggle(name, !enabled)}><span /></button></div>
        ))}</div>
      </Card>
      <Card title="App configuration and CMS">
        <form className="form-grid" onSubmit={save}>
          <Field label="Support email"><input className="input" type="email" value={config.supportEmail} onChange={(e) => setConfig({ ...config, supportEmail: e.target.value })} /></Field>
          <Field label="Home announcement" hint="Shown in the customer app; leave blank to hide."><textarea className="input" rows={3} value={config.announcement} onChange={(e) => setConfig({ ...config, announcement: e.target.value })} /></Field>
          <Field label="Platform commission (%)"><input className="input" type="number" min={0} max={40} value={config.commissionPercent} onChange={(e) => setConfig({ ...config, commissionPercent: Number(e.target.value) })} /></Field>
          <label className="field field--check"><input type="checkbox" checked={config.maintenance} onChange={(e) => setConfig({ ...config, maintenance: e.target.checked })} /> Maintenance banner enabled</label>
          <div className="form-actions"><button className="btn btn--primary">Save configuration</button></div>
        </form>
      </Card>
    </div>
  );
}

const SECTIONS: Record<SectionId, ComponentType> = {
  overview: Overview, customers: Customers, partners: Partners, catalog: Catalog, tourism: Destinations, posters: Posters, coverage: ServiceAreas,
  orders: Orders, bookings: Bookings, finance: Finance, promotions: Promotions, support: Support,
  analytics: Analytics, audit: AuditLog, roles: Roles, settings: Settings,
};

export default function App() {
  const { user, loading, hydrate } = useSession();
  const toast = useUI((s) => s.toast);
  const clearToast = useUI((s) => s.clearToast);
  const [section, setSection] = useState<SectionId>(() => { const h = window.location.hash.slice(1) as SectionId; return ADMIN_SECTIONS.has(h) ? h : 'tourism'; });
  const Section = ADMIN_SECTIONS.has(section) ? SECTIONS[section] : Destinations;

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => { window.location.hash = section; }, [section]);
  useEffect(() => {
    const onHash = () => { const h = window.location.hash.slice(1) as SectionId; setSection(ADMIN_SECTIONS.has(h) ? h : 'tourism'); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (loading) return <div className="admin-loading"><span className="spinner" aria-hidden="true" /> Checking administrator session…</div>;
  if (!user) return <><Login /><ToastHost toast={toast} onDone={clearToast} /></>;
  return (
    <>
      <Shell section={section} onSection={setSection}><Section /></Shell>
      <ToastHost toast={toast} onDone={clearToast} />
    </>
  );
}
