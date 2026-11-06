import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { client } from './client';
import { useSession } from '../store';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
}
const INSTALLATION_KEY = 'gowayy.partner.push.installation';

export async function pushInstallationId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (existing) return existing;
  const id = `partner_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  await SecureStore.setItemAsync(INSTALLATION_KEY, id);
  return id;
}

export async function registerNativePush(requestPermission = true): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') throw new Error('Native push requires an Android or iOS development/production build.');
  const config = await client.pushConfig();
  if (!config.expoEnabled) throw new Error('Expo push is not configured on the GOWAYY server. No device was registered.');
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted' && requestPermission) permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Notification permission is not granted. Enable it in system settings and retry.');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) throw new Error('Set EXPO_PUBLIC_EAS_PROJECT_ID (or extra.eas.projectId) to the real EAS project before requesting a push token.');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('gowayy-updates', {
    name: 'GOWAYY partner updates', importance: Notifications.AndroidImportance.HIGH, lightColor: '#421080',
  });
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  await client.registerPushToken({ provider: 'expo', platform: Platform.OS, installationId: await pushInstallationId(), token: token.data });
}

export async function unregisterNativePush(): Promise<void> {
  await client.unregisterPushToken(await pushInstallationId());
}

export function usePartnerPushRegistration(): void {
  const user = useSession((s) => s.user);
  const router = useRouter();
  useEffect(() => {
    if (!user || Platform.OS === 'web') return;
    void registerNativePush(false).catch(() => undefined);
    const tokens = Notifications.addPushTokenListener(() => { void registerNativePush(false).catch(() => undefined); });
    const responses = Notifications.addNotificationResponseReceivedListener(() => router.push('/(tabs)/inbox'));
    return () => { tokens.remove(); responses.remove(); };
  }, [user, router]);
}
