/**
 * Rasterizes the GOWAYY G mark into PNG brand assets and regenerates the full
 * per-app SVG brand set — dependency-free (pure Node zlib + polygon fill).
 * Replaces every v1 dark/charcoal asset in web public/brand and mobile assets/branding.
 * Run: npm run brands:png
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const OUTER = [[176,48],[336,48],[432,144],[432,224],[268,224],[268,300],[432,300],[432,368],[336,464],[176,464],[80,368],[80,144]];
const HOLE  = [[196,132],[316,132],[372,188],[372,224],[268,224],[268,300],[372,300],[372,324],[316,380],[196,380],[140,324],[140,188]];

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inG = (x, y) => pointInPoly(x, y, OUTER) && !pointInPoly(x, y, HOLE);

function crc32(buf) {
  let c; let table = crc32.table;
  if (!table) { table = crc32.table = new Int32Array(256); for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; } }
  c = -1; for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Rasterize the G. bg=null → transparent; crossbar painted with accent. */
function drawG(size, ink, accent, { bg = null, ring = null, pad = 0.16, mono = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 512;
  const [br, bgc, bb] = bg ? hex(bg) : [0, 0, 0];
  const [ir, ig, ib] = hex(mono ? ink : ink);
  const [ar, ag, ab] = hex(mono ? ink : accent);
  const [rr, rg, rb] = ring ? hex(ring) : [0, 0, 0];
  const inset = size * pad;
  const corner = size * 0.22;
  const inRoundRect = (x, y) => {
    if (!bg) return true;
    if (x < corner || x >= size - corner || y < corner || y >= size - corner) {
      const cx = Math.max(corner, Math.min(x, size - corner));
      const cy = Math.max(corner, Math.min(y, size - corner));
      return (x - cx) ** 2 + (y - cy) ** 2 <= corner * corner;
    }
    return true;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = (y * size + x) * 4;
    let r = br, g = bgc, b = bb, a = bg ? 255 : 0;
    if (ring && Math.abs(Math.hypot(x - size / 2, y - size / 2) - size * 0.42) < size * 0.004) { r = rr; g = rg; b = rb; a = 255; }
    if (x >= inset && y >= inset && x < size - inset && y < size - inset) {
      const gx = (x - inset) / s, gy = (y - inset) / s;
      if (inG(gx, gy)) {
        const inBar = !mono && gx >= 268 && gx <= 432 && gy >= 224 && gy <= 300;
        if (inBar) { r = ar; g = ag; b = ab; } else { r = ir; g = ig; b = ib; }
        a = 255;
      }
    }
    if (bg && !inRoundRect(x, y)) a = 0;
    px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
  }
  return px;
}

// ---- SVG helpers: derive mono/plain/android variants from the app g-symbol ----
const INK = '#33261B'; const PAPER = '#FAF4E9';
function recolor(svg, accent) {
  return svg.replaceAll('#1E6B4F', accent).replaceAll('#E8A23A', accent).replaceAll('#F2C063', accent).replaceAll('#B97A1F', accent);
}
function solidSvg(color, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="${label}"><rect width="512" height="512" rx="112" fill="${color}"/></svg>`;
}
function monoG(svg) {
  return recolor(svg, INK).replaceAll('#33261B', INK);
}

const APPS = [
  { key: 'customer', web: 'apps/gowayy-customer/web/public/brand', mobile: 'apps/gowayy-customer/mobile/assets/branding', accent: '#1E6B4F', soft: '#E2EFE7' },
  { key: 'partner', web: 'apps/gowayy-partner/web/public/brand', mobile: 'apps/gowayy-partner/mobile/assets/branding', accent: '#C2502A', soft: '#F8E3D8' },
  { key: 'explore', web: 'apps/gowayy-explore/web/public/brand', mobile: 'apps/gowayy-explore/mobile/assets/branding', accent: '#6D3B5E', soft: '#F1E2EC' },
];

// stale v1 files to remove (code now uses .svg; PNGs that remain are regenerated below)
const STALE_WEB_PNG = ['favicon.ico', 'g-mono.png', 'g-mono-inverse.png', 'g-symbol.png', 'g-symbol-small.png', 'icon-bg.png', 'icon-fg.png', 'splash-logo.png', 'wordmark.png'];
const STALE_MOBILE = ['wordmark.png'];

for (const app of APPS) {
  const webDir = join(root, app.web);
  const mobDir = join(root, app.mobile);
  mkdirSync(webDir, { recursive: true });
  mkdirSync(mobDir, { recursive: true });
  const symbol = readFileSync(join(webDir, 'g-symbol.svg'), 'utf8'); // written by build-app-brands.mjs

  // full SVG set in both locations (kills every old dark asset)
  const svgSet = {
    'g-symbol.svg': symbol,
    'android-icon-foreground.svg': symbol,
    'android-monochrome-icon.svg': monoG(symbol),
    'android-icon-background.svg': solidSvg(app.soft, `${app.key} icon background`),
    'g-mono.svg': monoG(symbol),
    'g-mono-inverse.svg': recolor(symbol, PAPER),
    'g-shape.svg': monoG(symbol),
  };
  for (const [name, content] of Object.entries(svgSet)) {
    writeFileSync(join(webDir, name), content);
    writeFileSync(join(mobDir, name), content);
  }
  // mobile also keeps lockup/splash/wordmark/icon svgs fresh
  for (const name of ['wordmark.svg', 'lockup.svg', 'icon.svg', 'splash-logo.svg']) {
    if (existsSync(join(webDir, name))) writeFileSync(join(mobDir, name), readFileSync(join(webDir, name), 'utf8'));
  }

  // PNGs actually referenced: web favicon/app-icon; mobile app.json icons + tintable g-symbol
  writeFileSync(join(webDir, 'favicon.png'), encodePNG(512, 512, drawG(512, INK, app.accent, { bg: app.soft })));
  writeFileSync(join(webDir, 'app-icon.png'), encodePNG(1024, 1024, drawG(1024, INK, app.accent, { bg: app.soft })));
  for (const f of STALE_WEB_PNG) { const p = join(webDir, f); if (existsSync(p)) rmSync(p); }

  writeFileSync(join(mobDir, 'app-icon.png'), encodePNG(1024, 1024, drawG(1024, INK, app.accent, { bg: app.soft })));
  writeFileSync(join(mobDir, 'splash-logo.png'), encodePNG(1080, 1080, drawG(1080, INK, app.accent, { bg: PAPER, ring: app.accent, pad: 0.18 })));
  writeFileSync(join(mobDir, 'icon-foreground.png'), encodePNG(432, 432, drawG(432, INK, app.accent, { pad: 0.08 })));
  writeFileSync(join(mobDir, 'icon-background.png'), encodePNG(432, 432, drawG(432, INK, app.accent, { bg: app.soft, pad: 1 })));
  writeFileSync(join(mobDir, 'icon-monochrome.png'), encodePNG(432, 432, drawG(432, INK, INK, { pad: 0.08, mono: true })));
  writeFileSync(join(mobDir, 'g-symbol.png'), encodePNG(512, 512, drawG(512, INK, INK, { pad: 0.1, mono: true }))); // tintable
  writeFileSync(join(mobDir, 'g-symbol-small.png'), encodePNG(128, 128, drawG(128, INK, INK, { pad: 0.1, mono: true })));
  for (const f of STALE_MOBILE) { const p = join(mobDir, f); if (existsSync(p)) rmSync(p); }
  console.log(`brand v2 assets -> ${app.key}`);
}

// root assets/brand: refresh the shared v1 leftovers with the customer (base) accent
const base = readFileSync(join(root, 'assets/brand/g-symbol.svg'), 'utf8');
writeFileSync(join(root, 'assets/brand/android-icon-foreground.svg'), base);
writeFileSync(join(root, 'assets/brand/android-monochrome-icon.svg'), monoG(base));
writeFileSync(join(root, 'assets/brand/android-icon-background.svg'), solidSvg('#E2EFE7', 'GOWAYY icon background'));
writeFileSync(join(root, 'assets/brand/lockup-horizontal.svg'), existsSync(join(root, 'assets/brand/lockup.svg')) ? readFileSync(join(root, 'assets/brand/lockup.svg'), 'utf8') : base);
console.log('root assets/brand refreshed');
