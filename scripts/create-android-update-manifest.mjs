import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const [app, versionName, versionCodeText, apkPath, tag] = process.argv.slice(2);
if (!['customer', 'explore', 'partner'].includes(app) || !versionName || !/^\d+$/.test(versionCodeText ?? '') || !apkPath || !tag) {
  throw new Error('Usage: node scripts/create-android-update-manifest.mjs customer|explore|partner <versionName> <versionCode> <apkPath> <releaseTag>');
}
const source = resolve(apkPath);
const bytes = readFileSync(source);
if (bytes.length < 100_000 || bytes.subarray(0, 2).toString() !== 'PK') throw new Error(`APK is empty, too small, or not a ZIP/APK: ${source}`);
const config = JSON.parse(readFileSync(`apps/gowayy-${app}/mobile/app.json`, 'utf8')).expo;
const assetName = `gowayy-${app}.apk`;
if (basename(source) !== assetName) throw new Error(`Expected ${assetName}, received ${basename(source)}`);
const metadata = {
  app,
  packageId: config.android.package,
  versionName,
  versionCode: Number(versionCodeText),
  apkAsset: assetName,
  apkUrl: `https://github.com/Raghav549/gowayy/releases/download/${tag}/${assetName}`,
  sizeBytes: statSync(source).size,
  md5: createHash('md5').update(bytes).digest('hex'),
  sha256: createHash('sha256').update(bytes).digest('hex'),
};
const destination = resolve(`artifacts/gowayy-${app}-update.json`);
writeFileSync(destination, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Created ${destination}: ${metadata.packageId}, versionCode ${metadata.versionCode}, ${metadata.sizeBytes} bytes, SHA-256 ${metadata.sha256}`);
