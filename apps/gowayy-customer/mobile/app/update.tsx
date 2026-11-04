import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppUpdate, downloadUpdate, findLatestUpdate, installedVersion, openPackageInstaller, requestUnknownSourceApproval } from '../src/lib/app-updates';

const APP_NAME = 'GOWAYY';
export default function AppUpdateScreen() {
  const router = useRouter();
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [permissionVisited, setPermissionVisited] = useState(false);
  const [message, setMessage] = useState('Checking for this app’s latest release…');
  const current = installedVersion();

  const check = useCallback(async () => {
    setChecking(true); setMessage('Checking GitHub Releases…'); setFileUri(null);
    try {
      const found = await findLatestUpdate();
      setUpdate(found);
      setMessage(found ? 'A newer version is ready.' : 'You have the latest version.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not check for updates. Check your connection and try again.');
    } finally { setChecking(false); }
  }, []);
  useEffect(() => { void check(); }, [check]);

  async function download() {
    if (!update) return;
    setDownloading(true); setProgress(0); setMessage('Downloading update…');
    try {
      const uri = await downloadUpdate(update, setProgress);
      setFileUri(uri); setMessage('Download verified. Android will check the app signature before installation.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Download failed. Please try again.');
    } finally { setDownloading(false); }
  }

  async function install() {
    if (!fileUri) return;
    try {
      if (Number(Platform.Version) >= 26 && !permissionVisited) {
        Alert.alert('Allow app installs', 'Android requires your approval before GOWAYY can request installation of downloaded updates. Enable “Allow from this source” for this app, return here, and tap Install update again.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open permission settings', onPress: () => void requestUnknownSourceApproval().then(() => setPermissionVisited(true)).catch(() => Linking.openSettings()) },
        ]);
        return;
      }
      await openPackageInstaller(fileUri);
    } catch (error) {
      Alert.alert('Installation needs your approval', error instanceof Error ? error.message : 'Android could not open the package installer.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Permission settings', onPress: () => void requestUnknownSourceApproval().then(() => setPermissionVisited(true)).catch(() => Linking.openSettings()) },
      ]);
    }
  }

  return <ScrollView contentContainerStyle={styles.page}>
    <Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.back}>‹  Back</Text></Pressable>
    <Text style={styles.title}>App updates</Text>
    <Text style={styles.subtitle}>{APP_NAME} · Installed version {current.name} ({current.code})</Text>
    <View style={styles.card}>
      <Text style={styles.status}>{message}</Text>
      {update ? <>
        <Text style={styles.version}>Version {update.versionName} ({update.versionCode})</Text>
        <Text style={styles.notesTitle}>Release notes</Text>
        <Text style={styles.notes}>{update.releaseNotes}</Text>
        {downloading ? <View style={styles.progressWrap}><View style={styles.progressTrack}><View style={[styles.progressFill, {width: `${Math.round(progress * 100)}%`}]} /></View><Text style={styles.progressLabel}>{progress > 0 ? `${Math.round(progress * 100)}% downloaded` : 'Starting download…'}</Text></View> : null}
        {fileUri ? <Pressable onPress={() => void install()} style={styles.primary}><Text style={styles.primaryText}>Install update</Text></Pressable> : <Pressable disabled={downloading} onPress={() => void download()} style={[styles.primary, downloading && styles.disabled]}><Text style={styles.primaryText}>{downloading ? 'Downloading…' : 'Download update'}</Text></Pressable>}
        <Text style={styles.permissionHint}>Android will ask for approval. Installation is never silent; your device verifies the same app package and signing identity.</Text>
      </> : null}
      <Pressable disabled={checking || downloading} onPress={() => void check()} style={styles.secondary}><Text style={styles.secondaryText}>{checking ? 'Checking…' : 'Check again'}</Text></Pressable>
    </View>
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 24, paddingTop: 30, backgroundColor: '#FAF4E9', gap: 16 },
  back: { color: '#1E6B4F', fontSize: 16, fontWeight: '700' },
  title: { color: '#2F241F', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#75665D', fontSize: 14 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, gap: 14, borderWidth: 1, borderColor: '#E8DDD0' },
  status: { color: '#453A33', fontSize: 15, lineHeight: 22 },
  version: { color: '#1E6B4F', fontSize: 20, fontWeight: '800' },
  notesTitle: { color: '#453A33', fontSize: 14, fontWeight: '800' },
  notes: { color: '#75665D', fontSize: 14, lineHeight: 21 },
  progressWrap: { gap: 6 },
  progressTrack: { height: 8, borderRadius: 8, overflow: 'hidden', backgroundColor: '#E9E2D8' },
  progressFill: { height: 8, backgroundColor: '#1E6B4F' },
  progressLabel: { color: '#75665D', fontSize: 12 },
  primary: { alignItems: 'center', padding: 15, borderRadius: 999, backgroundColor: '#1E6B4F' },
  disabled: { opacity: 0.55 },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  secondary: { alignItems: 'center', padding: 13, borderRadius: 999, backgroundColor: '#F0E7D9' },
  secondaryText: { color: '#453A33', fontWeight: '700' },
  permissionHint: { color: '#75665D', fontSize: 12, lineHeight: 18 },
});
