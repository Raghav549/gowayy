import type { ReactNode } from 'react';
import type { ImageAsset, PriceBreakdown, BookingStatus } from '@gowayy/types';
import { formatINR } from '@gowayy/shared-utils';
import { STATUS_LABELS } from '@gowayy/booking-engine';
import { Check } from 'lucide-react';

export function GSymbol({ size = 38, className = '' }: { size?: number; className?: string }) {
  return <img src="/brand/g-symbol.svg" width={size} height={size} alt="GOWAYY" className={className} />;
}
export function Wordmark({ height = 20 }: { height?: number }) {
  return <img src="/brand/wordmark.svg" style={{ height, width: 'auto' }} alt="GOWAYY" />;
}

export function ImageFrame({ asset, variant = '4-3', showCredit = false, className = '' }: {
  asset: ImageAsset; variant?: '4-3' | '16-9' | 'hero'; showCredit?: boolean; className?: string;
}) {
  return (
    <div className={`image-frame image-frame--${variant} ${className}`}>
      {asset.status === 'verified' && asset.assetPath ? (
        <>
          <img src={`/${asset.assetPath.replace(/^\//, '')}`} alt={asset.alt} loading="lazy" decoding="async" />
          {showCredit && asset.credit && (
            <div className="image-credit">
              {asset.credit}{asset.sourceUrl ? <> · <a href={asset.sourceUrl} target="_blank" rel="noreferrer noopener">source</a></> : null}
            </div>
          )}
        </>
      ) : (
        <div className="image-placeholder" role="img" aria-label={asset.alt}>
          <img className="image-placeholder__mark" src="/brand/g-mono-inverse.svg" alt="" />
          <div className="image-placeholder__text">Photograph unavailable</div>
          <div className="tiny muted" style={{ maxWidth: 260 }}>{asset.verificationNote ?? 'No verified licensed photograph available.'}</div>
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: BookingStatus | string }) {
  const good = ['confirmed', 'completed', 'delivered', 'captured', 'accepted'].includes(status);
  const bad = ['cancelled', 'failed', 'refunded'].includes(status);
  const warn = ['requested', 'awaiting_payment', 'requires_action', 'processing', 'preparing', 'out_for_delivery'].includes(status);
  const cls = good ? 'badge--success' : bad ? 'badge--danger' : warn ? 'badge--warning' : 'badge--accent';
  return <span className={`badge ${cls}`}>{(STATUS_LABELS as Record<string, string>)[status] ?? status.replace(/_/g, ' ')}</span>;
}

export function PriceLines({ price, title }: { price: PriceBreakdown; title?: string }) {
  return (
    <div className="price-lines">
      {title && <div className="eyebrow" style={{ marginBottom: 4 }}>{title}</div>}
      {price.lines.map((l, i) => <div className="line" key={`${l.label}-${i}`}><span>{l.label}</span><span>{formatINR(l.paise)}</span></div>)}
      <div className="line"><span>Tax</span><span>{formatINR(price.taxPaise)}</span></div>
      <div className="line total"><span>Total</span><span>{formatINR(price.totalPaise)}</span></div>

    </div>
  );
}

export function SectionHead({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="section__head">
      <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      {action}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state"><h3>{title}</h3><p className="small">{body}</p>{action && <div style={{ marginTop: 16 }}>{action}</div>}</div>;
}


/* Inline action spinner — ONLY for button/payment actions (kept per Part 4: legitimate progress indicators) */
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <span className="row small muted" role="status" aria-live="polite" aria-busy="true" style={{ display: 'inline-flex' }}><span className="anim-spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--gw-border)', borderTopColor: 'var(--gw-champagne)', borderRadius: '50%' }} />{label}</span>;
}

/* ── Professional content-aware Skeleton System — token-based, never layout-shift ── */
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
    <div className="card" aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="skeleton skeleton--subtitle" style={{ width: 84 }} />
      <div className="skeleton skeleton--title" style={{ width: 96, height: 26 }} />
      <div className="skeleton skeleton--text" style={{ width: '62%' }} />
    </div>
  );
}
export function SkeletonMetrics({ count = 4 }: { count?: number }) {
  return <div className="grid-3" aria-hidden="true" aria-label="Loading metrics">{Array.from({ length: count }).map((_, i) => <SkeletonMetricCard key={i} />)}</div>;
}
export function SkeletonTableRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => <td key={i}><div className="skeleton skeleton--text" style={{ width: i === 0 ? 120 : i === cols - 1 ? 72 : 88 }} /></td>)}
    </tr>
  );
}
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card card--pad0" aria-hidden="true" aria-label="Loading table">
      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse' as const }}>
          <thead><tr>{Array.from({ length: cols }).map((_, i) => <th key={i} style={{ padding: '10px 12px' }}><div className="skeleton skeleton--text" style={{ width: 64 }} /></th>)}</tr></thead>
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
  return <div className="card" aria-hidden="true" aria-label="Loading list">{Array.from({ length: rows }).map((_, i) => <SkeletonListRow key={i} />)}</div>;
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
  return <div className="sk-grid-3" aria-hidden="true" aria-label="Loading products">{Array.from({ length: count }).map((_, i) => <SkeletonProductCard key={i} />)}</div>;
}
export function SkeletonStoreGrid({ count = 3 }: { count?: number }) {
  return <div className="grid-3" aria-hidden="true" aria-label="Loading stores">{Array.from({ length: count }).map((_, i) => <SkeletonStoreCard key={i} />)}</div>;
}
export function SkeletonHero() { return <div className="skeleton skeleton--banner" aria-hidden="true" aria-label="Loading banner" />; }
export function SkeletonHome() {
  return (
    <div className="skeleton-section" aria-hidden="true" aria-label="Loading home">
      <div className="skeleton skeleton--banner" style={{ height: 168 }} />
      <div className="sk-row" style={{ gap: 8 }}>
        {Array.from({ length: 5 }).map((_, i) => <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}><div className="skeleton" style={{ width: 64, height: 64, borderRadius: 16 }} /><div className="skeleton skeleton--text" style={{ width: 52 }} /></div>)}
      </div>
      <div className="grid-2">
        {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 96, borderRadius: 16 }} />)}
      </div>
      <SkeletonStoreGrid count={3} />
    </div>
  );
}


export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {error ? <span className="error" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper" aria-label="Checkout progress">
      {steps.map((label, i) => (
        <li key={label} className={`stepper__item ${i === current ? 'stepper__item--active' : ''} ${i < current ? 'stepper__item--done' : ''}`} aria-current={i === current ? 'step' : undefined}>
          <span className="stepper__dot">{i < current ? <Check size={14} /> : i + 1}</span>
          <span className="stepper__label">{label}</span>
        </li>
      ))}
    </ol>
  );
}
