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
        <header className="topbar"><div className="topbar__inner"><div className="topbar__brand">{brand}</div><div className="topbar__slot">{rightSlot}</div></div></header>
        <main className="shell__main">{children}</main>
      </div>
      <nav className="bottom-nav" aria-label="Bottom navigation">
        {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>{n.icon && <n.icon size={20} />}<span>{n.label}</span></NavLink>)}
      </nav>
    </div>
  );
}

export function SplashScreen({ onDone, minMs = 1480 }: { onDone: () => void; minMs?: number }) {
  const finish = useRef(onDone);
  finish.current = onDone;
  useEffect(() => {
    const t = window.setTimeout(() => finish.current(), prefersReducedMotion() ? 180 : minMs);
    return () => window.clearTimeout(t);
  }, [minMs]);
  return <div className="splash-page" aria-hidden="true">
    <img className="splash-page__mark" src="/brand/g-symbol.svg" alt="" />
  </div>;
}

export function Mascot({ pose = 'idle-standing', size = 120 }: { pose?: string; size?: number }) {
  return <img src={`/mascot/kanchu-${pose}.svg`} width={size} height={size} alt="Kanchu, the GOWAYY monkey mascot" style={{ maxWidth: '100%', height: 'auto' }} />;
}

export function MascotEmpty({ pose, title, body, action }: { pose: string; title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state"><Mascot pose={pose} size={120} /><h3 style={{ marginTop: 10 }}>{title}</h3><p>{body}</p>{action && <div style={{ marginTop: 16 }}>{action}</div>}</div>;
}

/* ── Professional Skeleton primitives — content-aware, token-based, accessible ── */
export function Skeleton({ variant, style = {}, className = '' }: { variant?: 'text' | 'title' | 'subtitle' | 'avatar' | 'avatar-sm' | 'avatar-lg' | 'image' | 'image-16-9' | 'image-1-1' | 'banner' | 'btn' | 'btn-sm' | 'pill' | 'card'; style?: React.CSSProperties; className?: string }) {
  const cls = variant ? `skeleton skeleton--${variant}` : 'skeleton';
  return <div className={`${cls} ${className}`.trim()} style={style} aria-hidden="true" />;
}
export function SkeletonText({ lines = 1, gap = 8, widths, style = {} }: { lines?: number; gap?: number; widths?: (string | number)[]; style?: React.CSSProperties }) {
  return (
    <div className="sk-stack" style={{ gap, ...style }} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => {
        const w = widths?.[i] ?? (i === lines - 1 && lines > 1 ? '68%' : '100%');
        return <div key={i} className="skeleton skeleton--text" style={{ width: w }} />;
      })}
    </div>
  );
}
export function SkeletonMetricCard() {
  return (
    <div className="card" aria-hidden="true" style={{ gap: 14 }}>
      <div className="skeleton skeleton--subtitle" style={{ width: 84 }} />
      <div className="skeleton skeleton--title" style={{ width: 96, height: 26 }} />
      <div className="skeleton skeleton--text" style={{ width: '62%' }} />
    </div>
  );
}
export function SkeletonMetrics({ count = 4 }: { count?: number }) {
  return (
    <div className="grid-3" aria-hidden="true" aria-label="Loading metrics">
      {Array.from({ length: count }).map((_, i) => <SkeletonMetricCard key={i} />)}
    </div>
  );
}
export function SkeletonTableRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i}><div className="skeleton skeleton--text" style={{ width: i === 0 ? 120 : i === cols - 1 ? 72 : 88 }} /></td>
      ))}
    </tr>
  );
}
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card card--pad0" aria-hidden="true" aria-label="Loading table">
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead><tr>{Array.from({ length: cols }).map((_, i) => <th key={i}><div className="skeleton skeleton--text" style={{ width: 64 }} /></th>)}</tr></thead>
          <tbody>{Array.from({ length: rows }).map((_, i) => <SkeletonTableRow key={i} cols={cols} />)}</tbody>
        </table>
      </div>
    </div>
  );
}
export function SkeletonListRow() {
  return (
    <div className="sk-row" style={{ padding: '14px 6px', borderBottom: '1px solid var(--gw-border)' }} aria-hidden="true">
      <div className="skeleton skeleton--avatar" style={{ width: 42, height: 42 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="skeleton skeleton--text" style={{ width: '44%', height: 14 }} />
        <div className="skeleton skeleton--text" style={{ width: '68%', opacity: .65 }} />
      </div>
      <div className="skeleton skeleton--pill" style={{ width: 64 }} />
    </div>
  );
}
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card" aria-hidden="true" aria-label="Loading list">
      {Array.from({ length: rows }).map((_, i) => <SkeletonListRow key={i} />)}
    </div>
  );
}
export function SkeletonProductCard() {
  return (
    <article className="sk-card-skeleton" aria-hidden="true">
      <div className="skeleton" style={{ aspectRatio: '4/3', borderRadius: 0 }} />
      <div className="sk-card-skeleton__body">
        <div className="skeleton skeleton--text" style={{ width: '42%', height: 12 }} />
        <div className="skeleton skeleton--text" style={{ width: '88%' }} />
        <div className="skeleton skeleton--text" style={{ width: '64%' }} />
        <div className="sk-row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
          <div className="skeleton skeleton--title" style={{ width: 64, height: 16 }} />
          <div className="skeleton skeleton--btn-sm" style={{ width: 68 }} />
        </div>
      </div>
    </article>
  );
}
export function SkeletonStoreCard() {
  return (
    <article className="sk-card-skeleton" aria-hidden="true">
      <div className="skeleton" style={{ height: 76 }} />
      <div style={{ display: 'flex', gap: 10, padding: '12px 14px 4px', alignItems: 'center' }}>
        <div className="skeleton" style={{ width: 42, height: 42, borderRadius: 12 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="skeleton skeleton--text" style={{ width: '58%' }} />
          <div className="skeleton skeleton--text" style={{ width: '42%', height: 11 }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px' }}>
        <div className="skeleton skeleton--pill" style={{ width: 72, height: 22 }} />
        <div className="skeleton skeleton--pill" style={{ width: 64, height: 22 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'var(--gw-border)', borderTop: '1px solid var(--gw-border)' }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ background: 'var(--gw-surface)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div className="skeleton skeleton--image" style={{ height: 56 }} />
            <div className="skeleton skeleton--text" style={{ width: '84%' }} />
            <div className="skeleton skeleton--text" style={{ width: '44%', height: 12 }} />
          </div>
        ))}
      </div>
    </article>
  );
}
export function SkeletonOrderCard() {
  return (
    <div className="card" aria-hidden="true">
      <div className="between">
        <div className="skeleton skeleton--text" style={{ width: 132, height: 16 }} />
        <div className="skeleton skeleton--pill" style={{ width: 72 }} />
      </div>
      <div className="sk-stack" style={{ marginTop: 14 }}>
        <SkeletonListRow />
        <div className="sk-row" style={{ justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--gw-border)' }}>
          <div className="skeleton skeleton--text" style={{ width: 88 }} />
          <div className="skeleton skeleton--title" style={{ width: 86, height: 16 }} />
        </div>
      </div>
    </div>
  );
}
export function SkeletonProductGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="sk-grid-3" aria-hidden="true" aria-label="Loading products">
      {Array.from({ length: count }).map((_, i) => <SkeletonProductCard key={i} />)}
    </div>
  );
}
export function SkeletonStoreGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid-3" aria-hidden="true" aria-label="Loading stores">
      {Array.from({ length: count }).map((_, i) => <SkeletonStoreCard key={i} />)}
    </div>
  );
}
export function SkeletonHero() {
  return <div className="skeleton skeleton--banner" aria-hidden="true" aria-label="Loading banner" />;
}

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
export { PushPreferences, useBrowserPushRegistration } from './PushPreferences.tsx';
