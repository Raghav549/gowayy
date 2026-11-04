import type { TokenStore } from './http.ts';

const KEY = 'gowayy.session.token';

export function createWebTokenStore(): TokenStore {
  return {
    get: () => { try { return window.localStorage.getItem(KEY); } catch { return null; } },
    set: (token) => { try { if (token) window.localStorage.setItem(KEY, token); else window.localStorage.removeItem(KEY); } catch { /* ignore */ } },
  };
}

/** Injectable memory store for React Native; pass a SecureStore-backed implementation in mobile. */
export function createMemoryTokenStore(initial: string | null = null): TokenStore {
  let value = initial;
  return { get: () => value, set: (token) => { value = token; } };
}
