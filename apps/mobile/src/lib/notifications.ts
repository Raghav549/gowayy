/** Push permission handling + in-app notification polling (Realtime is used on Supabase). */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { client } from './client';
import { useSession } from '../store/useSession';
import { useUI } from '../store/useUI';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export async function requestPushPermission(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
    // A real push token requires an EAS projectId; without one we degrade to in-app alerts.
    const token = await Notifications.getDevicePushTokenAsync();
    return token.data ?? null;
  } catch { return null; }
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
