import { useEffect } from 'react';
import { registerBrowserPush, unregisterBrowserPush } from '@gowayy/api-client';
import { client } from './client';
import { useSession } from '../store/useSession';

const options = { client, installationKey: 'gowayy.customer.push.installation', serviceWorkerUrl: '/sw.js' };
export const registerWebPush = (requestPermission = true) => registerBrowserPush(options, requestPermission);
export const unregisterWebPush = () => unregisterBrowserPush(options);

/** Refresh existing consent on launch and after browser subscription rotation. */
export function useWebPushRegistration(): void {
  const userId = useSession((s) => s.user?.id);
  useEffect(() => {
    if (!userId || !('serviceWorker' in navigator) || !('Notification' in window)) return;
    if (Notification.permission === 'granted') void registerWebPush(false).catch(() => undefined);
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOWAYY_PUSH_SUBSCRIPTION_CHANGED') void registerWebPush(false).catch(() => undefined);
      if (event.data?.type === 'GOWAYY_PUSH_CLICK' && typeof event.data.notificationId === 'string') {
        void client.markNotificationRead(event.data.notificationId).catch(() => undefined);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [userId]);
}
