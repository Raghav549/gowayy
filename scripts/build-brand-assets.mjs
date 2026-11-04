/** Rasterise the canonical SVG brand assets into the web app and Android asset folders. */
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const brand = join(root, 'assets/brand');
const web = join(root, 'apps/gowayy-customer/web/public/brand');
const mobile = join(root, 'apps/gowayy-customer/mobile/assets/branding');
const images = join(root, 'assets/images/branding');
for (const d of [web, mobile, images]) mkdirSync(d, { recursive: true });

function render(name, out, size) {
  const svg = readFileSync(join(brand, name), 'utf8');
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: 'transparent' }).render().asPng();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log('rendered', out, size);
}

const svgs = ['g-symbol.svg','g-shape.svg','g-mono.svg','g-mono-inverse.svg','wordmark.svg','splash-logo.svg','android-icon-background.svg','android-icon-foreground.svg','android-monochrome-icon.svg','lockup-horizontal.svg'];
for (const s of svgs) { copyFileSync(join(brand, s), join(web, s)); copyFileSync(join(brand, s), join(mobile, s)); }

render('g-symbol.svg', join(web, 'g-symbol.png'), 1024);
render('g-symbol.svg', join(web, 'g-symbol-small.png'), 256);
render('g-mono.svg', join(web, 'g-mono.png'), 512);
render('g-mono-inverse.svg', join(web, 'g-mono-inverse.png'), 512);
render('wordmark.svg', join(web, 'wordmark.png'), 984);
render('splash-logo.svg', join(web, 'splash-logo.png'), 1080);
render('splash-logo.svg', join(mobile, 'splash-logo.png'), 1080);
render('android-icon-background.svg', join(web, 'icon-bg.png'), 1024);
render('android-icon-background.svg', join(mobile, 'icon-background.png'), 1024);
render('android-icon-foreground.svg', join(web, 'icon-fg.png'), 1024);
render('android-icon-foreground.svg', join(mobile, 'icon-foreground.png'), 1024);
render('android-monochrome-icon.svg', join(mobile, 'icon-monochrome.png'), 1024);
render('g-symbol.svg', join(images, 'g-symbol.png'), 1024);
render('splash-logo.svg', join(images, 'splash-logo.png'), 1080);
render('g-mono.svg', join(web, 'favicon.png'), 64);

// Compose the standard Android launcher icon from adaptive layers.
execFileSync('convert', [join(web, 'icon-bg.png'), join(web, 'icon-fg.png'), '-compose', 'over', '-composite', join(mobile, 'app-icon.png')]);
copyFileSync(join(mobile, 'app-icon.png'), join(web, 'app-icon.png'));
copyFileSync(join(web, 'favicon.png'), join(web, 'favicon.ico'));
console.log('brand assets complete');
