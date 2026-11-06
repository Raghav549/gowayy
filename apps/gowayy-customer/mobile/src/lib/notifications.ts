/** Consent-based Expo push registration plus in-app notification polling. */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { client } from './client';
import { useSession } from '../store/useSession';
import { useUI } from '../store/useUI';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

const INSTALLATION_KEY = 'gowayy.push.installation';

export async function pushInstallationId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (existing) return existing;
  const id = `mobile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  await SecureStore.setItemAsync(INSTALLATION_KEY, id);
  return id;
}

/**
 * Registers an Expo push token only after authenticated server configuration and
 * OS permission checks. A token is never treated as a successful notification.
 */
export async function registerNativePush(requestPermission = true): Promise<{ registered: true; installationId: string }> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') throw new Error('Native push registration requires an Android or iOS development/production build.');
  const push = await client.pushConfig();
  if (!push.expoEnabled) throw new Error('Expo push is not configured on the GOWAYY server. No device was registered.');
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted' && requestPermission) permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Notification permission is not granted. Enable it in Android/iOS settings and retry.');

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) throw new Error('Set EXPO_PUBLIC_EAS_PROJECT_ID (or extra.eas.projectId) to the real EAS project before requesting an Expo push token.');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('gowayy-updates', {
      name: 'GOWAYY updates', importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250], lightColor: '#6D28A8',
    });
  }
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  const installationId = await pushInstallationId();
  await client.registerPushToken({ provider: 'expo', platform: Platform.OS, installationId, token: token.data });
  return { registered: true, installationId };
}

export async function unregisterNativePush(): Promise<void> {
  const installationId = await pushInstallationId();
  await client.unregisterPushToken(installationId);
}

/** Silent refresh on launch/token rotation; permission prompts remain user initiated. */
export function useNativePushRegistration(): void {
  const user = useSession((s) => s.user);
  const router = useRouter();
  useEffect(() => {
    if (!user || Platform.OS === 'web') return;
    void registerNativePush(false).catch(() => undefined);
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      void registerNativePush(false).catch(() => undefined);
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: unknown };
      const type = typeof data.type === 'string' ? data.type : '';
      if (type.startsWith('order.') || type.startsWith('delivery.')) router.push('/(tabs)/orders');
      else router.push('/(tabs)/bookings');
    });
    return () => { tokenSubscription.remove(); responseSubscription.remove(); };
  }, [user, router]);
}

export function useNotificationPolling(): void {
  const user = useSession((s) => s.user);
  const showToast = useUI((s) => s.showToast);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const poll = async () => {
      try {
        const { items } = await client.notifications();
        if (!active) return;
        if (seen.current === null) { seen.current = new Set(items.map((i) => i.id)); return; }
        for (const n of items) {
          if (!seen.current.has(n.id) && !n.readAt) { showToast(`${n.title} — ${n.body}`); seen.current.add(n.id); }
        }
      } catch { /* offline: keep the last known state */ }
    };
    void poll();
    const t = setInterval(() => void poll(), 30_000);
    return () => { active = false; clearInterval(t); };
  }, [user, showToast]);
}
