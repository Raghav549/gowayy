import { type ReactNode, useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function Card({ children, className = '', title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && <header className="card__head">{title && <h2>{title}</h2>}{action}</header>}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = 'default' }: { label: string; value: ReactNode; hint?: string; tone?: 'default' | 'gold' | 'dark' }) {
  return (
    <div className={`stat stat--${tone}`}>
      <span className="stat__label">{label}</span>
      <strong className="stat__value">{value}</strong>
      {hint && <span className="stat__hint">{hint}</span>}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'gold' }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export interface Column<T> { key: string; header: string; render: (row: T) => ReactNode; width?: string }

export function DataTable<T extends { id?: string }>({ rows, columns, empty = 'Nothing to show yet.', loading }: { rows: T[]; columns: Array<Column<T>>; empty?: string; loading?: boolean }) {
  if (loading) return (
    <div className="table-wrap" aria-hidden="true" aria-label="Loading table">
      <table className="table"><thead><tr>{columns.map((c) => <th key={c.key}><div className="skeleton skeleton--text" style={{ width: 64 }} /></th>)}</tr></thead>
        <tbody>{Array.from({ length: 5 }).map((_, r) => <tr key={r}>{columns.map((c) => <td key={c.key}><div className="skeleton skeleton--text" style={{ width: r === 2 && c.key === columns[0]?.key ? 120 : 78 }} /></td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  if (!rows.length) return <p className="empty">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>{columns.map((c) => <th key={c.key} style={c.width ? { width: c.width } : undefined}>{c.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i}>{columns.map((c) => <td key={c.key}>{c.render(row)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal__head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button></header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function ToastHost({ toast, onDone }: { toast: { id: number; message: string; kind: string } | null; onDone: () => void }) {
  useEffect(() => { if (!toast) return; const t = window.setTimeout(onDone, 3800); return () => window.clearTimeout(t); }, [toast, onDone]);
  if (!toast) return null;
  return <div className={`toast toast--${toast.kind}`} role="status">{toast.message}</div>;
}

export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => { try { const raw = window.localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : initial; } catch { return initial; } });
  useEffect(() => { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } }, [key, value]);
  return [value, setValue] as const;
}
