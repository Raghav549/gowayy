import type { TokenStore } from './http.ts';

const KEY = 'gowayy.session.token';

type NativeBridgeWindow = Window & { ReactNativeWebView?: { postMessage: (message: string) => void } };
function syncNativeBridge(token: string | null): void {
  // Only an enclosing GOWAYY React Native WebView exposes this object. Normal
  // browsers have no bridge, and no token is ever written to logs or URLs.
  (window as NativeBridgeWindow).ReactNativeWebView?.postMessage(JSON.stringify({ type: 'GOWAYY_AUTH_TOKEN', token }));
}

export function createWebTokenStore(): TokenStore {
  return {
    get: () => { try { return window.localStorage.getItem(KEY); } catch { return null; } },
    set: (token) => {
      try { if (token) window.localStorage.setItem(KEY, token); else window.localStorage.removeItem(KEY); } catch { /* ignore */ }
      syncNativeBridge(token);
    },
  };
}

/** Injectable memory store for React Native; pass a SecureStore-backed implementation in mobile. */
export function createMemoryTokenStore(initial: string | null = null): TokenStore {
  let value = initial;
  return { get: () => value, set: (token) => { value = token; } };
}
