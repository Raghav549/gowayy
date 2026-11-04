import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const app = process.argv[2];
if (!['customer', 'explore', 'partner'].includes(app)) throw new Error('Usage: node scripts/verify-web-output.mjs customer|explore|partner');
const directory = resolve(`apps/gowayy-${app}/web`);
const dist = join(directory, 'dist');
const index = join(dist, 'index.html');
if (!existsSync(index) || !statSync(index).isFile() || statSync(index).size === 0) throw new Error(`Missing production index: ${index}`);
const html = readFileSync(index, 'utf8');
const titles = { customer: 'GOWAYY — Connected Journeys', explore: 'GOWAYY EXPLORE — Discover the Himalaya', partner: 'GOWAYY PARTNER — Grow your business' };
if (!html.includes(`<title>${titles[app]}</title>`)) throw new Error(`${index} does not identify the ${app} application.`);
const references = [...html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)].map((match) => match[1]).filter((url) => url.startsWith('/assets/'));
if (!references.length) throw new Error(`No compiled JS/CSS asset references found in ${index}.`);
for (const asset of references) {
  const file = join(dist, asset.slice(1));
  if (!existsSync(file) || !statSync(file).isFile() || statSync(file).size === 0) throw new Error(`Broken production asset reference: ${asset}`);
}
const config = JSON.parse(readFileSync(join(directory, 'vercel.json'), 'utf8'));
if (config.outputDirectory !== 'dist' || config.framework !== 'vite' || !config.rewrites?.some((route) => route.destination === '/index.html')) {
  throw new Error(`Vercel config for ${app} has the wrong framework, output path, or SPA fallback.`);
}
const assetDirectory = join(dist, 'assets');
if (!existsSync(assetDirectory) || !readdirSync(assetDirectory).length) throw new Error(`No compiled assets found for ${app}.`);
console.log(`Verified ${app}: ${index}; ${references.length} referenced bundles exist, Vite output is app-local, Vercel SPA fallback is configured.`);
