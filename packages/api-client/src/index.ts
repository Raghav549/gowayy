export * from './http.ts';
export * from './token-store.ts';
export * from './supabase.ts';

import { createHttpTransport, type GowayyClient, type TokenStore } from './http.ts';
import { createSupabaseTransport } from './supabase.ts';

export interface ClientOptions {
  tokenStore: TokenStore;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

/** Picks the available backend. Never falls back silently to a fake backend. */
export function createGowayyClient(options: ClientOptions): GowayyClient {
  const env = options.env ?? (typeof import.meta !== 'undefined' ? ((import.meta as { env?: Record<string, string | undefined> }).env ?? {}) : {});
  if (env.VITE_GOWAYY_BACKEND === 'supabase') {
    return createSupabaseTransport({ url: env.VITE_SUPABASE_URL ?? '', anonKey: env.VITE_SUPABASE_ANON_KEY ?? '', tokenStore: options.tokenStore });
  }
  return createHttpTransport({ baseUrl: options.baseUrl ?? env.VITE_API_BASE_URL, tokenStore: options.tokenStore, fetchImpl: options.fetchImpl, demoMode: env.VITE_GOWAYY_BACKEND !== 'production' });
}
