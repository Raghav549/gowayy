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
      'app/_layout.tsx', 'app/index.tsx', 'app/onboarding.tsx', 'app/update.tsx',
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

  it('configures three isolated Android packages and native per-app update flows', () => {
    const apps = [
      ['customer', 'app.gowayy.customer', 'GOWAYY'],
      ['explore', 'app.gowayy.explore', 'GOWAYY EXPLORE'],
      ['partner', 'app.gowayy.partner', 'GOWAYY PARTNER'],
    ] as const;
    const packageIds = new Set<string>();
    for (const [slug, packageId, name] of apps) {
      const root = `apps/gowayy-${slug}/mobile`;
      const app = json<Record<string, any>>(`${root}/app.json`);
      expect(app.expo.name).toBe(name);
      expect(app.expo.android.package).toBe(packageId);
      expect(packageIds.has(packageId)).toBe(false);
      packageIds.add(packageId);
      expect(app.expo.android.versionCode).toBeGreaterThan(0);
      expect(app.expo.splash.image).toBe('./assets/branding/g-symbol.png');
      expect(app.expo.android.permissions).toContain('REQUEST_INSTALL_PACKAGES');
      expect(existsSync(join(root, 'assets/branding/g-symbol.png'))).toBe(true);
      expect(existsSync(join(root, 'assets/branding/splash-logo.png'))).toBe(false);
      expect(existsSync(join(root, 'assets/branding/splash-logo.svg'))).toBe(false);
      expect(existsSync(join(root, 'app/update.tsx'))).toBe(true);
      const updater = read(`${root}/src/lib/app-updates.ts`);
      expect(updater).toContain(`RELEASE_TAG_PREFIX = 'android-${slug}-'`);
      expect(updater).toContain(packageId);
      expect(updater).toContain('getInfoAsync(result.uri, { md5: true })');
      expect(updater).toContain('MANAGE_UNKNOWN_APP_SOURCES');
      expect(updater).toContain('application/vnd.android.package-archive');
      const updateScreen = read(`${root}/app/update.tsx`);
      expect(updateScreen).toContain('Release notes');
      expect(updateScreen).toContain('Install update');
      expect(updateScreen).toContain('never silent');
      expect(read(`${root}/app/_layout.tsx`)).toContain('checkForStartupUpdate');
    }
    expect(packageIds.size).toBe(3);
    const customer = json<Record<string, any>>('apps/gowayy-customer/mobile/app.json');
    expect(customer.expo.scheme).toBe('gowayy');
    expect(customer.expo.android.permissions).toContain('ACCESS_FINE_LOCATION');
    expect(customer.expo.android.permissions).toContain('POST_NOTIFICATIONS');
    expect(JSON.stringify(customer.expo.android.intentFilters)).toContain('gowayy.app');

    const androidWorkflow = read('.github/workflows/mobile-build.yml');
    expect(androidWorkflow).toContain('assembleRelease');
    expect(androidWorkflow).toContain('assembleDebug');
    expect(androidWorkflow).toContain('ANDROID_KEYSTORE_BASE64');
    expect(androidWorkflow).toContain('actions/upload-artifact@v4');
    expect(androidWorkflow).toContain('softprops/action-gh-release@v2');
    expect(androidWorkflow).not.toContain('eas build');
    expect(androidWorkflow).not.toContain('EXPO_TOKEN');
    expect(read('scripts/configure-android-signing.mjs')).toContain('signingConfigs.release');
  });

  it('only displays the approved symbol during each animated mobile splash', () => {
    for (const app of ['customer', 'explore', 'partner']) {
      const root = `apps/gowayy-${app}/mobile`;
      const config = json<Record<string, any>>(`${root}/app.json`);
      expect(config.expo.splash.image).toBe('./assets/branding/g-symbol.png');
      const screen = app === 'customer' ? read(`${root}/app/_layout.tsx`) : read(`${root}/app/index.tsx`);
      const splash = app === 'customer' ? screen.slice(screen.indexOf('export default function RootLayout'), screen.indexOf('const styles =')) : screen.slice(screen.indexOf("if(phase==='splash')"), screen.indexOf("if(phase==='onboarding')"));
      expect(splash).toContain("require('../assets/branding/g-symbol.png')");
      expect(splash).not.toMatch(/<Animated\.Text|<Text/);
      expect(splash).not.toMatch(/GOWAYY/);
      expect(splash).toContain('Animated');
    }
  });

  it('keeps browser splash fallbacks logo-only as well as native splash screens', () => {
    const customer = read('apps/gowayy-customer/web/src/components/Splash.tsx');
    const ui = read('packages/ui/src/index.tsx');
    const shared = ui.slice(ui.indexOf('export function SplashScreen'), ui.indexOf('export function Mascot'));
    expect(customer).toContain('/brand/g-symbol.svg');
    expect(shared).toContain('/brand/g-symbol.svg');
    for (const source of [customer, shared]) {
      expect(source).not.toMatch(/wordmark|caption|Skip intro|appName/);
    }
    expect(read('apps/gowayy-customer/web/src/App.tsx')).not.toContain('brand-splash__wordmark');
    expect(read('scripts/build-brand-assets.mjs')).not.toContain("join(images, 'splash-logo.png')");
    expect(read('scripts/rasterize-brand.mjs')).not.toContain("'assets/images/branding/splash-logo.png'");
  });

  it('uses a compatible, complete Expo dependency set', () => {
    for (const app of ['customer', 'explore', 'partner']) {
      const pkg = json<Record<string, any>>(`apps/gowayy-${app}/mobile/package.json`);
      const d = pkg.dependencies;
      expect(d.expo).toMatch(/^~57\./);
      expect(d['react-native']).toBe('0.86.3');
      for (const [name, version] of Object.entries(d)) {
        if (name.startsWith('expo-')) expect(version, `${app} ${name}`).toMatch(/^~57\./);
      }
    }
    const d = json<Record<string, any>>('apps/gowayy-customer/mobile/package.json').dependencies;
    for (const lib of ['expo-router', 'react-native-reanimated', 'react-native-gesture-handler', 'react-native-worklets',
      'expo-secure-store', 'expo-location', 'expo-notifications', 'expo-image',
      'zustand', '@tanstack/react-query', 'react-hook-form', 'zod']) expect(d[lib]).toBeTruthy();
    expect(d['expo-gl']).toBeUndefined();
    expect(d.three).toBeUndefined();
    // Expo SDK 57 bundles a compatible Reanimated/worklets pair and stays on Android API 36.
    expect(d['react-native-reanimated']).toBe('4.5.1');
    expect(d['react-native-worklets']).toBe('0.10.1');
    expect(read('apps/gowayy-customer/mobile/tsconfig.json')).toContain('"strict": true');
    expect(read('apps/gowayy-customer/mobile/metro.config.js')).toContain('watchFolders');
    const workflow = read('.github/workflows/mobile-build.yml');
    expect(workflow).toContain("platforms;android-36");
    expect(workflow).toContain("build-tools;36.0.0");
    expect(workflow).toContain("ndk;27.1.12297006");
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
    expect(deploy).toContain('scripts/verify-web-output.mjs');
    expect(deploy).toContain('index.html');
    const prep = read('scripts/prepare-vercel-output.mjs');
    expect(prep).toContain("version: 3");
    expect(prep).toContain("handle: 'filesystem'");
    for (const app of ['customer', 'partner', 'explore']) {
      const config = json<Record<string, any>>(`apps/gowayy-${app}/web/vercel.json`);
      expect(config.outputDirectory).toBe('dist');
      expect(config.framework).toBe('vite');
      expect(config.installCommand).toContain('cd ../../.. && npm ci');
      expect(config.buildCommand).toContain(`cd ../../.. && npm run build -w @gowayy/${app}-web`);
      expect(config.buildCommand).toContain(`apps/gowayy-${app}/web/dist`);
      expect(read('scripts/verify-web-output.mjs')).toContain('SPA fallback is configured');
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
