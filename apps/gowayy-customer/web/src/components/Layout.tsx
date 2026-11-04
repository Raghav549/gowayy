import { useEffect, useState } from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Home, Compass, ClipboardList, ShoppingBag, UserRound, Search, Bell, MapPin, X,
  CarFront, BedDouble, UtensilsCrossed, ShoppingBasket, Mountain, Ticket, Package,
  Sparkles, ChevronRight, Store, ShoppingCart, LifeBuoy, Heart,
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
  { to: '/categories', label: 'Shop', icon: Store },
  { to: '/cabs', label: 'Cabs', icon: CarFront },
  { to: '/hotels', label: 'Hotels & homestays', icon: BedDouble },
  { to: '/food', label: 'Food', icon: UtensilsCrossed },
  { to: '/groceries', label: 'Groceries', icon: ShoppingBasket },
  { to: '/explore', label: 'Tourism', icon: Mountain },
  { to: '/experiences', label: 'Experiences', icon: Sparkles },
  { to: '/packages', label: 'Packages', icon: Ticket },
  { to: '/parcels', label: 'Parcels', icon: Package },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const { setNotificationsOpen, notificationsOpen, toast, clearToast } = useUI();
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationLabel, setLocationLabel] = useState<string>('Darjeeling Himalaya');
  const notif = useQuery({ queryKey: ['notifications'], queryFn: () => client.notifications(), enabled: Boolean(user), refetchInterval: 30000 });
  const cart = useQuery({ queryKey: ['cart'], queryFn: () => client.cart(), enabled: Boolean(user), refetchInterval: 30000 });
  const cartItems = (cart.data as { itemCount?: number } | undefined)?.itemCount ?? 0;
  const journey = useJourney((s) => s.journey);
  const patchJourney = useJourney((s) => s.patch);

  useEffect(() => { if (toast) { const t = window.setTimeout(clearToast, 3800); return () => window.clearTimeout(t); } }, [toast, clearToast]);
  useEffect(() => { document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#FBF8F5'); }, []);

  const choosePlace = async (id: string, name: string) => {
    setLocationLabel(name); setLocationOpen(false);
    if (user) { try { await patchJourney({ pickup: id }); } catch { /* keep local choice */ } }
  };

  return (
    <div className="app-shell app-customer">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand" aria-label="GOWAYY home"><GSymbol size={36} /><span className="brand__word-wrap"><Wordmark height={17} /></span></Link>

          <button className="location-chip" onClick={() => setLocationOpen(true)} title="Change current location" aria-label={`Current location: ${locationLabel}. Change location`}>
            <MapPin size={15} aria-hidden="true" /><strong>{locationLabel}</strong><ChevronRight size={14} aria-hidden="true" />
          </button>

          <Link to="/search" className="search-trigger" aria-label="Search GOWAYY">
            <Search size={17} aria-hidden="true" /><span>Search destinations, stays, food, shops…</span>
          </Link>

          <div className="topbar__actions">
            <Link to="/cart" className="icon-btn cart-btn" aria-label={`Cart${cartItems ? `, ${cartItems} items` : ''}`}>
              <ShoppingCart size={18} aria-hidden="true" />
              {cartItems > 0 && <span className="icon-btn__count">{cartItems > 99 ? '99+' : cartItems}</span>}
            </Link>
            <button className="icon-btn" aria-label="Notifications" onClick={() => setNotificationsOpen(true)}>
              <Bell size={18} aria-hidden="true" />{(notif.data?.unreadCount ?? 0) > 0 && <span className="icon-btn__dot" />}
            </button>
            <Link to="/account" className="avatar" aria-label="Account">
              {user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : 'G'}
            </Link>
          </div>
        </div>
      </header>

      <nav className="sidebar" aria-label="Primary navigation">
        {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => isActive ? 'active' : ''}><n.icon size={18} aria-hidden="true" />{n.label}</NavLink>)}
        <div className="eyebrow sidebar__label">Services</div>
        {SERVICES.map((s) => <NavLink key={`${s.to}-${s.label}`} to={s.to} className={({ isActive }) => isActive ? 'active' : ''}><s.icon size={17} aria-hidden="true" />{s.label}</NavLink>)}
        <div className="sidebar__foot">
          <NavLink to="/account/wishlist"><Heart size={17} aria-hidden="true" /> Wishlist</NavLink>
          <NavLink to="/support"><LifeBuoy size={17} aria-hidden="true" /> Support</NavLink>
          <p className="tiny muted sidebar__note">GOWAYY · Darjeeling Himalaya</p>
        </div>
      </nav>

      <main className="main" id="main-content">{children}</main>

      <nav className="bottom-nav" aria-label="Bottom navigation">
        {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => isActive ? 'active' : ''}><n.icon size={20} aria-hidden="true" /><span>{n.label}</span></NavLink>)}
      </nav>

      {locationOpen && <div className="overlay" onClick={() => setLocationOpen(false)}>
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Choose your current location" onClick={(e) => e.stopPropagation()}>
          <div className="between"><h3>Choose your current location</h3><button className="icon-btn" onClick={() => setLocationOpen(false)} aria-label="Close"><X size={17} /></button></div>
          <p className="small muted" style={{ marginTop: 4 }}>Used to rank nearby stays, restaurants and stores.</p>
          <div className="list" style={{ marginTop: 16 }}>
            {catalogue.places.filter((p) => ['airport', 'stand', 'destination'].includes(p.kind ?? '')).slice(0, 12).map((p) => (
              <button key={p.id} className="list-row" style={{ textAlign: 'left', width: '100%' }} onClick={() => void choosePlace(p.id, p.name)}>
                <MapPin size={17} style={{ color: 'var(--gw-champagne)' }} aria-hidden="true" />
                <span className="list-row__body"><span className="list-row__title">{p.name}</span><span className="list-row__sub">{p.address ?? p.locality}</span></span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </div>}

      {notificationsOpen && <div className="overlay" onClick={() => setNotificationsOpen(false)}>
        <div className="drawer" role="dialog" aria-modal="true" aria-label="Notifications" onClick={(e) => e.stopPropagation()}>
          <div className="between"><h3>Notifications</h3><button className="icon-btn" onClick={() => setNotificationsOpen(false)} aria-label="Close"><X size={17} /></button></div>
          {!user && <p className="small muted" style={{ marginTop: 14 }}>Sign in to see your notifications.</p>}
          {user && <div className="stack" style={{ marginTop: 16 }}>
            <button className="btn btn--secondary btn--sm" onClick={async () => { await client.markAllNotificationsRead(); await qc.invalidateQueries({ queryKey: ['notifications'] }); }}>Mark all as read</button>
            {notif.data?.items.length === 0 && <p className="small muted">No notifications yet.</p>}
            {notif.data?.items.map((n) => (
              <button key={n.id} className={`card ${n.readAt ? '' : 'card--flat'}`} style={{ textAlign: 'left', width: '100%' }}
                onClick={() => { void client.markNotificationRead(n.id).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })); if (n.reference) navigate('/orders'); }}>
                <div className="between"><strong className="small">{n.title}</strong>{!n.readAt && <span className="badge badge--accent">New</span>}</div>
                <p className="small muted" style={{ marginTop: 6 }}>{n.body}</p>
                <p className="tiny muted" style={{ marginTop: 8 }}>{new Date(n.createdAt).toLocaleString()}</p>
              </button>
            ))}
          </div>}
        </div>
      </div>}

      {toast && <div className={`toast toast--${toast.kind}`} role="status">{toast.message}</div>}
      {journey?.destinationId && <div className="journey-bar">
        <span className="journey-bar__dot" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">Active journey</div>
          <div className="small journey-bar__title">{journey.title} · {journey.travellers} traveller{journey.travellers === 1 ? '' : 's'}</div>
        </div>
        <Link className="btn btn--secondary btn--sm" to={`/journey/${journey.id}`}>Open</Link>
      </div>}
    </div>
  );
}
