import type { GowayyClient } from './http.ts';

export interface BrowserPushOptions {
  client: GowayyClient;
  installationKey: string;
  serviceWorkerUrl?: string;
}

function installationId(key: string): string {
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = `web_${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`}`;
  window.localStorage.setItem(key, id);
  return id;
}

function applicationServerKey(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const decoded = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
  return bytes.buffer;
}

/** Register a real browser Push API subscription and confirm it with the server. */
export async function registerBrowserPush(options: BrowserPushOptions, requestPermission = true): Promise<{ registered: true; installationId: string }> {
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('Browser push requires HTTPS and a browser with Service Worker, Push API and Notification support.');
  }
  const config = await options.client.pushConfig();
  if (!config.webPushEnabled || !config.vapidPublicKey) throw new Error('Web Push/VAPID is not configured on the GOWAYY server. No browser subscription was created.');
  let permission = Notification.permission;
  if (permission === 'default' && requestPermission) permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission is not granted. Enable it in browser site settings and retry.');

  const workerUrl = options.serviceWorkerUrl ?? '/sw.js';
  const registration = await navigator.serviceWorker.register(workerUrl);
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(config.vapidPublicKey) });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.auth || !json.keys.p256dh) {
    await subscription.unsubscribe();
    throw new Error('The browser returned an incomplete push subscription. Nothing was registered.');
  }
  const id = installationId(options.installationKey);
  try {
    await options.client.registerPushToken({
      provider: 'web_push', platform: 'web', installationId: id, token: json.endpoint,
      subscription: { endpoint: json.endpoint, expirationTime: json.expirationTime ?? null, keys: { auth: json.keys.auth, p256dh: json.keys.p256dh } },
    });
  } catch (error) {
    await subscription.unsubscribe().catch(() => false);
    throw error;
  }
  return { registered: true, installationId: id };
}

export async function unregisterBrowserPush(options: BrowserPushOptions): Promise<void> {
  await options.client.unregisterPushToken(installationId(options.installationKey));
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration(options.serviceWorkerUrl ?? '/sw.js');
    await registration?.pushManager.getSubscription().then((subscription) => subscription?.unsubscribe());
  }
}
