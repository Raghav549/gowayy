import { create } from 'zustand';
import type { ThemeMode } from '@gowayy/types';
import { readStored, writeStored } from '../lib/storage';

interface UIState {
  theme: ThemeMode;
  splashSeen: boolean;
  onboarded: boolean;
  toast: string | null;
  reducedMotion: boolean;
  setTheme: (m: ThemeMode) => void;
  toggleTheme: () => void;
  setSplashSeen: (v: boolean) => void;
  setOnboarded: (v: boolean) => void;
  showToast: (message: string) => void;
  clearToast: () => void;
  setReducedMotion: (v: boolean) => void;
  rehydrate: () => void;
}

export const useUI = create<UIState>((set, get) => ({
  theme: (readStored<ThemeMode>('gowayy.theme', 'dark') === 'light' ? 'light' : 'dark'),
  splashSeen: readStored<boolean>('gowayy.splashSeen', false),
  onboarded: readStored<boolean>('gowayy.onboarded', false),
  toast: null,
  reducedMotion: false,
  setTheme: (theme) => { set({ theme }); void writeStored('gowayy.theme', theme); },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setSplashSeen: (splashSeen) => { set({ splashSeen }); void writeStored('gowayy.splashSeen', splashSeen); },
  setOnboarded: (onboarded) => { set({ onboarded }); void writeStored('gowayy.onboarded', onboarded); },
  showToast: (toast) => set({ toast }),
  clearToast: () => set({ toast: null }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  rehydrate: () => set({
    theme: readStored<ThemeMode>('gowayy.theme', 'dark'),
    splashSeen: readStored<boolean>('gowayy.splashSeen', false),
    onboarded: readStored<boolean>('gowayy.onboarded', false),
  }),
}));
