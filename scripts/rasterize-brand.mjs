/** Rasterize the current official GOWAYY SVG identity for all web and Android clients. */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apps = [
  { tag:'customer', web:'apps/gowayy-customer/web/public/brand', mobile:'apps/gowayy-customer/mobile/assets/branding', name:'GOWAYY' },
  { tag:'explore', web:'apps/gowayy-explore/web/public/brand', mobile:'apps/gowayy-explore/mobile/assets/branding', name:'GOWAYY EXPLORE' },
  { tag:'partner', web:'apps/gowayy-partner/web/public/brand', mobile:'apps/gowayy-partner/mobile/assets/branding', name:'GOWAYY PARTNER' },
];
const render = (svgPath, out, width, height = width) => {
  const svg = readFileSync(svgPath, 'utf8');
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, png);
};
for (const app of apps) {
  for (const out of [app.web, app.mobile]) mkdirSync(join(root,out), { recursive:true });
  const svg = (base) => join(root, app.web, base);
  const web = (base) => join(root, app.web, base);
  const mobile = (base) => join(root, app.mobile, base);
  render(svg('icon.svg'), web('favicon.png'), 192);
  render(svg('icon.svg'), web('app-icon.png'), 1024);
  render(svg('icon.svg'), mobile('app-icon.png'), 1024);
  render(svg('g-purple.svg'), mobile('g-purple.png'), 512);
  render(svg('g-orange.svg'), mobile('g-orange.png'), 512);
  render(svg('android-icon-foreground.svg'), mobile('icon-foreground.png'), 432);
  render(svg('android-icon-background.svg'), mobile('icon-background.png'), 432);
  render(svg('android-monochrome-icon.svg'), mobile('icon-monochrome.png'), 432);
  render(svg('g-symbol.svg'), mobile('g-symbol.png'), 512);
  render(svg('g-symbol.svg'), mobile('g-symbol-small.png'), 128);
  console.log(`rasterized official identity -> ${app.tag}`);
}
const base = join(root, 'assets/brand');
const customer = join(root, apps[0].web);
for (const file of ['g-symbol.svg','g-shape.svg','wordmark.svg','lockup.svg','lockup-horizontal.svg','splash-logo.svg','g-mono.svg','g-mono-inverse.svg','android-icon-foreground.svg','android-icon-background.svg','android-monochrome-icon.svg']) copyFileSync(join(customer,file),join(base,file));
render(join(base,'g-symbol.svg'),join(root,'assets/images/branding/g-symbol.png'),1024);
console.log('shared and per-app raster assets complete');
