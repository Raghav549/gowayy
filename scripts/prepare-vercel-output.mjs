/** Assemble the Vercel Build Output API payload from one already-built Vite app. */
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const app = process.argv[2];
const apps = {
  customer: 'apps/gowayy-customer/web',
  partner: 'apps/gowayy-partner/web',
  explore: 'apps/gowayy-explore/web',
};
if (!Object.hasOwn(apps, app)) throw new Error('Usage: node scripts/prepare-vercel-output.mjs customer|partner|explore');
const webDir = resolve(apps[app]);
const dist = join(webDir, 'dist');
if (!statSync(dist, { throwIfNoEntry: false })?.isDirectory() || !readFileSync(join(dist, 'index.html'), 'utf8')) {
  throw new Error(`Vercel static output missing: ${dist}/index.html; run the app production build first.`);
}
const output = join(webDir, '.vercel/output');
rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, 'static'), { recursive: true });
cpSync(dist, join(output, 'static'), { recursive: true });
writeFileSync(join(output, 'config.json'), `${JSON.stringify({
  version: 3,
  routes: [
    {
      src: '/(.*)',
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
      continue: true,
    },
    { src: '^/sw\\.js$', headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }, continue: true },
    { src: '^/manifest\\.webmanifest$', headers: { 'Content-Type': 'application/manifest+json' }, continue: true },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' },
  ],
}, null, 2)}\n`);
console.log(`Prepared Vercel prebuilt output for ${app}: ${output}`);
