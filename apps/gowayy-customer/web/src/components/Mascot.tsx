import type { ReactNode } from 'react';

/** Kanchu the monkey — strategic use only (empty/loading/confirmation states). */
export function Mascot({ pose = 'idle-standing', size = 120, label }: { pose?: string; size?: number; label?: string }) {
  return (
    <img
      src={`/mascot/kanchu-${pose}.svg`}
      width={size}
      height={size}
      alt={label ?? 'Kanchu, the GOWAYY monkey mascot'}
      loading="lazy"
      style={{ maxWidth: '100%', height: 'auto' }}
    />
  );
}

export function MascotState({ pose, title, body, action }: { pose: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state" style={{ paddingTop: 8 }}>
      <Mascot pose={pose} size={132} />
      <h3 style={{ marginTop: 10 }}>{title}</h3>
      <p className="small">{body}</p>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

// ---- skeleton loading states (screenshot pattern: grey blocks, no spinner-only) ----
export function Skeleton({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}
export function ProductCardSkeleton() {
  return (
    <div className="card card--pad0" aria-hidden="true">
      <Skeleton style={{ aspectRatio: '4/3', borderRadius: 0 }} />
      <div style={{ padding: 14 }}><Skeleton style={{ height: 16, width: '70%' }} /><Skeleton style={{ height: 12, width: '45%', marginTop: 8 }} /><Skeleton style={{ height: 14, width: '30%', marginTop: 10 }} /></div>
    </div>
  );
}
export function PageSkeleton() {
  return (
    <div className="stack" aria-hidden="true">
      <Skeleton style={{ height: 44, borderRadius: 12 }} />
      <Skeleton style={{ height: 18, width: '40%' }} />
      <Skeleton style={{ height: 220, borderRadius: 16 }} />
      <div className="grid-3"><ProductCardSkeleton /><ProductCardSkeleton /><ProductCardSkeleton /></div>
    </div>
  );
}
