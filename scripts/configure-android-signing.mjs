import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] ?? '');
let gradle = readFileSync(file, 'utf8');
const marker = '    buildTypes {\n';
const buildTypesIndex = gradle.indexOf(marker);
if (buildTypesIndex < 0) throw new Error(`Could not locate Android buildTypes in ${file}`);
if (gradle.includes('signingConfig signingConfigs.release')) throw new Error(`Release signing already configured in ${file}`);
gradle = gradle.slice(0, buildTypesIndex) + `    signingConfigs {\n        release {\n            storeFile file(System.getenv('ANDROID_KEYSTORE_PATH') ?: 'release.keystore')\n            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD') ?: ''\n            keyAlias System.getenv('ANDROID_KEY_ALIAS') ?: ''\n            keyPassword System.getenv('ANDROID_KEY_PASSWORD') ?: ''\n        }\n    }\n\n` + gradle.slice(buildTypesIndex);
const buildIndex = gradle.indexOf(marker);
const releaseStart = gradle.indexOf('        release {\n', buildIndex);
const releaseEnd = gradle.indexOf('\n        }', releaseStart);
if (releaseStart < 0 || releaseEnd < 0) throw new Error(`Could not locate release build type in ${file}`);
const block = gradle.slice(releaseStart, releaseEnd);
if (!block.includes('signingConfig signingConfigs.debug')) throw new Error(`Unexpected release signing config in ${file}`);
gradle = gradle.slice(0, releaseStart) + block.replace('signingConfig signingConfigs.debug', 'signingConfig signingConfigs.release') + gradle.slice(releaseEnd);
writeFileSync(file, gradle);
console.log(`Configured release APK signing via runner environment for ${file}`);
