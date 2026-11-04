import { create } from 'zustand';
import type { User } from '@gowayy/types';
import { client, tokenStore } from './lib/client';

interface SessionState {
  user: User | null;
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  setAuth: (user: User, token: string) => void;
  clear: () => void;
}

const isAdmin = (user: User) => user.roles.includes('admin');

export const useSession = create<SessionState>((set) => ({
  user: null,
  loading: Boolean(tokenStore.get()),
  error: null,
  hydrate: async () => {
    const token = tokenStore.get();
    if (!token) { set({ loading: false }); return; }
    try {
      const user = await client.me();
      if (!isAdmin(user)) { tokenStore.set(null); set({ user: null, loading: false, error: 'This account does not have admin access.' }); return; }
      set({ user, loading: false });
    } catch {
      tokenStore.set(null); set({ user: null, loading: false });
    }
  },
  setAuth: (user, token) => {
    if (!isAdmin(user)) { set({ error: 'This account does not have admin access.' }); return; }
    tokenStore.set(token); set({ user, loading: false, error: null });
  },
  clear: () => { tokenStore.set(null); set({ user: null, loading: false }); },
}));

export interface Toast { id: number; message: string; kind: 'info' | 'success' | 'error' }
interface UIState { toast: Toast | null; showToast: (message: string, kind?: Toast['kind']) => void; clearToast: () => void }
export const useUI = create<UIState>((set) => ({
  toast: null,
  showToast: (message, kind = 'info') => set({ toast: { id: Date.now(), message, kind } }),
  clearToast: () => set({ toast: null }),
}));
