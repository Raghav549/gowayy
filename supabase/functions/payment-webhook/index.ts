/**
 * Verified payment webhook. Client-side payment success is never trusted: only a
 * request with a valid HMAC-SHA256 signature may call rpc_webhook_capture, which is
 * a server-only SECURITY DEFINER function.
 */
import { config, jsonResponse, errorResponse, HttpError } from '../_shared/config.ts';
import { serviceRpc } from '../_shared/supabase.ts';

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifySignature(raw: string, provided: string, secret: string): Promise<boolean> {
  if (!provided || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const hex = Array.from(expected, (b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(new TextEncoder().encode(hex.toLowerCase()), new TextEncoder().encode(provided.trim().toLowerCase()));
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const { webhookSecret } = config();
    if (!webhookSecret) throw new HttpError(503, 'WEBHOOK_NOT_CONFIGURED', 'GOWAYY_PAYMENT_WEBHOOK_SECRET is not configured.');
    const raw = await req.text();
    const signature = req.headers.get('x-gowayy-signature') ?? '';
    if (!await verifySignature(raw, signature, webhookSecret)) {
      throw new HttpError(401, 'INVALID_SIGNATURE', 'Webhook signature verification failed.');
    }
    let event: Record<string, unknown>;
    try { event = JSON.parse(raw) as Record<string, unknown>; }
    catch { throw new HttpError(400, 'INVALID_JSON', 'Malformed webhook payload.'); }
    const eventId = typeof event.eventId === 'string' ? event.eventId : '';
    const paymentId = typeof event.paymentId === 'string' ? event.paymentId : null;
    if (!eventId || eventId.length < 4) throw new HttpError(400, 'EVENT_ID_REQUIRED', 'eventId is required.');
    const result = await serviceRpc<Record<string, unknown>>('rpc_webhook_capture', {
      p_event_id: eventId,
      p_payload: {
        paymentId, providerReference: event.providerReference ?? null,
        provider: event.provider ?? 'sandbox', signatureVerified: true,
      },
    });
    return jsonResponse({ received: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
});
