import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, SplashScreen } from '@gowayy/ui';
import { useSession, useUI } from './store';
import { ExploreHome, Shell } from './screens/Home';
import { DestinationDetail } from './screens/DestinationDetail';
import { Destinations, Search, Saved } from './screens/Misc';

function App() {
  const [splash, setSplash] = useState(true);
  const toast = useUI((s) => s.toast);
  const clearToast = useUI((s) => s.clearToast);
  useEffect(() => { void useSession.getState().hydrate(); }, []);
  useEffect(() => { if (toast) { const t = window.setTimeout(clearToast, 3800); return () => window.clearTimeout(t); } }, [toast, clearToast]);
  if (splash) return <SplashScreen onDone={() => setSplash(false)} />;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<ExploreHome />} />
        <Route path="/destinations" element={<Destinations />} />
        <Route path="/destinations/:slug" element={<DestinationDetail />} />
        <Route path="/search" element={<Search />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {toast && <div className={`toast toast--${toast.kind}`} role="status">{toast.message}</div>}
    </Shell>
  );
}

export default function Root() {
  return <ThemeProvider><App /></ThemeProvider>;
}
