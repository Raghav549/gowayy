import { useEffect, useState } from 'react';
import { registerBrowserPush, unregisterBrowserPush, type GowayyClient } from '@gowayy/api-client';
import type { NotificationPreferences } from '@gowayy/types';

type NativeBridgeWindow = Window & { ReactNativeWebView?: { postMessage: (message: string) => void } };
const nativeBridge = () => (window as NativeBridgeWindow).ReactNativeWebView;

const labels: Array<{ key: keyof Omit<NotificationPreferences, 'updatedAt'>; label: string }> = [
  { key: 'pushEnabled', label: 'Push notifications' },
  { key: 'bookingUpdates', label: 'Booking and travel updates' },
  { key: 'orderUpdates', label: 'Order and delivery updates' },
  { key: 'paymentUpdates', label: 'Payment and refund updates' },
  { key: 'partnerUpdates', label: 'Partner updates' },
  { key: 'marketing', label: 'Offers and marketing' },
];

export function useBrowserPushRegistration({ client, installationKey, serviceWorkerUrl = '/sw.js', enabled }: {
  client: GowayyClient; installationKey: string; serviceWorkerUrl?: string; enabled: boolean;
}): void {
  useEffect(() => {
    if (!enabled || nativeBridge() || !('serviceWorker' in navigator) || !('Notification' in window)) return;
    const options = { client, installationKey, serviceWorkerUrl };
    if (Notification.permission === 'granted') void registerBrowserPush(options, false).catch(() => undefined);
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOWAYY_PUSH_SUBSCRIPTION_CHANGED') void registerBrowserPush(options, false).catch(() => undefined);
      if (event.data?.type === 'GOWAYY_PUSH_CLICK' && typeof event.data.notificationId === 'string') void client.markNotificationRead(event.data.notificationId).catch(() => undefined);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [client, installationKey, serviceWorkerUrl, enabled]);
}

export function PushPreferences({ client, installationKey, serviceWorkerUrl = '/sw.js', onStatus }: {
  client: GowayyClient;
  installationKey: string;
  serviceWorkerUrl?: string;
  onStatus?: (message: string, kind: 'success' | 'error' | 'info') => void;
}) {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceStatus, setDeviceStatus] = useState('This browser has not been registered from this screen.');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const options = { client, installationKey, serviceWorkerUrl };

  useEffect(() => {
    let active = true;
    client.notificationPreferences().then((value) => { if (active) { setPreferences(value); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Notification preferences are unavailable.'); });
    return () => { active = false; };
  }, [client, revision]);
  useEffect(() => {
    const onNativeStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; kind?: 'success' | 'error' | 'info' }>).detail;
      if (!detail?.message) return;
      setDeviceStatus(detail.message); onStatus?.(detail.message, detail.kind ?? 'info');
    };
    window.addEventListener('gowayy-push-status', onNativeStatus);
    return () => window.removeEventListener('gowayy-push-status', onNativeStatus);
  }, [onStatus]);

  const report = (message: string, kind: 'success' | 'error' | 'info') => { setDeviceStatus(message); onStatus?.(message, kind); };
  const update = async (key: keyof Omit<NotificationPreferences, 'updatedAt'>, value: boolean) => {
    setBusy(true);
    try {
      const next = await client.updateNotificationPreferences({ [key]: value });
      setPreferences(next); onStatus?.('Notification preference saved', 'success');
    } catch (reason) { onStatus?.(reason instanceof Error ? reason.message : 'Could not save notification preference', 'error'); }
    finally { setBusy(false); }
  };
  const enable = async () => {
    if (nativeBridge()) {
      nativeBridge()?.postMessage(JSON.stringify({ type: 'GOWAYY_NATIVE_PUSH_REGISTER' }));
      setDeviceStatus('Native registration requested. Wait for the Android permission and server confirmation.');
      return;
    }
    setBusy(true);
    try {
      await registerBrowserPush(options, true);
      report('Server registration confirmed. Actual delivery depends on the configured Web Push provider and browser.', 'success');
    } catch (reason) { report(reason instanceof Error ? reason.message : 'Browser push registration failed', 'error'); }
    finally { setBusy(false); }
  };
  const disable = async () => {
    if (nativeBridge()) {
      nativeBridge()?.postMessage(JSON.stringify({ type: 'GOWAYY_NATIVE_PUSH_UNREGISTER' }));
      setDeviceStatus('Native unregistration requested. Wait for server confirmation.');
      return;
    }
    setBusy(true);
    try { await unregisterBrowserPush(options); report('This browser was unregistered on the server and unsubscribed locally.', 'info'); }
    catch (reason) { report(reason instanceof Error ? reason.message : 'Could not unregister browser push', 'error'); }
    finally { setBusy(false); }
  };

  return <div className="card stack" style={{ gap: 10 }}>
    <h3 style={{ fontSize: 16 }}>Push notifications</h3>
    <p className="small muted">Device registration and category preferences are separate. A registered subscription is not proof of delivery.</p>
    {error ? <div className="notice notice--info" role="alert">
      <p>{error}</p><button className="btn btn--secondary btn--sm" onClick={() => { setError(null); setRevision((value) => value + 1); }}>Retry</button>
    </div> : preferences ? <div className="stack" style={{ gap: 6 }}>
      {labels.map(({ key, label }) => <label className="between small" key={key} style={{ minHeight: 36, gap: 12 }}>
        <span>{label}</span><input type="checkbox" checked={preferences[key]} disabled={busy || (key !== 'pushEnabled' && !preferences.pushEnabled)} onChange={(event) => void update(key, event.target.checked)} />
      </label>)}
    </div> : <p className="small muted">Loading notification preferences…</p>}
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => void enable()}>{nativeBridge() ? 'Enable on this Android device' : 'Enable this browser'}</button>
      <button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => void disable()}>Unregister</button>
    </div>
    <p className="tiny muted" aria-live="polite">{deviceStatus}</p>
  </div>;
}
