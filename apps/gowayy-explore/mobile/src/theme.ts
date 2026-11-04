/** Explore uses the shared GOWAYY lavender system with photography-led place cards. */
import { themes, typography } from '@gowayy/design-system';
export const ACCENT = '#421080';
export const ACCENT_SOFT = '#EDE3F7';
export const ACCENT_DEEP = '#310761';
export const colors: Record<string, string> = { ...themes.light, accent: ACCENT, accentSoft: ACCENT_SOFT, accentDeep: ACCENT_DEEP, accentContrast: '#FFFFFF' };
export type Palette = Record<string, string>;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { xs: 10, sm: 14, md: 20, lg: 26, xl: 32, pill: 999 };
export const font = { display: 800 as const, semibold: 600 as const, medium: 500 as const, regular: 400 as const, sizes: { xs: 12, sm: 14, base: 16, lg: 20, xl: 24, '2xl': 30 } };
export { typography };
