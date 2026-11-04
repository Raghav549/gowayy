import { create } from 'zustand';
import { applyTheme, resolveInitialTheme, type ThemeMode } from '@gowayy/design-system';
import { readStored, writeStored } from '../lib/client';

interface UIState {
  theme: ThemeMode;
  onboarded: boolean;
  splashDone: boolean;
  notificationsOpen: boolean;
  searchOpen: boolean;
  toast: { id: number; message: string; kind: 'info' | 'success' | 'error' } | null;
  setTheme: (t: ThemeMode) => void;
  setOnboarded: (v: boolean) => void;
  setSplashDone: (v: boolean) => void;
  setNotificationsOpen: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
  clearToast: () => void;
}

export const useUI = create<UIState>((set) => ({
  theme: resolveInitialTheme(),
  onboarded: readStored<boolean>('gowayy.onboarded', false),
  splashDone: readStored<boolean>('gowayy.splashSeen', false),
  notificationsOpen: false, searchOpen: false, toast: null,
  setTheme: (theme) => { applyTheme(theme); set({ theme }); },
  setOnboarded: (onboarded) => { writeStored('gowayy.onboarded', onboarded); set({ onboarded }); },
  setSplashDone: (splashDone) => { writeStored('gowayy.splashSeen', splashDone); set({ splashDone }); },
  setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  showToast: (message, kind = 'info') => set({ toast: { id: Date.now(), message, kind } }),
  clearToast: () => set({ toast: null }),
}));
