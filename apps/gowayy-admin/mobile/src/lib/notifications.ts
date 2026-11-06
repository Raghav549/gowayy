import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createGowayyClient, createMemoryTokenStore } from '@gowayy/api-client';

export const nativeTokenStore = createMemoryTokenStore();
const adminUrl = (process.env.EXPO_PUBLIC_ADMIN_URL ?? '').trim();
const apiBaseUrl = process.env.EXPO_PUBLIC_GOWAYY_API_BASE_URL ?? (adminUrl ? new URL('/api', adminUrl).toString() : '/api');
export const pushClient = createGowayyClient({
  tokenStore: nativeTokenStore,
  baseUrl: apiBaseUrl,
  env: {
    VITE_GOWAYY_BACKEND: process.env.EXPO_PUBLIC_GOWAYY_BACKEND,
    VITE_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
const INSTALLATION_KEY = 'gowayy.admin.push.installation';

if (Platform.OS !== 'web') Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

async function installationId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (existing) return existing;
  const id = `admin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  await SecureStore.setItemAsync(INSTALLATION_KEY, id);
  return id;
}

export async function registerAdminPush(requestPermission = true): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') throw new Error('Native push requires an Android or iOS development/production build.');
  if (!nativeTokenStore.get()) throw new Error('Sign in to the Admin console before enabling push on this device.');
  const config = await pushClient.pushConfig();
  if (!config.expoEnabled) throw new Error('Expo push is not configured on the GOWAYY server. No device was registered.');
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted' && requestPermission) permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Notification permission is not granted. Enable it in system settings and retry.');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) throw new Error('Set EXPO_PUBLIC_EAS_PROJECT_ID (or extra.eas.projectId) to the real EAS project before requesting a push token.');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('gowayy-updates', {
    name: 'GOWAYY admin updates', importance: Notifications.AndroidImportance.HIGH, lightColor: '#421080',
  });
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  await pushClient.registerPushToken({ provider: 'expo', platform: Platform.OS, installationId: await installationId(), token: token.data });
}

export async function unregisterAdminPush(): Promise<void> {
  if (!nativeTokenStore.get()) throw new Error('Sign in before changing this device registration.');
  await pushClient.unregisterPushToken(await installationId());
}
