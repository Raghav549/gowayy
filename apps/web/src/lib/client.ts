import { createGowayyClient, createWebTokenStore } from '@gowayy/api-client';
import { safeParseJson } from '@gowayy/shared-utils';

export const tokenStore = createWebTokenStore();
export const client = createGowayyClient({ tokenStore, env: import.meta.env });

export function readStored<T>(key: string, fallback: T): T {
  try { return safeParseJson(window.localStorage.getItem(key), fallback); } catch { return fallback; }
}
export function writeStored(key: string, value: unknown): void {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}
export const idemKey = (): string => `idem_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
