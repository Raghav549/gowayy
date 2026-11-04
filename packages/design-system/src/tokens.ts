/**
 * Canonical GOWAYY brand tokens. Import `brand-tokens.json` is intentionally
 * avoided here so the exact same object works in Metro (React Native) and Vite.
 * The JSON mirror in assets/brand/brand-tokens.json is checked by a unit test.
 */
import raw from '../../../assets/brand/brand-tokens.json';

export const brandTokens = raw;
export type BrandTokens = typeof raw;
export const colours = raw.colour;
export const typography = raw.typography;
export const spacing = raw.spacing;
export const radius = raw.radius;
export const shadow = raw.shadow;
export const motion = raw.motion;

export type ThemeMode = 'light' | 'dark';
export const themes: Record<ThemeMode, typeof raw.colour.light> = {
  light: raw.colour.light,
  dark: raw.colour.dark,
};

/** CSS custom-property map for the web shell (applied on :root / [data-theme]). */
export function cssVariables(mode: ThemeMode): Record<string, string> {
  const c = raw.colour;
  const t = themes[mode];
  return {
    '--gw-ink': c.ink,
    '--gw-charcoal': c.ink,
    '--gw-graphite': c.ink,
    '--gw-warm-white': c.warmWhite,
    '--gw-soft-ivory': c.softIvory,
    '--gw-muted-silver': c.mutedSilver,
    '--gw-champagne': c.champagne,
    '--gw-champagne-light': c.champagneLight,
    '--gw-champagne-deep': c.champagneDeep,
    '--gw-success': c.success,
    '--gw-warning': c.warning,
    '--gw-danger': c.danger,
    '--gw-info': c.info,
    '--gw-bg': t.bg,
    '--gw-surface': t.surface,
    '--gw-surface-alt': t.surfaceAlt,
    '--gw-raised': t.raised,
    '--gw-text': t.text,
    '--gw-text-muted': t.textMuted,
    '--gw-border': t.border,
    '--gw-accent': t.accent,
    '--gw-accent-contrast': t.accentContrast,
    '--gw-shadow-sm': mode === 'light' ? raw.shadow.lightSm : raw.shadow.darkSm,
    '--gw-shadow-md': mode === 'light' ? raw.shadow.lightMd : raw.shadow.darkMd,
    '--gw-display': raw.typography.displayFamily,
    '--gw-body': raw.typography.bodyFamily,
    '--gw-mono': raw.typography.monoFamily,
    '--gw-motion-fast': `${raw.motion.fast}ms`,
    '--gw-motion-base': `${raw.motion.base}ms`,
    '--gw-motion-slow': `${raw.motion.slow}ms`,
    '--gw-easing': raw.motion.easing,
  };
}
