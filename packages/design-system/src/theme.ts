import { cssVariables, type ThemeMode } from './tokens.ts';

const STORAGE_KEY = 'gowayy.theme';

export function resolveInitialTheme(): ThemeMode {
  // GOWAYY now ships a single warm-lavender visual identity; do not inherit an
  // operating-system or stale local preference that could restore the old dark UI.
  return 'light';
}

export function applyTheme(mode: ThemeMode, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  for (const [key, value] of Object.entries(cssVariables(mode))) root.style.setProperty(key, value);
  try { window.localStorage.setItem(STORAGE_KEY, mode); } catch { /* private mode */ }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
