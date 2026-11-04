/** Copy static reduced-motion and animated transparent onboarding WebPs into Customer targets. */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'assets/onboarding');
const targets = [
  join(root, 'apps/gowayy-customer/web/public/images/onboarding'),
  join(root, 'apps/gowayy-customer/mobile/assets/onboarding'),
];
const files = [
  'groceries.webp', 'local-cab.webp', 'hotel-stay.webp', 'himalayan-discovery.webp', 'local-experience.webp',
  'groceries-animated.webp', 'local-cab-animated.webp', 'hotel-stay-animated.webp', 'himalayan-discovery-animated.webp', 'local-experience-animated.webp',
];
for (const target of targets) {
  mkdirSync(target, { recursive: true });
  for (const file of files) copyFileSync(join(source, file), join(target, file));
}
console.log(`synchronized ${files.length} optimized onboarding scenes to web and mobile`);
