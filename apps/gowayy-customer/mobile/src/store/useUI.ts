import { create } from 'zustand';
import type { ThemeMode } from '@gowayy/types';
import { readStored, writeStored } from '../lib/storage';

interface UIState {
  theme: ThemeMode;
  onboarded: boolean;
  toast: string | null;
  reducedMotion: boolean;
  setTheme: (m: ThemeMode) => void;
  toggleTheme: () => void;
  setOnboarded: (v: boolean) => void;
  showToast: (message: string) => void;
  clearToast: () => void;
  setReducedMotion: (v: boolean) => void;
  rehydrate: () => void;
}

export const useUI = create<UIState>((set, get) => ({
  theme: (readStored<ThemeMode>('gowayy.theme', 'light') === 'light' ? 'light' : 'dark'),
  onboarded: readStored<boolean>('gowayy.onboarded', false),
  toast: null,
  reducedMotion: false,
  setTheme: (theme) => { set({ theme }); void writeStored('gowayy.theme', theme); },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setOnboarded: (onboarded) => { set({ onboarded }); void writeStored('gowayy.onboarded', onboarded); },
  showToast: (toast) => set({ toast }),
  clearToast: () => set({ toast: null }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  rehydrate: () => set({
    theme: readStored<ThemeMode>('gowayy.theme', 'light'),
      onboarded: readStored<boolean>('gowayy.onboarded', false),
  }),
}));
