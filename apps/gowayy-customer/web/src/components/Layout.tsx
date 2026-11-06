import { useCallback, useEffect, useState } from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Home, Compass, ClipboardList, ShoppingBag, UserRound, Search, Bell, MapPin, X,
  CarFront, BedDouble, UtensilsCrossed, ShoppingBasket, Mountain, Ticket, Package,
  Sparkles, ChevronRight, Store, ShoppingCart, LifeBuoy, Heart, LocateFixed, AlertTriangle,
} from 'lucide-react';
import { client } from '../lib/client';
import { catalogue } from '@gowayy/catalog';
import { useSession } from '../store/useSession';
import { useUI } from '../store/useUI';
import { useJourney } from '../store/useJourney';
import { GSymbol, Wordmark } from './ui';
import { checkPermission, loadSavedLocation, requestCurrentPosition, reverseLabel, saveLocation, tryExternalReverse, type WebLocation } from '../lib/location';

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
  const [locationExplainOpen, setLocationExplainOpen] = useState(false);
  const [savedLocation, setSavedLocation] = useState<WebLocation>(() => loadSavedLocation());
  const locationLabel = savedLocation.label;
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [permission, setPermission] = useState<string>('unknown');
  const notif = useQuery({ queryKey: ['notifications'], queryFn: () => client.notifications(), enabled: Boolean(user), refetchInterval: 30000 });
  const cart = useQuery({ queryKey: ['cart'], queryFn: () => client.cart(), enabled: Boolean(user), refetchInterval: 30000 });
  const cartItems = (cart.data as { itemCount?: number } | undefined)?.itemCount ?? 0;
  const journey = useJourney((s) => s.journey);
  const patchJourney = useJourney((s) => s.patch);

  useEffect(() => { if (toast) { const t = window.setTimeout(clearToast, 3800); return () => window.clearTimeout(t); } }, [toast, clearToast]);
  useEffect(() => { document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#F8F3FB'); }, []);

  const persistLocation = useCallback((loc: WebLocation) => {
    setSavedLocation(loc); saveLocation(loc);
  }, []);

  const choosePlace = async (id: string, name: string) => {
    persistLocation({ label: name, source: 'manual', updatedAt: new Date().toISOString() });
    setLocationOpen(false);
    if (user) { try { await patchJourney({ pickup: id }); } catch { /* keep local choice */ } }
  };

  const useCurrentLocation = useCallback(async () => {
    setLocating(true); setLocationError(null);
    try {
      const status = await checkPermission(); setPermission(status);
      if (status === 'denied') throw new Error('Location permission was denied. Enable it in your browser site settings (padlock → Site settings → Location → Allow) and retry, or choose a destination manually.');
      const pos = await requestCurrentPosition();
      const { latitude, longitude } = pos.coords;
      const external = await tryExternalReverse(latitude, longitude);
      const local = await reverseLabel(latitude, longitude);
      const label = external ?? local ?? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      const loc: WebLocation = { label, lat: latitude, lng: longitude, source: 'gps', updatedAt: new Date().toISOString() };
      persistLocation(loc);
      setLocationExplainOpen(false); setLocationOpen(false);
      try { await patchJourney({ pickup: `${latitude},${longitude}` } as unknown as { pickup: string }); } catch {}
    } catch (e) { setLocationError(e instanceof Error ? e.message : 'Could not get your location.'); }
    finally { setLocating(false); }
  }, [patchJourney, persistLocation]);

  useEffect(() => { void checkPermission().then(setPermission).catch(() => {}); }, []);

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
          <p className="small muted" style={{ marginTop: 4 }}>Used to rank nearby stays, restaurants and stores. Your location stays on this device and is not tracked in the background.</p>
          <div className="card card--flat" style={{ marginTop: 14, padding: 12 }}>
            <div className="between row--wrap"><span className="small"><strong>Current:</strong> {savedLocation.label}</span><span className="tiny muted">{savedLocation.source === 'gps' ? 'GPS' : savedLocation.source === 'manual' ? 'Chosen manually' : 'Default'}</span></div>
            {savedLocation.lat != null && <div className="tiny muted" style={{ marginTop: 4 }}>{savedLocation.lat.toFixed(4)}, {savedLocation.lng?.toFixed(4)} · updated {new Date(savedLocation.updatedAt).toLocaleString()}</div>}
            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn btn--primary btn--sm" disabled={locating} onClick={() => void useCurrentLocation()}><LocateFixed size={14} aria-hidden="true" /> {locating ? 'Locating…' : 'Use current location'}</button>
              <button className="btn btn--secondary btn--sm" onClick={() => setLocationExplainOpen(true)}>Why we ask</button>
            </div>
            {permission === 'denied' && <p className="tiny muted" style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}><AlertTriangle size={12} aria-hidden="true" /> Permission denied. Enable Location in browser site settings or pick a place below.</p>}
            {locationError && <div className="notice notice--info" role="alert" style={{ marginTop: 10 }}>{locationError}</div>}
          </div>
          <div className="list" style={{ marginTop: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Or choose a place</div>
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

      {locationExplainOpen && <div className="overlay" onClick={() => setLocationExplainOpen(false)}>
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Why GOWAYY needs your location" onClick={(e) => e.stopPropagation()}>
          <div className="between"><h3>Why GOWAYY needs your location</h3><button className="icon-btn" onClick={() => setLocationExplainOpen(false)} aria-label="Close"><X size={17} /></button></div>
          <ul className="small muted" style={{ marginTop: 12, paddingLeft: 18, display: 'grid', gap: 8 }}>
            <li>Show nearby hotels, restaurants, groceries, cabs and parcels with accurate travel times.</li>
            <li>Check PIN-code serviceability and delivery estimates before checkout.</li>
            <li>Pre-fill pickup for cab/parcel bookings and improve search relevance.</li>
          </ul>
          <p className="small muted" style={{ marginTop: 12 }}>We ask only once. Your coordinates stay on this device and with your journey context; we do not track you in the background. You can deny and choose a destination manually at any time.</p>
          <div className="row" style={{ gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" onClick={() => void useCurrentLocation()} disabled={locating}>{locating ? 'Requesting…' : 'Allow & use current location'}</button>
            <button className="btn btn--ghost" onClick={() => setLocationExplainOpen(false)}>Not now</button>
          </div>
          {locationError && <div className="notice notice--info" role="alert" style={{ marginTop: 12 }}>{locationError}</div>}
          <p className="tiny muted" style={{ marginTop: 12 }}>If you previously denied, enable Location in your browser: address bar padlock → Site settings → Location → Allow, then retry. GPS must be enabled on the device. To configure a real provider, set <code>VITE_GEOCODING_REVERSE_URL</code> and <code>VITE_GEOCODING_API_KEY</code> — without them GOWAYY uses the offline nearest-place fallback and never invents a location.</p>
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
