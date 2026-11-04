/**
 * Shared API client for GOWAYY PARTNER (Android). Same GowayyClient contract
 * as the customer and explore apps — one backend, one auth, role-scoped ops.
 */
import { createGowayyClient } from '@gowayy/api-client';
import * as SecureStore from 'expo-secure-store';

const env = {
  VITE_API_BASE_URL: process.env.EXPO_PUBLIC_GOWAYY_API_BASE_URL,
  VITE_GOWAYY_BACKEND: process.env.EXPO_PUBLIC_GOWAYY_BACKEND,
  VITE_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
} as Record<string, string | undefined>;

const cache = new Map<string, string>();
export const tokenStore = {
  get(): string | null { return cache.get('token') ?? null; },
  set(t: string | null): void {
    if (t) { cache.set('token', t); void SecureStore.setItemAsync('gowayy.partner.token', t); }
    else { cache.delete('token'); void SecureStore.deleteItemAsync('gowayy.partner.token'); }
  },
};
export async function restoreToken(): Promise<string | null> {
  const t = await SecureStore.getItemAsync('gowayy.partner.token');
  if (t) cache.set('token', t);
  return t;
}

export const apiBaseUrl = env.VITE_API_BASE_URL ?? '/api';
export const client = createGowayyClient({ tokenStore, baseUrl: apiBaseUrl, env });
export const idemKey = (): string => `idem_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
