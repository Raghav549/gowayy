import { requestPhoneOtp, verifyPhoneOtp } from '../_shared/supabase.ts';
import { sendExpoPush, sendWebPush } from '../_shared/push.ts';
import { HttpError } from '../_shared/config.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
async function rejects(promise: Promise<unknown>, code: string): Promise<void> {
  try { await promise; } catch (error) {
    assert(error instanceof HttpError, 'expected HttpError');
    equal(error.code, code, 'error code');
    return;
  }
  throw new Error(`Expected ${code}`);
}
function configure(): void {
  Deno.env.set('SUPABASE_URL', 'https://project.example.test');
  Deno.env.set('SUPABASE_ANON_KEY', 'public-anon-test');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-secret-test');
}

Deno.test('Supabase phone OTP uses Auth endpoints and never exposes the service key', async () => {
  configure();
  const original = globalThis.fetch;
  const calls: Array<{ url: string; body: Record<string, unknown>; apikey: string; authorization?: string }> = [];
  try {
    globalThis.fetch = (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, body: JSON.parse(String(init?.body)), apikey: headers.get('apikey') ?? '', authorization: headers.get('authorization') ?? undefined });
      if (url.endsWith('/auth/v1/otp')) return Promise.resolve(new Response('{}', { status: 200 }));
      return Promise.resolve(Response.json({ access_token: 'verified-user-jwt', refresh_token: 'refresh', expires_in: 3600, user: { id: 'user-1', phone: '+919876543210' } }));
    };
    await requestPhoneOtp('+919876543210');
    const session = await verifyPhoneOtp('+919876543210', '123456');
    equal(session.access_token, 'verified-user-jwt', 'verified session');
    equal(calls[0].url, 'https://project.example.test/auth/v1/otp', 'request URL');
    equal(calls[0].body, { phone: '+919876543210', create_user: true, options: { channel: 'sms' } }, 'SMS request');
    equal(calls[1].body, { phone: '+919876543210', token: '123456', type: 'sms' }, 'verification request');
    assert(calls.every((call) => call.apikey === 'public-anon-test' && !call.authorization), 'only the public Auth key is used for phone Auth');
  } finally { globalThis.fetch = original; }
});

Deno.test('phone provider rejection and invalid codes are honest errors', async () => {
  configure();
  const original = globalThis.fetch;
  try {
    globalThis.fetch = () => Promise.resolve(new Response('{}', { status: 500 }));
    await rejects(requestPhoneOtp('+919876543210'), 'PHONE_OTP_DELIVERY_FAILED');
    globalThis.fetch = () => Promise.resolve(new Response('{}', { status: 403 }));
    await rejects(verifyPhoneOtp('+919876543210', '000000'), 'INVALID_PHONE_OTP');
  } finally { globalThis.fetch = original; }
});

Deno.test('Expo dispatch requires a success ticket and revokes unregistered devices', async () => {
  const delivery = { token: 'ExponentPushToken[test]', title: 'Booking', body: 'Confirmed', type: 'booking.confirmed', data: {}, notificationId: 'notification-1' };
  let requested = 0;
  const disabled = await sendExpoPush(delivery, { enabled: false }, () => { requested += 1; return Promise.resolve(new Response()); });
  equal(disabled.outcome, 'retry', 'unconfigured provider');
  equal(requested, 0, 'no fake provider request');

  const sent = await sendExpoPush(delivery, { enabled: true, accessToken: 'expo-server-token' }, (_input, init) => {
    const body = JSON.parse(String(init?.body));
    equal(body.to, delivery.token, 'device token');
    equal(body.data.notificationId, delivery.notificationId, 'notification correlation');
    equal(new Headers(init?.headers).get('authorization'), 'Bearer expo-server-token', 'server provider token');
    return Promise.resolve(Response.json({ data: { status: 'ok', id: 'expo-ticket-1' } }));
  });
  equal(sent, { outcome: 'sent', providerMessageId: 'expo-ticket-1' }, 'successful provider receipt');

  const expired = await sendExpoPush(delivery, { enabled: true }, () => Promise.resolve(Response.json({ data: { status: 'error', message: 'Device not registered', details: { error: 'DeviceNotRegistered' } } })));
  equal(expired.outcome, 'failed', 'terminal device failure');
  equal(expired.revokeToken, true, 'revoke terminal device');
});

Deno.test('Web Push sender receives only the public payload and handles expiry', async () => {
  const delivery = {
    subscription: { endpoint: 'https://push.example.test/subscription', keys: { auth: 'auth', p256dh: 'key' } },
    title: 'Order', body: 'Delivered', type: 'order.delivered', data: { reference: 'GW-1' }, notificationId: 'notification-2',
  };
  const options = { subject: 'mailto:ops@example.test', publicKey: 'public-vapid', privateKey: 'private-vapid' };
  const sent = await sendWebPush(delivery, options, (_subscription, payload) => {
    const parsed = JSON.parse(payload);
    equal(parsed.title, 'Order', 'push title');
    equal(parsed.data.reference, 'GW-1', 'push data');
    assert(!payload.includes('private-vapid'), 'private VAPID material is never in the payload');
    return Promise.resolve({ statusCode: 201, body: '', headers: { location: 'receipt-1' } });
  });
  equal(sent, { outcome: 'sent', providerMessageId: 'receipt-1' }, 'Web Push receipt');
  const expired = await sendWebPush(delivery, options, () => Promise.resolve({ statusCode: 410, body: '', headers: {} }));
  equal(expired.outcome, 'failed', 'expired subscription');
  equal(expired.revokeToken, true, 'expired subscription revoked');
});
