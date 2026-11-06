import type webpush from 'npm:web-push@3.6.7';

export interface PushDelivery {
  id: string;
  notificationId: string;
  tokenId: string;
  attempts: number;
  provider: 'expo' | 'web_push';
  platform: 'android' | 'ios' | 'web';
  token: string;
  subscription: Record<string, unknown>;
  title: string;
  body: string;
  type: string;
  data: Record<string, unknown>;
}
export interface PushOutcome {
  outcome: 'sent' | 'retry' | 'failed';
  error?: string;
  providerMessageId?: string;
  revokeToken?: boolean;
}
export interface ExpoPushOptions { enabled: boolean; accessToken?: string }
export interface WebPushOptions { subject: string; publicKey: string; privateKey: string }

const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

export function isDeviceNotRegistered(details: unknown): boolean {
  if (!details || typeof details !== 'object') return false;
  return (details as { error?: string }).error === 'DeviceNotRegistered';
}

/** A push is sent only when Expo returns an explicit successful ticket. */
export async function sendExpoPush(
  delivery: Pick<PushDelivery, 'token' | 'title' | 'body' | 'type' | 'data' | 'notificationId'>,
  options: ExpoPushOptions,
  fetcher: typeof fetch = fetch,
): Promise<PushOutcome> {
  if (!options.enabled) return { outcome: 'retry', error: 'Expo push is not configured' };
  try {
    const response = await fetcher('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', accept: 'application/json',
        ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
      },
      body: JSON.stringify({
        to: delivery.token, title: delivery.title, body: delivery.body,
        data: { ...delivery.data, notificationId: delivery.notificationId, type: delivery.type },
        sound: 'default', priority: 'high', channelId: 'gowayy-updates', ttl: 3600,
      }),
    });
    if (!response.ok) return { outcome: 'retry', error: `Expo push HTTP ${response.status}` };
    const payload = await response.json() as { data?: { status?: string; id?: string; message?: string; details?: unknown } | Array<{ status?: string; id?: string; message?: string; details?: unknown }> };
    const ticket = Array.isArray(payload.data) ? payload.data[0] : payload.data;
    if (ticket?.status === 'ok' && ticket.id) return { outcome: 'sent', providerMessageId: ticket.id };
    if (isDeviceNotRegistered(ticket?.details)) return { outcome: 'failed', error: ticket?.message ?? 'DeviceNotRegistered', revokeToken: true };
    return { outcome: 'retry', error: ticket?.message ?? 'Expo returned no successful push ticket' };
  } catch (error) {
    return { outcome: 'retry', error: message(error) };
  }
}

/** Standards-based browser push. VAPID private keys never leave this module. */
export async function sendWebPush(
  delivery: Pick<PushDelivery, 'subscription' | 'title' | 'body' | 'type' | 'data' | 'notificationId'>,
  options: WebPushOptions,
  sender?: (subscription: webpush.PushSubscription, payload: string, options: webpush.RequestOptions) => Promise<webpush.SendResult>,
): Promise<PushOutcome> {
  if (!options.subject || !options.publicKey || !options.privateKey) return { outcome: 'retry', error: 'Web Push VAPID is not configured' };
  try {
    const send = sender ?? (async (subscription: webpush.PushSubscription, payload: string, requestOptions: webpush.RequestOptions) => {
      const { default: webpush } = await import('npm:web-push@3.6.7');
      webpush.setVapidDetails(options.subject, options.publicKey, options.privateKey);
      return await webpush.sendNotification(subscription, payload, requestOptions);
    });
    const result = await send(delivery.subscription as webpush.PushSubscription, JSON.stringify({
      title: delivery.title, body: delivery.body,
      data: { ...delivery.data, notificationId: delivery.notificationId, type: delivery.type },
    }), { TTL: 3600, urgency: 'normal' });
    if (result.statusCode >= 200 && result.statusCode < 300) return { outcome: 'sent', providerMessageId: result.headers.location };
    if (result.statusCode === 404 || result.statusCode === 410) return { outcome: 'failed', error: `Web Push subscription expired (${result.statusCode})`, revokeToken: true };
    if (result.statusCode === 429 || result.statusCode >= 500) return { outcome: 'retry', error: `Web Push HTTP ${result.statusCode}` };
    return { outcome: 'failed', error: `Web Push rejected the request (${result.statusCode})` };
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) return { outcome: 'failed', error: `Web Push subscription expired (${status})`, revokeToken: true };
    return { outcome: status && status < 500 && status !== 429 ? 'failed' : 'retry', error: message(error) };
  }
}

export async function dispatchPush(delivery: PushDelivery, options: { expo: ExpoPushOptions; web: WebPushOptions }): Promise<PushOutcome> {
  return delivery.provider === 'expo' ? sendExpoPush(delivery, options.expo) : sendWebPush(delivery, options.web);
}
