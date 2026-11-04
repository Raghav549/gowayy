/**
 * Shared web UI kit for the three GOWAYY applications (customer, partner,
 * explore). Apps keep their own screens and navigation; chrome and primitives
 * live here so the brand family stays consistent.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { cssVariables, prefersReducedMotion, type ThemeMode } from '@gowayy/design-system';
import { formatINR } from '@gowayy/shared-utils';
import './web.css';

export interface NavItem { to: string; label: string; icon?: React.ComponentType<{ size?: number | string }>; end?: boolean }

const ThemeCtx = createContext<{ theme: ThemeMode; setTheme: (t: ThemeMode) => void }>({ theme: 'dark', setTheme: () => undefined });
export const useThemeMode = () => useContext(ThemeCtx);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>('light');
  useEffect(() => {
    const vars = cssVariables(theme);
    for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('gowayy-theme', theme);
  }, [theme]);
  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function Brand({ symbol = '/brand/g-symbol.svg', wordmark = '/brand/wordmark.svg', size = 34, height = 17 }: { symbol?: string; wordmark?: string; size?: number; height?: number }) {
  return <Link to="/" className="brand" aria-label="Home"><img src={symbol} width={size} height={size} alt="" /><img src={wordmark} style={{ height, width: 'auto' }} alt="" /></Link>;
}

export function AppShell({ brand, nav, sections, children, rightSlot }: { brand: ReactNode; nav: NavItem[]; sections?: Array<{ title: string; items: NavItem[] }>; children: ReactNode; rightSlot?: ReactNode }) {
  return (
    <div className="shell">
      <aside className="shell__side">
        {brand}
        <nav aria-label="Primary" className="stack" style={{ gap: 2, marginTop: 18 }}>
          {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>{n.icon && <n.icon size={17} />}{n.label}</NavLink>)}
        </nav>
        {sections?.map((s) => (
          <div key={s.title}>
            <div className="eyebrow">{s.title}</div>
            <nav className="stack" style={{ gap: 2 }}>
              {s.items.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>{n.icon && <n.icon size={16} />}{n.label}</NavLink>)}
            </nav>
          </div>
        ))}
      </aside>
      <div>
        <header className="topbar"><div className="topbar__inner" style={{ justifyContent: 'flex-end' }}>{rightSlot}</div></header>
        <main className="shell__main">{children}</main>
      </div>
      <nav className="bottom-nav" aria-label="Bottom navigation">
        {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>{n.icon && <n.icon size={20} />}<span>{n.label}</span></NavLink>)}
      </nav>
    </div>
  );
}

export function SplashScreen({ appName = 'GOWAYY', onDone, minMs = 1480 }: { appName?: string; onDone: () => void; minMs?: number }) {
  const finish = useRef(onDone);
  finish.current = onDone;
  useEffect(() => {
    const t = window.setTimeout(() => finish.current(), prefersReducedMotion() ? 180 : minMs);
    return () => window.clearTimeout(t);
  }, [minMs]);
  return <div className="splash-page">
    <span className="splash-page__mark" aria-hidden="true">
      <img className="splash-page__purple" src="/brand/g-purple.svg" alt="" />
      <img className="splash-page__orange" src="/brand/g-orange.svg" alt="" />
    </span>
    <span className="splash-page__name" aria-live="polite">{appName}</span>
    <button className="splash-page__skip" type="button" onClick={() => finish.current()}>Skip intro</button>
  </div>;
}

export function Mascot({ pose = 'idle-standing', size = 120 }: { pose?: string; size?: number }) {
  return <img src={`/mascot/kanchu-${pose}.svg`} width={size} height={size} alt="Kanchu, the GOWAYY monkey mascot" style={{ maxWidth: '100%', height: 'auto' }} />;
}

export function MascotEmpty({ pose, title, body, action }: { pose: string; title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state"><Mascot pose={pose} size={120} /><h3 style={{ marginTop: 10 }}>{title}</h3><p>{body}</p>{action && <div style={{ marginTop: 16 }}>{action}</div>}</div>;
}

export function Skeleton({ style = {} }: { style?: React.CSSProperties }) { return <div className="skeleton" style={style} aria-hidden="true" />; }

export function SectionHead({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="section__head"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

export function Badge({ tone, children }: { tone?: 'accent' | 'success' | 'danger' | 'warning'; children: ReactNode }) {
  return <span className={`badge ${tone ? `badge--${tone}` : ''}`}>{children}</span>;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="row small muted" role="status"><span className="skeleton" style={{ width: 14, height: 14, borderRadius: '50%' }} />{label}</div>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state"><h3>{title}</h3><p>{body}</p>{action && <div style={{ marginTop: 16 }}>{action}</div>}</div>;
}

export function DemoNotice({ children }: { children: ReactNode }) {
  return <div className="notice notice--demo"><strong>DEVELOPMENT MODE</strong> · {children}</div>;
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="label">{label}</span>{children}{error ? <span className="error" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}</label>;
}

export function PriceLines({ lines, total }: { lines: Array<{ label: string; paise: number }>; total: number }) {
  return (
    <div className="price-lines">
      {lines.map((l, i) => <div className="line" key={`${l.label}-${i}`}><span>{l.label}</span><span>{formatINR(l.paise)}</span></div>)}
      <div className="line total"><span>Total</span><span>{formatINR(total)}</span></div>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="stat"><span className="stat__value">{value}</span><span className="stat__label">{label}</span></div>;
}

export { formatINR };
