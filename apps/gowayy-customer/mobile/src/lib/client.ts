/**
 * Shared API client for the mobile app. Uses the same GowayyClient contract as web.
 * The base URL must be absolute on a physical device; the app never assumes localhost.
 */
import { createGowayyClient } from '@gowayy/api-client';
import { createSecureTokenStore } from './storage';

const env = {
  VITE_API_BASE_URL: process.env.EXPO_PUBLIC_GOWAYY_API_BASE_URL,
  VITE_GOWAYY_BACKEND: process.env.EXPO_PUBLIC_GOWAYY_BACKEND,
  VITE_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
} as Record<string, string | undefined>;

export const tokenStore = createSecureTokenStore();
export const apiBaseUrl = env.VITE_API_BASE_URL ?? '/api';
export const assetBaseUrl = process.env.EXPO_PUBLIC_GOWAYY_ASSET_BASE_URL ?? '';

export const client = createGowayyClient({ tokenStore, baseUrl: apiBaseUrl, env });

export const idemKey = (): string => `idem_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

/** Resolves a relative asset path from the API to a fetchable image URL. */
export function imageUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const base = assetBaseUrl || (apiBaseUrl.startsWith('http') ? apiBaseUrl.replace(/\/api\/?$/, '') : '');
  return `${base}/${path.replace(/^\//, '')}`;
}
