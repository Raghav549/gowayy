/** Shared GOWAYY design tokens adapted for React Native (same source as the web app). */
import { themes, typography } from '@gowayy/design-system';
import type { ThemeMode } from '@gowayy/types';
import { useUI } from './store/useUI';

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, hero: 48 };
export const radius = { xs: 4, sm: 8, md: 12, lg: 16, pill: 999 };
export const font = {
  display: 800 as const, semibold: 600 as const, medium: 500 as const, regular: 400 as const,
  sizes: { xs: 12, sm: 14, base: 16, lg: 20, xl: 24, '2xl': 30, '3xl': 38 },
};

export type Palette = typeof themes.light;
export const colors = themes.light;
export function palette(mode: ThemeMode): Palette { return themes[mode]; }

export function useTheme(): { mode: ThemeMode; c: Palette } {
  const mode = useUI((s) => s.theme);
  return { mode, c: palette(mode) };
}

export { typography };
