import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Home, CarFront, Inbox, Wallet, Settings, LayoutDashboard } from 'lucide-react';
import { AppShell, Brand, SplashScreen, ThemeProvider, useBrowserPushRegistration } from '@gowayy/ui';
import { client } from './lib/client';
import { useSession, useUI } from './store';
import { Login, Register } from './screens/Auth';
import { Onboarding } from './screens/Onboarding';
import { Home as PartnerHome } from './screens/Home';
import { DriverMode } from './screens/DriverMode';
import { Manage } from './screens/Manage';
import { Inbox as PartnerInbox } from './screens/Inbox';
import { Earnings } from './screens/Earnings';
import { Profile } from './screens/Profile';

const NAV = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/driver', label: 'Driver', icon: CarFront },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/earnings', label: 'Earnings', icon: Wallet },
  { to: '/manage', label: 'Manage', icon: Home },
  { to: '/profile', label: 'Profile', icon: Settings },
];

function Shell({ children }: { children: React.ReactNode }) {
  const user = useSession((s) => s.user);
  return (
    <AppShell
      brand={<Brand symbol="/brand/g-symbol.svg" wordmark="/brand/wordmark.svg" />}
      nav={NAV}
      rightSlot={<span className="small muted">{user?.firstName ?? ''}</span>}
    >{children}</AppShell>
  );
}

export default function App() {
  const [splash, setSplash] = useState(() => {
    try { return window.sessionStorage.getItem('gowayy.partner.splashSeen') !== 'true'; }
    catch { return true; }
  });
  const { loading } = useSession();
  const user = useSession((s) => s.user);
  useBrowserPushRegistration({ client, installationKey: 'gowayy.partner.push.installation', enabled: Boolean(user) });
  const toast = useUI((s) => s.toast);
  const clearToast = useUI((s) => s.clearToast);
  const location = useLocation();
  useEffect(() => { void useSession.getState().hydrate(); }, []);
  useEffect(() => { if (toast) { const t = window.setTimeout(clearToast, 3800); return () => window.clearTimeout(t); } }, [toast, clearToast]);

  if (splash) return <SplashScreen onDone={() => {
    try { window.sessionStorage.setItem('gowayy.partner.splashSeen', 'true'); } catch { /* storage may be unavailable */ }
    setSplash(false);
  }} />;
  const isAuth = location.pathname.startsWith('/auth/');
  if (loading) return <div className="splash-page"><img src="/brand/g-symbol.svg" alt="" aria-hidden="true" /></div>;
  if (isAuth) return <Routes><Route path="/auth/login" element={<Login />} /><Route path="/auth/register" element={<Register />} /><Route path="*" element={<Navigate to="/auth/login" replace />} /></Routes>;
  if (!user) return <Navigate to="/auth/login" replace />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<PartnerHome />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/driver" element={<DriverMode />} />
        <Route path="/inbox" element={<PartnerInbox />} />
        <Route path="/manage" element={<Manage />} />
        <Route path="/earnings" element={<Earnings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {toast && <div className={`toast toast--${toast.kind}`} role="status">{toast.message}</div>}
    </Shell>
  );
}

export function Root() {
  return <ThemeProvider><App /></ThemeProvider>;
}
