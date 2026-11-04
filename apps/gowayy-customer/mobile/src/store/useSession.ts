import { create } from 'zustand';
import type { User } from '@gowayy/types';
import { client, tokenStore } from '../lib/client';

interface SessionState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  setAuth: (user: User, token: string) => void;
  clear: () => void;
  setError: (e: string | null) => void;
  refresh: () => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  user: null, token: tokenStore.get(), loading: Boolean(tokenStore.get()), error: null,
  hydrate: async () => {
    const token = tokenStore.get();
    if (!token) { set({ loading: false, user: null, token: null }); return; }
    try { const user = await client.me(); set({ user, token, loading: false, error: null }); }
    catch { tokenStore.set(null); set({ user: null, token: null, loading: false }); }
  },
  setAuth: (user, token) => { tokenStore.set(token); set({ user, token, loading: false, error: null }); },
  clear: () => { tokenStore.set(null); set({ user: null, token: null, loading: false, error: null }); },
  setError: (error) => set({ error }),
  refresh: async () => { try { set({ user: await client.me() }); } catch { get().clear(); } },
}));
