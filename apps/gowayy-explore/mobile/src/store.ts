import { create } from 'zustand';
import type { User } from '@gowayy/types';

interface SessionState { user: User | null; token: string | null; setSession: (u: User | null, t: string | null) => void; }
export const useSession = create<SessionState>((set) => ({
  user: null,
  token: null,
  setSession: (user, token) => set({ user, token }),
}));

interface UIState { toast: string | null; showToast: (m: string) => void; clearToast: () => void; }
export const useUI = create<UIState>((set) => ({
  toast: null,
  showToast: (m) => set({ toast: m }),
  clearToast: () => set({ toast: null }),
}));
