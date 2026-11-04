import type { ReactNode } from 'react';
import type { ImageAsset, PriceBreakdown, BookingStatus } from '@gowayy/types';
import { formatINR } from '@gowayy/shared-utils';
import { STATUS_LABELS } from '@gowayy/booking-engine';

export function GSymbol({ size = 38, className = '' }: { size?: number; className?: string }) {
  return <img src="/brand/g-symbol.png" width={size} height={size} alt="GOWAYY" className={className} />;
}
export function Wordmark({ height = 20 }: { height?: number }) {
  return <img src="/brand/wordmark.png" style={{ height, width: 'auto' }} alt="GOWAYY" />;
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
          <img className="image-placeholder__mark" src="/brand/g-mono-inverse.png" alt="" />
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
      <div className="line"><span>Tax ({price.subtotalPaise ? Math.round(price.taxPaise / price.subtotalPaise * 100) : 0}%)</span><span>{formatINR(price.taxPaise)}</span></div>
      <div className="line total"><span>Total</span><span>{formatINR(price.totalPaise)}</span></div>
      <div className="tiny muted">Platform commission {formatINR(price.commissionPaise)} · settled separately. Estimate from a published rate card.</div>
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

export function DemoBanner({ children }: { children: ReactNode }) {
  return <div className="notice notice--demo"><strong>DEVELOPMENT MODE</strong> · {children}</div>;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="row small muted" role="status"><span className="anim-spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--gw-border)', borderTopColor: 'var(--gw-champagne)', borderRadius: '50%' }} />{label}</div>;
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
