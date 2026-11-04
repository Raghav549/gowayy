import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

const OWNER = 'Raghav549';
const REPOSITORY = 'gowayy';
const RELEASE_TAG_PREFIX = 'android-partner-';
const MANIFEST_ASSET = 'gowayy-partner-update.json';
const APK_FILE = 'gowayy-partner.apk';
const EXPECTED_PACKAGE = 'app.gowayy.partner';

export type AppUpdate = {
  versionName: string;
  versionCode: number;
  packageId: string;
  apkUrl: string;
  md5: string;
  sizeBytes: number;
  releaseNotes: string;
};

export function installedVersion() {
  return {
    name: Constants.expoConfig?.version ?? '0.0.0',
    code: Number(Constants.expoConfig?.android?.versionCode ?? 1),
  };
}

export async function findLatestUpdate(): Promise<AppUpdate | null> {
  const current = installedVersion();
  for (let page = 1; ; page += 1) {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPOSITORY}/releases?per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`Update service returned HTTP ${response.status}.`);
    const releases = await response.json() as Array<{ tag_name: string; draft: boolean; prerelease: boolean; body: string; assets: Array<{ name: string; browser_download_url: string }> }>;
    if (!releases.length) return null;
    const candidates = releases.filter((release) =>
      !release.draft && !release.prerelease && release.tag_name.startsWith(RELEASE_TAG_PREFIX),
    );
    for (const release of candidates) {
      const asset = release.assets.find((item) => item.name === MANIFEST_ASSET);
      if (!asset) continue;
      const result = await fetch(asset.browser_download_url, { headers: { Accept: 'application/vnd.github+json' } });
      if (!result.ok) continue;
      const manifest = await result.json() as Omit<AppUpdate, 'releaseNotes'> & { app: string };
      if (manifest.app !== 'partner' || manifest.packageId !== EXPECTED_PACKAGE || !Number.isSafeInteger(manifest.versionCode) ||
          !/^https:\/\/github\.com\/Raghav549\/gowayy\/releases\/download\//.test(manifest.apkUrl) ||
          !/^[a-f0-9]{32}$/i.test(manifest.md5) || manifest.sizeBytes < 100_000) continue;
      if (manifest.versionCode <= current.code) return null;
      return { ...manifest, releaseNotes: release.body || 'Maintenance and improvements.' };
    }
    if (releases.length < 100) return null;
  }
}

const LAST_CHECK_KEY = 'gowayy.androidUpdateLastCheckedAt';
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Check at most once per day on startup; failures remain retryable on the next launch. */
export async function checkForStartupUpdate(): Promise<AppUpdate | null> {
  const now = Date.now();
  const previous = Number(await SecureStore.getItemAsync(LAST_CHECK_KEY).catch(() => null));
  if (Number.isFinite(previous) && now - previous < UPDATE_CHECK_INTERVAL_MS) return null;
  const update = await findLatestUpdate();
  await SecureStore.setItemAsync(LAST_CHECK_KEY, String(now)).catch(() => undefined);
  return update;
}

export async function downloadUpdate(update: AppUpdate, onProgress: (fraction: number) => void) {
  if (Platform.OS !== 'android') throw new Error('APK installation is supported on Android only.');
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error('App cache is unavailable.');
  const destination = `${directory}${APK_FILE}`;
  await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
  const task = FileSystem.createDownloadResumable(update.apkUrl, destination, { md5: true }, (progress) => {
    if (progress.totalBytesExpectedToWrite > 0) onProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
  });
  const result = await task.downloadAsync();
  if (!result || result.status !== 200) throw new Error(`APK download failed (HTTP ${result?.status ?? 'unknown'}).`);
  const info = await FileSystem.getInfoAsync(result.uri, { md5: true });
  if (!info.exists || info.isDirectory || info.size !== update.sizeBytes || info.md5?.toLowerCase() !== update.md5.toLowerCase()) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => undefined);
    throw new Error('Downloaded APK failed its size or checksum validation. Please retry.');
  }
  onProgress(1);
  return result.uri;
}

export async function requestUnknownSourceApproval() {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 26) return;
  const appId = Constants.expoConfig?.android?.package ?? EXPECTED_PACKAGE;
  await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, { data: `package:${appId}` });
}

export async function openPackageInstaller(fileUri: string) {
  if (Platform.OS !== 'android') throw new Error('APK installation is supported on Android only.');
  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1,
  });
}
