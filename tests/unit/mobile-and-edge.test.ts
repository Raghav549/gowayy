import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const json = <T>(p: string) => JSON.parse(read(p)) as T;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

describe('Expo Android application', () => {
  it('has every required route file', () => {
    const routes = [
      'app/_layout.tsx', 'app/index.tsx', 'app/splash.tsx', 'app/onboarding.tsx',
      'app/auth/_layout.tsx', 'app/auth/login.tsx', 'app/auth/register.tsx', 'app/auth/forgot.tsx',
      'app/(tabs)/_layout.tsx', 'app/(tabs)/home.tsx', 'app/(tabs)/explore.tsx',
      'app/(tabs)/bookings.tsx', 'app/(tabs)/orders.tsx', 'app/(tabs)/profile.tsx',
      'app/cabs.tsx', 'app/hotels.tsx', 'app/food.tsx', 'app/groceries.tsx',
      'app/tourism.tsx', 'app/experiences.tsx', 'app/packages.tsx', 'app/parcels.tsx',
      'app/destinations/_layout.tsx', 'app/destinations/[slug].tsx',
      'app/journey/_layout.tsx', 'app/journey/index.tsx', 'app/journey/[id].tsx',
      'app/checkout.tsx', 'app/partner.tsx', 'app/credits.tsx', 'app/support.tsx', 'app/settings.tsx',
      'app/+not-found.tsx',
    ];
    for (const r of routes) expect(existsSync(join(root, 'apps/gowayy-customer/mobile', r)), `${r} missing`).toBe(true);
  });

  it('has a dedicated interface and navigation entry for all eight services', () => {
    for (const kind of ['cabs', 'hotels', 'food', 'groceries', 'tourism', 'experiences', 'packages', 'parcels']) {
      const src = read(`apps/gowayy-customer/mobile/app/${kind}.tsx`);
      expect(src).toContain('ServiceScreen');
      expect(src).toContain(`kind="${kind}"`);
      const home = read('apps/gowayy-customer/mobile/app/(tabs)/home.tsx');
      expect(home).toContain(`key: '${kind}'`);
      expect(home).toContain('router.push(`/${s.key}`)');
    }
  });

  it('configures Android delivery: package, icons, permissions, deep links and EAS profiles', () => {
    const app = json<Record<string, any>>('apps/gowayy-customer/mobile/app.json');
    expect(app.expo.name).toBe('GOWAYY');
    expect(app.expo.scheme).toBe('gowayy');
    expect(app.expo.android.package).toBe('app.gowayy.customer');
    expect(app.expo.android.adaptiveIcon.foregroundImage).toBeTruthy();
    expect(app.expo.android.adaptiveIcon.monochromeImage).toBeTruthy();
    expect(app.expo.android.permissions).toContain('ACCESS_FINE_LOCATION');
    expect(app.expo.android.permissions).toContain('POST_NOTIFICATIONS');
    expect(JSON.stringify(app.expo.android.intentFilters)).toContain('gowayy.app');
    for (const asset of ['app-icon.png', 'icon-foreground.png', 'icon-background.png', 'icon-monochrome.png', 'splash-logo.png', 'g-symbol.png', 'g-purple.png', 'g-orange.png']) {
      expect(existsSync(join(root, 'apps/gowayy-customer/mobile/assets/branding', asset)), asset).toBe(true);
    }
    for (const asset of ['groceries.webp', 'local-cab.webp', 'hotel-stay.webp', 'himalayan-discovery.webp', 'local-experience.webp',
      'groceries-animated.webp', 'local-cab-animated.webp', 'hotel-stay-animated.webp', 'himalayan-discovery-animated.webp', 'local-experience-animated.webp']) {
      expect(existsSync(join(root, 'assets/onboarding', asset)), asset).toBe(true);
      expect(existsSync(join(root, 'apps/gowayy-customer/mobile/assets/onboarding', asset)), asset).toBe(true);
      expect(existsSync(join(root, 'apps/gowayy-customer/web/public/images/onboarding', asset)), asset).toBe(true);
    }
    const androidWorkflow = read('.github/workflows/mobile-build.yml');
    expect(androidWorkflow).toContain('--profile preview');
    expect(androidWorkflow).toContain('Verify this app is linked to a real EAS project');
    expect(androidWorkflow).toContain('eas build:download --build-id');
    expect(androidWorkflow).toContain('gowayy-${{ matrix.app }}-android-apk');
    expect(androidWorkflow).toContain('actions/upload-artifact@v4');
    const eas = json<Record<string, any>>('apps/gowayy-customer/mobile/eas.json');
    expect(eas.build.development.android.buildType).toBe('apk');
    expect(eas.build.preview.android.buildType).toBe('apk');
    expect(eas.build.production.android.buildType).toBe('app-bundle');
  });

  it('uses a compatible, complete Expo dependency set', () => {
    const pkg = json<Record<string, any>>('apps/gowayy-customer/mobile/package.json');
    const d = pkg.dependencies;
    expect(d['expo']).toMatch(/^~58\./);
    for (const lib of ['expo-router', 'react-native-reanimated', 'react-native-gesture-handler', 'react-native-worklets',
      'expo-secure-store', 'expo-location', 'expo-notifications', 'expo-image',
      'zustand', '@tanstack/react-query', 'react-hook-form', 'zod']) expect(d[lib]).toBeTruthy();
    expect(d['expo-gl']).toBeUndefined();
    expect(d.three).toBeUndefined();
    // Reanimated 4.7.1 requires worklets 0.13.x (an earlier pin of 0.7.1 broke npm resolution).
    expect(d['react-native-reanimated']).toBe('4.7.1');
    expect(d['react-native-worklets']).toMatch(/^0\.13\./);
    expect(read('apps/gowayy-customer/mobile/tsconfig.json')).toContain('"strict": true');
    expect(read('apps/gowayy-customer/mobile/metro.config.js')).toContain('watchFolders');
  });

  it('never embeds a service-role key or admin interface in client code', () => {
    const clientFiles = [
      ...walk('apps/gowayy-customer/web/src'), ...walk('apps/gowayy-customer/mobile/app'), ...walk('apps/gowayy-customer/mobile/src'),
      ...walk('packages/api-client/src'),
    ].filter((f) => /\.(ts|tsx|js|mjs)$/.test(f));
    for (const f of clientFiles) {
      const src = read(f);
      expect(src.includes('SUPABASE_SERVICE_ROLE_KEY'), `${f} references a service-role key`).toBe(false);
      expect(src.toLowerCase()).not.toContain('admin dashboard');
      expect(src.toLowerCase()).not.toContain('admin panel interface');
    }
    expect(clientFiles.some((f) => /admin/i.test(f))).toBe(false);
  });
});

describe('Vercel static deployment', () => {
  it('prepares Build Output API payloads instead of relying on nested Vite dist discovery', () => {
    const deploy = read('.github/workflows/deploy-web.yml');
    expect(deploy).toContain('vercel@latest deploy --prebuilt --prod');
    expect(deploy).toContain('dist/index.html');
    const prep = read('scripts/prepare-vercel-output.mjs');
    expect(prep).toContain("version: 3");
    expect(prep).toContain("handle: 'filesystem'");
    for (const app of ['customer', 'partner', 'explore']) {
      const config = json<Record<string, any>>(`apps/gowayy-${app}/web/vercel.json`);
      expect(config.outputDirectory).toBe('dist');
      expect(config.buildCommand).toContain(`apps/gowayy-${app}/web/dist`);
    }
  });
});

describe('Supabase Edge Functions', () => {
  it('ships a gateway, a verified webhook and shared helpers with strict Deno config', () => {
    for (const f of ['supabase/functions/gowayy-api/index.ts', 'supabase/functions/payment-webhook/index.ts',
      'supabase/functions/_shared/config.ts', 'supabase/functions/_shared/supabase.ts',
      'supabase/functions/_shared/normalize.ts', 'supabase/functions/_shared/validation.ts',
      'supabase/functions/deno.json', 'supabase/config.toml']) {
      expect(existsSync(join(root, f)), f).toBe(true);
    }
    expect(json<Record<string, any>>('supabase/functions/deno.json').compilerOptions.strict).toBe(true);
    const gateway = read('supabase/functions/gowayy-api/index.ts');
    expect(read('supabase/functions/_shared/supabase.ts')).toContain('/auth/v1/user');
    expect(gateway).toContain('requireCaller');
    expect(gateway).toContain('serviceRpc');
    const webhook = read('supabase/functions/payment-webhook/index.ts');
    expect(webhook).toContain('HMAC');
    expect(webhook).toContain('timingSafeEqual');
    expect(webhook).toContain('signatureVerified: true');
  });

  it('implements every operation the Supabase transport calls', () => {
    const transport = read('packages/api-client/src/supabase.ts');
    const gateway = read('supabase/functions/gowayy-api/index.ts');
    const patterns = [
      /call<[^>]*>\('([A-Za-z]+)'/g,
      /\bop<[^>]*>\('([A-Za-z]+)'/g,
      /withId<[^>]*>\('([A-Za-z]+)'/g,
      /withInput<[^>]*>\('([A-Za-z]+)'/g,
    ];
    const ops = new Set<string>();
    for (const re of patterns) for (const m of transport.matchAll(re)) ops.add(m[1]);
    expect(ops.size).toBeGreaterThan(55);
    const handlers = new Set(Array.from(gateway.matchAll(/^  ([A-Za-z]+):/gm), (m) => m[1]));
    for (const op of ops) expect(handlers.has(op), `gateway is missing handler for ${op}`).toBe(true);
    expect(transport).not.toContain('SUPABASE_NOT_IMPLEMENTED');
  });
});

describe('documentation and scripts', () => {
  it('documents licensing, setup, architecture, security, backup, testing and phase results', () => {
    for (const d of ['LICENSING.md', 'SETUP.md', 'ARCHITECTURE.md', 'API.md', 'SECURITY.md', 'BACKUP.md', 'TESTING.md', 'PHASES.md', 'IMAGE_RESEARCH.md']) {
      expect(existsSync(join(root, 'docs', d)), d).toBe(true);
      expect(read(`docs/${d}`).length).toBeGreaterThan(400);
    }
    expect(read('docs/LICENSING.md')).toContain('CC BY');
    expect(read('docs/PHASES.md')).toContain('Not verified');
  });

  it('exposes root scripts for every verification layer', () => {
    const scripts = json<Record<string, any>>('package.json').scripts;
    for (const s of ['typecheck', 'typecheck:mobile', 'test', 'test:integration', 'test:supabase',
      'test:edge', 'scan:secrets', 'seed:supabase', 'bundle:mobile:web', 'bundle:mobile:android', 'build', 'verify']) {
      expect(scripts[s], s).toBeTruthy();
    }
    expect(scripts.verify).toContain('test:supabase');
    expect(scripts.verify).toContain('scan:secrets');
    expect(scripts.verify).toContain('typecheck:mobile');
  });
});
