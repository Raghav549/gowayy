/** Authenticated database-webhook/cron entry point for durable push deliveries. */
import { config, errorResponse, jsonResponse, HttpError } from '../_shared/config.ts';
import { serviceRpc } from '../_shared/supabase.ts';
import { dispatchPush, type PushDelivery } from '../_shared/push.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return jsonResponse({ ok: true });
  if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, 405);
  try {
    const configured = config();
    if (!configured.pushDispatchSecret) {
      throw new HttpError(503, 'PUSH_DISPATCH_NOT_CONFIGURED', 'Set GOWAYY_PUSH_DISPATCH_SECRET before enabling push dispatch.');
    }
    const supplied = request.headers.get('x-gowayy-push-key')
      ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
      ?? '';
    if (supplied !== configured.pushDispatchSecret) throw new HttpError(401, 'PUSH_DISPATCH_UNAUTHORIZED', 'Valid dispatch credentials are required.');

    const claimed = await serviceRpc<PushDelivery[]>('rpc_claim_push_deliveries', { p_limit: 50 });
    const counts = { claimed: claimed.length, sent: 0, retry: 0, failed: 0, finishErrors: 0 };
    await Promise.all(claimed.map(async (delivery) => {
      const result = await dispatchPush(delivery, {
        expo: { enabled: configured.expoPushEnabled, accessToken: configured.expoAccessToken },
        web: { subject: configured.vapidSubject, publicKey: configured.vapidPublicKey, privateKey: configured.vapidPrivateKey },
      });
      counts[result.outcome] += 1;
      try {
        await serviceRpc('rpc_finish_push_delivery', {
          p_id: delivery.id,
          p_outcome: result.outcome,
          p_error: result.error ?? null,
          p_provider_message_id: result.providerMessageId ?? null,
          p_revoke_token: result.revokeToken === true,
        });
      } catch (error) {
        counts.finishErrors += 1;
        console.error('could not finish push delivery', delivery.id, error);
      }
    }));
    // Counts describe provider responses only. A retry is not a delivered push.
    return jsonResponse({ data: counts });
  } catch (error) {
    return errorResponse(error);
  }
});
