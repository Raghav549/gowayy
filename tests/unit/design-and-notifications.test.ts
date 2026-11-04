import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brandTokens, cssVariables, themes, applyTheme, resolveInitialTheme, prefersReducedMotion } from '@gowayy/design-system';
import { buildNotification, toNotification, deduplicate, shouldSendPush } from '@gowayy/notification-engine';
import type { Notification } from '@gowayy/types';

const root = process.cwd();

describe('brand identity and design system', () => {
  it('the TS token module mirrors the canonical JSON exactly', () => {
    const raw = JSON.parse(readFileSync(join(root, 'assets/brand/brand-tokens.json'), 'utf8'));
    expect(brandTokens).toEqual(raw);
  });

  it('is LIGHT-ONLY (v2): no dark surfaces anywhere, dark block mirrors light for compatibility', () => {
    expect(themes.light.text).toBeTruthy();
    expect(themes.dark.text).toBeTruthy();
    expect(themes.light.bg).toBe(themes.dark.bg); // v2 ships a single light system
    // every surface/background token must be light (high luminance, no dark hex)
    const lum = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    for (const key of ['bg', 'surface', 'surfaceAlt', 'raised'] as const) {
      expect(lum(themes.light[key])).toBeGreaterThan(0.75);
    }
    const light = cssVariables('light');
    const dark = cssVariables('dark');
    expect(light['--gw-bg']).toBe(dark['--gw-bg']);
    expect(light['--gw-champagne']).toBe(dark['--gw-champagne']);
    expect(Object.keys(cssVariables('dark')).length).toBeGreaterThan(20);
    // all three products share one master mark and the same purple primary identity
    expect(brandTokens.colour.apps.customer.accent).toBe(brandTokens.colour.apps.partner.accent);
    expect(brandTokens.colour.apps.partner.accent).toBe(brandTokens.colour.apps.explore.accent);
  });

  it('enforces the lavender-and-lilac palette and official shared purple/orange identity', () => {
    expect(brandTokens.restrictions.length).toBeGreaterThan(0);
    const c = brandTokens.colour;
    expect(c.purple).toBe('#421080');
    expect(c.champagne).toBe('#FFA500');
    expect(c.light.bg).toBe(c.dark.bg);
    expect(c.apps.customer.accent).toBe(c.apps.partner.accent);
    expect(c.apps.partner.accent).toBe(c.apps.explore.accent);
    expect(JSON.stringify(c)).not.toMatch(/cyan|neon|electric|metallic/i);
    const hexes = JSON.stringify(c).match(/#[0-9a-fA-F]{6}/g) ?? [];
    expect(hexes.length).toBeGreaterThan(20);
    expect(hexes).toContain('#EDE3F7');
    expect(hexes).toContain('#DCC7F2');
  });

  it('has a full typographic scale and restrained motion tokens', () => {
    expect(Object.keys(brandTokens.typography.scale).length).toBeGreaterThanOrEqual(8);
    expect(brandTokens.typography.displayFamily).toMatch(/Manrope/);
    expect(brandTokens.motion.splash).toBeLessThan(4000);
    expect(brandTokens.restrictions.length).toBeGreaterThan(0);
  });

  it('ships real logo/icon/splash assets, not placeholders', () => {
    for (const file of [
      'assets/brand/g-symbol.svg', 'assets/brand/wordmark.svg', 'assets/brand/lockup-horizontal.svg',
      'assets/brand/splash-logo.svg', 'assets/brand/g-mono.svg', 'assets/brand/g-mono-inverse.svg',
      'assets/brand/android-icon-foreground.svg', 'assets/brand/android-icon-background.svg',
      'assets/brand/android-monochrome-icon.svg',
      'apps/gowayy-customer/mobile/assets/branding/app-icon.png', 'apps/gowayy-customer/mobile/assets/branding/icon-foreground.png',
      'apps/gowayy-customer/mobile/assets/branding/icon-monochrome.png', 'apps/gowayy-customer/mobile/assets/branding/g-symbol.png',
    ]) {
      const stat = readFileSync(join(root, file));
      expect(stat.length).toBeGreaterThan(100);
    }
    const g = readFileSync(join(root, 'assets/brand/g-symbol.svg'), 'utf8');
    expect(g).toContain('<svg');
    expect(g.toLowerCase()).not.toContain('emoji');
    expect(g).toMatch(/<path|<polygon|<rect/);
  });

  it('applies a theme and reads reduced-motion preference', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--gw-bg')).toBeTruthy();
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(resolveInitialTheme()).toMatch(/light|dark/);
    expect(typeof prefersReducedMotion()).toBe('boolean');
  });
});

describe('notification engine', () => {
  const draft = buildNotification({ type: 'driver.assigned', reference: 'GW-B1001', driverName: 'Ravi', vehicle: 'Sedan' });

  it('builds human-readable, event-specific messages', () => {
    expect(draft.title).toMatch(/driver/i);
    expect(draft.body).toContain('Ravi');
    expect(draft.body).toContain('GW-B1001');
    expect(draft.dedupeKey).toContain('GW-B1001');
    expect(buildNotification({ type: 'payment.failed', reference: 'GW-B2', reason: 'declined' }).body).toContain('declined');
  });

  it('deduplicates replayed webhook events', () => {
    const a = toNotification('usr_1', draft);
    const b = toNotification('usr_1', draft);
    expect(deduplicate([], [a, b])).toHaveLength(1);
    expect(deduplicate([a], [b])).toHaveLength(0);
  });

  it('only pushes high-value events', () => {
    const push = (type: string): Notification => ({ ...toNotification('usr_1', draft), type });
    expect(shouldSendPush(push('driver.assigned'))).toBe(true);
    expect(shouldSendPush(push('payment.captured'))).toBe(false);
  });
});
