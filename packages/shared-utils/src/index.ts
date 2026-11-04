/** Runtime-agnostic helpers: no Node built-ins, so the same code runs in Vite, Metro and Node. */

export const nowIso = (): string => new Date().toISOString();

interface CryptoLike {
  randomUUID?: () => string;
  getRandomValues?: (a: Uint8Array) => Uint8Array;
}
const webCrypto = (): CryptoLike | undefined => (globalThis as unknown as { crypto?: CryptoLike }).crypto;

export function makeId(prefix = 'gw'): string {
  const c = webCrypto();
  if (c?.randomUUID) return `${prefix}_${c.randomUUID()}`;
  if (c?.getRandomValues) {
    const a = new Uint8Array(16); c.getRandomValues(a);
    return `${prefix}_${Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function randomToken(bytes = 32): string {
  const c = webCrypto(); const a = new Uint8Array(bytes);
  if (c?.getRandomValues) c.getRandomValues(a);
  else for (let i = 0; i < bytes; i += 1) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Non-cryptographic FNV-1a hash for dedupe keys/display only. Server-side HMAC uses node:crypto. */
export function hashForDisplay(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function formatINR(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 === 0 ? 0 : 2 }).format(paise / 100);
}
export function formatDistance(km: number): string { return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`; }
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60); const m = Math.round(minutes % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
export function addDays(iso: string, days: number): string {
  const d = new Date(iso); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`); const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
export const slugify = (s: string): string => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function groupBy<T, K extends string>(items: T[], key: (t: T) => K): Record<K, T[]> {
  return items.reduce((acc, item) => { const k = key(item); (acc[k] ||= []).push(item); return acc; }, {} as Record<K, T[]>);
}
export const unique = <T>(items: T[]): T[] => Array.from(new Set(items));

export function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
export const titleCase = (s: string): string => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
