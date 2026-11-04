/**
 * Builds per-application brand assets for the three GOWAYY apps.
 * One shared G symbol family; each app gets a distinct accent mark, wordmark,
 * lockup, splash logo and adaptive icon — plus the Kanchu mascot poses.
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseSymbol = readFileSync(join(root, 'assets/brand/g-symbol.svg'), 'utf8');

const APPS = [
  {
    dir: 'apps/gowayy-customer/web/public',
    name: 'GOWAYY', tag: 'customer', accent: '#C9A86A',
    mark: `<circle cx="432" cy="80" r="26" fill="none" stroke="#C9A86A" stroke-width="10"/><circle cx="432" cy="80" r="8" fill="#C9A86A"/>`,
  },
  {
    dir: 'apps/gowayy-partner/web/public',
    name: 'GOWAYY PARTNER', tag: 'partner', accent: '#C9A86A',
    mark: `<rect x="392" y="44" width="72" height="72" rx="14" fill="none" stroke="#C9A86A" stroke-width="10"/><path d="M410 80 H446 M428 62 V98" stroke="#C9A86A" stroke-width="9" stroke-linecap="round"/>`,
  },
  {
    dir: 'apps/gowayy-explore/web/public',
    name: 'GOWAYY EXPLORE', tag: 'explore', accent: '#C9A86A',
    mark: `<circle cx="432" cy="80" r="30" fill="none" stroke="#C9A86A" stroke-width="9"/><path d="M446 66 L436 92 L418 94 L428 68 Z" fill="#C9A86A"/>`,
  },
];

const FONT = "'GOWAYY Display','Manrope','Inter','Segoe UI',system-ui,sans-serif";

function symbolWithMark(mark) {
  return baseSymbol.replace('</svg>', `  <g>${mark}</g>\n</svg>`);
}
function wordmarkSvg(name, width = 760) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 104" role="img" aria-label="${name} wordmark">
  <title>${name}</title>
  <text x="8" y="76" font-family="${FONT}" font-size="72" font-weight="800" letter-spacing="6" fill="#F5F1E8">${name}</text>
</svg>`;
}
function lockupSvg(app) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 980 300" role="img" aria-label="${app.name} lockup">
  <title>${app.name}</title>
  <g transform="translate(20 20) scale(0.52)">${symbolWithMark(app.mark).replace(/<\?xml[^>]*\?>/, '').replace(/<svg[^>]*>|<\/svg>/g, '')}</g>
  <text x="330" y="180" font-family="${FONT}" font-size="92" font-weight="800" letter-spacing="8" fill="#F5F1E8">${app.name}</text>
</svg>`;
}
function iconSvg(app) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${app.name} app icon">
  <title>${app.name}</title>
  <rect width="512" height="512" rx="112" fill="#14161A"/>
  <g transform="translate(56 56) scale(0.78)">${symbolWithMark(app.mark).replace(/<\?xml[^>]*\?>/, '').replace(/<svg[^>]*>|<\/svg>/g, '')}</g>
</svg>`;
}
function splashSvg(app) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" role="img" aria-label="${app.name} splash">
  <title>${app.name} splash</title>
  <rect width="1080" height="1080" fill="#0D0F12"/>
  <circle cx="540" cy="470" r="330" fill="none" stroke="#C9A86A" stroke-opacity="0.25" stroke-width="2"/>
  <circle cx="540" cy="470" r="250" fill="none" stroke="#C9A86A" stroke-opacity="0.18" stroke-width="2"/>
  <g transform="translate(290 220) scale(1.0)">${symbolWithMark(app.mark).replace(/<\?xml[^>]*\?>/, '').replace(/<svg[^>]*>|<\/svg>/g, '')}</g>
  <text x="540" y="920" text-anchor="middle" font-family="${FONT}" font-size="64" font-weight="800" letter-spacing="14" fill="#F5F1E8">${app.name}</text>
</svg>`;
}

for (const app of APPS) {
  const dir = join(root, app.dir, 'brand');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'g-symbol.svg'), symbolWithMark(app.mark));
  writeFileSync(join(dir, 'wordmark.svg'), wordmarkSvg(app.name));
  writeFileSync(join(dir, 'lockup.svg'), lockupSvg(app));
  writeFileSync(join(dir, 'icon.svg'), iconSvg(app));
  writeFileSync(join(dir, 'splash-logo.svg'), splashSvg(app));
  writeFileSync(join(dir, 'app.json'), JSON.stringify({ name: app.name, tag: app.tag, accent: app.accent }, null, 2));
  const mascotDir = join(root, app.dir, 'mascot');
  mkdirSync(mascotDir, { recursive: true });
  const src = join(root, 'assets/mascot');
  for (const f of ['kanchu-idle-standing.svg', 'kanchu-curious.svg', 'kanchu-thinking.svg', 'kanchu-welcoming.svg', 'kanchu-pointing.svg', 'kanchu-excited.svg', 'kanchu-waving.svg', 'kanchu-delivery.svg', 'kanchu-travel.svg', 'kanchu-loading.svg', 'kanchu-success.svg', 'kanchu-error-retry.svg']) {
    if (existsSync(join(src, f))) cpSync(join(src, f), join(mascotDir, f));
  }
  console.log(`brand+mascot -> ${app.dir}`);
}
