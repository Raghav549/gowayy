/** Generate identical official GOWAYY marks with app-specific wordmarks and utility variants. */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'assets/brand/g-symbol.svg'), 'utf8');
const markPaths = [...source.matchAll(/<path\b[\s\S]*?\/>/g)].map((match) => match[0]);
const mark = `<g transform="translate(5 29) scale(.81)">${markPaths.join('')}</g>`;
if (markPaths.length < 2) throw new Error('Expected separate purple and orange paths in the master GOWAYY mark');
const splitMark = (path, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${label}"><title>${label}</title><g transform="translate(5 29) scale(.81)">${path}</g></svg>`;
const font = "'Manrope','Inter','Segoe UI',system-ui,sans-serif";
const apps = [
  { dir: 'apps/gowayy-customer/web/public', name: 'GOWAYY', tag: 'customer' },
  { dir: 'apps/gowayy-explore/web/public', name: 'GOWAYY EXPLORE', tag: 'explore' },
  { dir: 'apps/gowayy-partner/web/public', name: 'GOWAYY PARTNER', tag: 'partner' },
];
const symbol = (label = 'GOWAYY official purple and orange logo') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${label}"><title>${label}</title>${mark}</svg>`;
const wordmark = (app) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 120" role="img" aria-label="${app.name}"><title>${app.name}</title><text x="8" y="88" font-family="${font}" font-size="78" font-weight="800" letter-spacing="1" fill="#17131B">${app.name}</text></svg>`;
const lockup = (app) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1050 300" role="img" aria-label="${app.name}"><title>${app.name}</title><g transform="translate(16 24) scale(.45)">${mark}</g><text x="310" y="176" font-family="${font}" font-size="86" font-weight="800" fill="#17131B">${app.name}</text></svg>`;
const monochrome = (fill) => symbol().replaceAll('#421080', fill).replaceAll('#FFA500', fill).replace('GOWAYY official purple and orange logo','GOWAYY monochrome mark');
const icon = (app) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${app.name} app icon"><title>${app.name}</title><rect width="512" height="512" rx="112" fill="#EDE3F7"/><g transform="translate(11 39) scale(.79)">${mark}</g></svg>`;
const splash = (app) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" role="img" aria-label="${app.name} splash"><title>${app.name}</title><defs><radialGradient id="wash"><stop stop-color="#F0E5FA"/><stop offset="1" stop-color="#FFFCF8"/></radialGradient></defs><rect width="1080" height="1080" fill="url(#wash)"/><g transform="translate(250 170) scale(.94)">${mark}</g><text x="540" y="880" text-anchor="middle" font-family="${font}" font-size="54" font-weight="800" letter-spacing="2" fill="#17131B">${app.name}</text></svg>`;


const rootBrand = join(root, 'assets/brand');
mkdirSync(rootBrand, { recursive: true });
const rootApp = { name: 'GOWAYY' };
const rootFiles = {
  'g-symbol.svg': symbol(), 'g-shape.svg': symbol(),
  'g-purple.svg': splitMark(markPaths[0], 'GOWAYY purple mark'),
  'g-orange.svg': splitMark(markPaths[1], 'GOWAYY orange accent'),
  'wordmark.svg': wordmark(rootApp), 'lockup.svg': lockup(rootApp),
  'lockup-horizontal.svg': lockup(rootApp), 'splash-logo.svg': splash(rootApp),
  'android-icon-foreground.svg': symbol(),
  'android-monochrome-icon.svg': monochrome('#17131B'), 'g-mono.svg': monochrome('#17131B'),
  'g-mono-inverse.svg': monochrome('#FFFFFF'),
  'android-icon-background.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#EDE3F7"/></svg>',
};
for (const [name, data] of Object.entries(rootFiles)) writeFileSync(join(rootBrand, name), data);

for (const app of apps) {
  const web = join(root, app.dir, 'brand');
  const mobile = join(root, app.dir.replace('/web/public', '/mobile/assets/branding'));
  mkdirSync(web, { recursive: true }); mkdirSync(mobile, { recursive: true });
  const files = {
    'g-symbol.svg': symbol(), 'g-shape.svg': symbol(), 'g-purple.svg': splitMark(markPaths[0], 'GOWAYY purple mark'), 'g-orange.svg': splitMark(markPaths[1], 'GOWAYY orange accent'), 'wordmark.svg': wordmark(app),
    'lockup.svg': lockup(app), 'lockup-horizontal.svg': lockup(app), 'icon.svg': icon(app),
    'splash-logo.svg': splash(app), 'android-icon-foreground.svg': symbol(),
    'android-monochrome-icon.svg': monochrome('#17131B'), 'g-mono.svg': monochrome('#17131B'),
    'g-mono-inverse.svg': monochrome('#FFFFFF'),
    'android-icon-background.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#EDE3F7"/></svg>',
  };
  for (const [name, data] of Object.entries(files)) { writeFileSync(join(web, name), data); writeFileSync(join(mobile, name), data); }
  writeFileSync(join(web, 'app.json'), JSON.stringify({ name: app.name, tag: app.tag, logo: 'shared-official-gowayy-mark' }, null, 2) + '\n');
  const mascotSrc = join(root, 'assets/mascot'); const mascotDest = join(root, app.dir, 'mascot'); mkdirSync(mascotDest, { recursive: true });
  for (const file of ['kanchu-idle-standing.svg','kanchu-curious.svg','kanchu-thinking.svg','kanchu-welcoming.svg','kanchu-pointing.svg','kanchu-excited.svg','kanchu-waving.svg','kanchu-delivery.svg','kanchu-travel.svg','kanchu-loading.svg','kanchu-success.svg','kanchu-error-retry.svg']) if (existsSync(join(mascotSrc, file))) cpSync(join(mascotSrc, file), join(mascotDest, file));
  console.log(`official logo assets -> ${app.tag}`);
}
