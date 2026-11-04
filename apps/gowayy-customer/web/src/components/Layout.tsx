import { useEffect, useState } from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Home, Compass, ClipboardList, ShoppingBag, UserRound, Search, Bell, MapPin, X,
  CarFront, BedDouble, UtensilsCrossed, ShoppingBasket, Mountain, Ticket, Package, Sparkles, ChevronRight, Store, ShoppingCart,
} from 'lucide-react';
import { client } from '../lib/client';
import { catalogue } from '@gowayy/catalog';
import { useSession } from '../store/useSession';
import { useUI } from '../store/useUI';
import { useJourney } from '../store/useJourney';
import { GSymbol, Wordmark } from './ui';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/bookings', label: 'Bookings', icon: ClipboardList },
  { to: '/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/account', label: 'Account', icon: UserRound },
];
const SERVICES = [
  { to: '/categories', label: 'Marketplace', icon: Store },
  { to: '/cabs', label: 'Cabs', icon: CarFront },
  { to: '/hotels', label: 'Hotels', icon: BedDouble },
  { to: '/food', label: 'Food', icon: UtensilsCrossed },
  { to: '/groceries', label: 'Groceries', icon: ShoppingBasket },
  { to: '/tourism', label: 'Tourism', icon: Mountain },
  { to: '/experiences', label: 'Experiences', icon: Sparkles },
  { to: '/packages', label: 'Packages', icon: Ticket },
  { to: '/parcels', label: 'Parcels', icon: Package },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const { setNotificationsOpen, notificationsOpen, setSearchOpen, searchOpen, toast, clearToast } = useUI();
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationLabel, setLocationLabel] = useState<string>('Darjeeling Himalaya');
  const [searchText, setSearchText] = useState('');
  const notif = useQuery({ queryKey: ['notifications'], queryFn: () => client.notifications(), enabled: Boolean(user), refetchInterval: 30000 });
  const cartCount = useQuery({ queryKey: ['cart'], queryFn: () => client.cart(), enabled: Boolean(user), refetchInterval: 30000 });
  const cartItems = (cartCount.data as { itemCount?: number } | undefined)?.itemCount ?? 0;
  const search = useQuery({ queryKey: ['global-search', searchText], queryFn: () => client.search(searchText), enabled: searchOpen && searchText.trim().length > 1 });
  const journey = useJourney((s) => s.journey);
  const patchJourney = useJourney((s) => s.patch);

  useEffect(() => { if (toast) { const t = window.setTimeout(clearToast, 3800); return () => window.clearTimeout(t); } }, [toast, clearToast]);
  useEffect(() => { const meta = document.querySelector('meta[name="theme-color"]'); meta?.setAttribute('content', '#F8F3FB'); }, []);

  const choosePlace = async (id: string, name: string) => {
    setLocationLabel(name); setLocationOpen(false);
    if (user) { try { await patchJourney({ pickup: id }); } catch { /* non-blocking */ } }
  };
  const openHit = (href: string) => { setSearchOpen(false); setSearchText(''); navigate(href); };

  return (
    <div className="app-shell app-customer">
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand" aria-label="GOWAYY home"><GSymbol size={38} /><Wordmark height={18} /></Link>
          <button className="location-chip" onClick={() => setLocationOpen(true)} title="Change current location">
            <MapPin size={15} style={{ color: 'var(--gw-champagne)' }} /><strong>{locationLabel}</strong><ChevronRight size={14} />
          </button>
          <button className="search-trigger" onClick={() => setSearchOpen(true)}><Search size={17} /><span>Search destinations, stays, food, groceries…</span></button>
          <button className="icon-btn" aria-label="Notifications" onClick={() => setNotificationsOpen(true)}>
            <Bell size={18} />{(notif.data?.unreadCount ?? 0) > 0 && <span className="icon-btn__dot" />}
          </button>
          <Link to="/profile" className="avatar" aria-label="Profile">{user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : 'G'}</Link>
        </div>
      </header>

      <nav className="sidebar" aria-label="Main navigation">
        {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => isActive ? 'active' : ''}><n.icon size={18} />{n.label}</NavLink>)}
        <div className="eyebrow" style={{ margin: '22px 14px 8px' }}>Services</div>
        {SERVICES.map((s) => <NavLink key={s.to} to={s.to} className={({ isActive }) => isActive ? 'active' : ''}><s.icon size={17} />{s.label}</NavLink>)}
        <div style={{ marginTop: 'auto' }}>
          <NavLink to="/partner"><UserRound size={17} /> Partner mode</NavLink>
          <NavLink to="/credits"><Compass size={17} /> Image credits</NavLink>
        </div>
      </nav>

      <main className="main">{children}</main>

      <nav className="bottom-nav" aria-label="Bottom navigation">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}><Home size={20} /><span>Home</span></NavLink>
        <NavLink to="/categories" className={({ isActive }) => isActive ? 'active' : ''}><Store size={20} /><span>Categories</span></NavLink>
        <NavLink to="/orders" className={({ isActive }) => isActive ? 'active' : ''}><ShoppingBag size={20} /><span>Orders</span></NavLink>
        <NavLink to="/account" className={({ isActive }) => isActive ? 'active' : ''}><UserRound size={20} /><span>Account</span></NavLink>
        <NavLink to="/cart" className={({ isActive }) => isActive ? 'active' : ''} style={{ position: 'relative' }}>
          <ShoppingCart size={20} /><span>Cart</span>
          {cartItems > 0 && <span className="icon-btn__dot" style={{ top: 2, right: 'calc(50% - 22px)', width: 18, height: 18, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gw-accent)', color: 'var(--gw-accent-contrast)', fontWeight: 800, borderRadius: 999, position: 'absolute' }}>{cartItems > 99 ? '99+' : cartItems}</span>}
        </NavLink>
      </nav>

      {locationOpen && <div className="overlay" onClick={() => setLocationOpen(false)}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="between"><h3>Choose your current location</h3><button className="icon-btn" onClick={() => setLocationOpen(false)} aria-label="Close"><X size={17} /></button></div>
          <p className="small muted" style={{ marginTop: 4 }}>Saved to your active journey so you are not asked again.</p>
          <div className="list" style={{ marginTop: 16 }}>
            {catalogue.places.filter((p) => ['airport', 'stand', 'destination'].includes(p.kind ?? '')).slice(0, 12).map((p) => (
              <button key={p.id} className="list-row" style={{ textAlign: 'left', width: '100%' }} onClick={() => void choosePlace(p.id, p.name)}>
                <MapPin size={17} style={{ color: 'var(--gw-champagne)' }} /><span className="list-row__body"><span className="list-row__title">{p.name}</span><span className="list-row__sub">{p.address ?? p.locality}</span></span><ChevronRight size={16} />
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 12 }}>Geolocation requires permission and a configured provider. This build uses saved, published place coordinates.</p>
        </div>
      </div>}

      {searchOpen && <div className="overlay" onClick={() => setSearchOpen(false)}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="row" style={{ gap: 10 }}><Search size={19} /><input autoFocus className="input" placeholder="Search destinations, hotels, food, groceries, routes…" value={searchText} onChange={(e) => setSearchText(e.target.value)} /><button className="icon-btn" onClick={() => setSearchOpen(false)} aria-label="Close"><X size={17} /></button></div>
          {searchText.trim().length > 1 && <div className="list" style={{ marginTop: 14 }}>
            {search.isLoading && <p className="small muted">Searching…</p>}
            {search.data?.length === 0 && <p className="small muted">No matches in the seeded catalogue.</p>}
            {search.data?.slice(0, 12).map((hit) => (
              <button key={`${hit.kind}-${hit.id}`} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => openHit(hit.href)}>
                <span className="list-row__body"><span className="list-row__title">{hit.title}</span><span className="list-row__sub">{hit.subtitle}</span></span><span className="badge">{hit.kind.replace('_', ' ')}</span>
              </button>
            ))}
          </div>}
          {searchText.trim().length <= 1 && <div className="stack" style={{ marginTop: 16 }}>
            <div className="eyebrow">Popular searches</div>
            <div className="chips">{['Darjeeling', 'Mirik', 'Momos', 'Tea', 'Airport'].map((t) => <button key={t} className="chip" onClick={() => setSearchText(t)}>{t}</button>)}</div>
          </div>}
        </div>
      </div>}

      {notificationsOpen && <div className="overlay" onClick={() => setNotificationsOpen(false)}>
        <div className="drawer" onClick={(e) => e.stopPropagation()}>
          <div className="between"><h3>Notifications</h3><button className="icon-btn" onClick={() => setNotificationsOpen(false)} aria-label="Close"><X size={17} /></button></div>
          {!user && <p className="small muted" style={{ marginTop: 14 }}>Sign in to see your notifications.</p>}
          {user && <div className="stack" style={{ marginTop: 16 }}>
            <button className="btn btn--secondary btn--sm" onClick={async () => { await client.markAllNotificationsRead(); await qc.invalidateQueries({ queryKey: ['notifications'] }); }}>Mark all as read</button>
            {notif.data?.items.length === 0 && <p className="small muted">No notifications yet.</p>}
            {notif.data?.items.map((n) => (
              <button key={n.id} className={`card ${n.readAt ? '' : 'card--flat'}`} style={{ textAlign: 'left', width: '100%' }} onClick={async () => { await client.markNotificationRead(n.id); await qc.invalidateQueries({ queryKey: ['notifications'] }); }}>
                <div className="between"><strong className="small">{n.title}</strong>{!n.readAt && <span className="badge badge--accent">New</span>}</div>
                <p className="small muted" style={{ marginTop: 6 }}>{n.body}</p>
                <p className="tiny muted" style={{ marginTop: 8 }}>{new Date(n.createdAt).toLocaleString()}</p>
              </button>
            ))}
          </div>}
        </div>
      </div>}

      {toast && <div className={`toast toast--${toast.kind}`} role="status">{toast.message}</div>}
      {journey?.destinationId && <div className="journey-bar" style={{ position: 'fixed', bottom: 70, left: 16, right: 16, zIndex: 30, maxWidth: 420, margin: 0 }}>
        <span className="journey-bar__dot" /><div style={{ flex: 1 }}><div className="eyebrow">Active journey</div><div className="small">{journey.title} · {journey.travellers} traveller(s)</div></div>
        <Link className="btn btn--secondary btn--sm" to={`/journey/${journey.id}`}>Open</Link>
      </div>}
    </div>
  );
}
