import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets/images/destinations');
const dst = join(root, 'apps/web/public/images/destinations');
mkdirSync(dst, { recursive: true });
let count = 0;
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(webp|avif)$/.test(entry)) {
      const target = join(dst, relative(src, p));
      mkdirSync(dirname(target), { recursive: true });
      cpSync(p, target); count += 1;
    }
  }
}
walk(src);
console.log(`synced ${count} optimized destination images into apps/web/public/images/destinations`);
