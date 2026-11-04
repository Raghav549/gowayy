import { create } from 'zustand';
import type { User } from '@gowayy/types';
import { client, tokenStore } from './lib/client';

interface SessionState {
  token: string | null;
  user: User | null;
  loading: boolean;
  hydrate: () => Promise<void>;
  setAuth: (user: User, token: string) => void;
  clear: () => void;
}
export const useSession = create<SessionState>((set) => ({
  token: tokenStore.get(), user: null, loading: Boolean(tokenStore.get()),
  hydrate: async () => {
    const token = tokenStore.get();
    if (!token) { set({ loading: false }); return; }
    try { set({ user: await client.me(), token, loading: false }); } catch { tokenStore.set(null); set({ user: null, token: null, loading: false }); }
  },
  setAuth: (user, token) => { tokenStore.set(token); set({ user, token, loading: false }); },
  clear: () => { tokenStore.set(null); set({ user: null, token: null, loading: false }); },
}));

interface UIState { toast: { id: number; message: string; kind: 'info' | 'success' | 'error' } | null; showToast: (m: string, k?: 'info' | 'success' | 'error') => void; clearToast: () => void }
export const useUI = create<UIState>((set) => ({
  toast: null,
  showToast: (message, kind = 'info') => set({ toast: { id: Date.now(), message, kind } }),
  clearToast: () => set({ toast: null }),
}));
