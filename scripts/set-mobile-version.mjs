import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [app, versionName, versionCodeText] = process.argv.slice(2);
if (!['customer', 'explore', 'partner'].includes(app) || !versionName || !/^\d+$/.test(versionCodeText ?? '')) {
  throw new Error('Usage: node scripts/set-mobile-version.mjs customer|explore|partner <versionName> <versionCode>');
}
const file = resolve(`apps/gowayy-${app}/mobile/app.json`);
const config = JSON.parse(readFileSync(file, 'utf8'));
const versionCode = Number(versionCodeText);
if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2_100_000_000) throw new Error('Android versionCode is out of range.');
config.expo.version = versionName;
config.expo.android.versionCode = versionCode;
writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Configured ${app}: version ${versionName}, Android versionCode ${versionCode}, package ${config.expo.android.package}`);
