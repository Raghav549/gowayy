/**
 * Verified payment webhook. Browser payment callbacks are never trusted. Both the
 * original provider-neutral envelope and Razorpay's signed envelope are supported;
 * the configured provider determines which signature header is accepted.
 */
import { config, jsonResponse, errorResponse, HttpError } from '../_shared/config.ts';
import { serviceRpc } from '../_shared/supabase.ts';

type A = Record<string, any>;

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
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

function entity(event: A, kind: 'payment' | 'refund'): A {
  const value = event.payload?.[kind]?.entity;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'PROVIDER_ENTITY_REQUIRED', `Razorpay ${kind} entity is required.`);
  return value as A;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const { webhookSecret, paymentProvider } = config();
    if (!webhookSecret) throw new HttpError(503, 'WEBHOOK_NOT_CONFIGURED', 'GOWAYY_PAYMENT_WEBHOOK_SECRET is not configured.');
    const raw = await req.text();
    const razorpay = paymentProvider === 'razorpay';
    const signature = req.headers.get(razorpay ? 'x-razorpay-signature' : 'x-gowayy-signature') ?? '';
    if (!await verifySignature(raw, signature, webhookSecret)) {
      throw new HttpError(401, 'INVALID_SIGNATURE', 'Webhook signature verification failed.');
    }
    let event: A;
    try { event = JSON.parse(raw) as A; }
    catch { throw new HttpError(400, 'INVALID_JSON', 'Malformed webhook payload.'); }
    const eventId = (razorpay ? req.headers.get('x-razorpay-event-id') : null) ?? (typeof event.eventId === 'string' ? event.eventId : '');
    if (!eventId || eventId.length < 4) throw new HttpError(400, 'EVENT_ID_REQUIRED', 'A provider event id is required.');

    if (razorpay) {
      const eventType = String(event.event ?? '');
      if (eventType === 'payment.captured') {
        const payment = entity(event, 'payment');
        const result = await serviceRpc<A>('rpc_webhook_capture', {
          p_event_id: eventId,
          p_payload: {
            paymentId: payment.notes?.gowayyPaymentId ?? null,
            providerOrderId: payment.order_id ?? null,
            providerReference: payment.id ?? null,
            provider: 'razorpay', signatureVerified: true,
          },
        });
        return jsonResponse({ received: true, ...result });
      }
      if (eventType === 'payment.failed') {
        const payment = entity(event, 'payment');
        const result = await serviceRpc<A>('rpc_webhook_payment_failed', {
          p_event_id: eventId,
          p_payload: {
            paymentId: payment.notes?.gowayyPaymentId ?? null,
            providerOrderId: payment.order_id ?? null,
            provider: 'razorpay', signatureVerified: true,
          },
        });
        return jsonResponse({ received: true, ...result });
      }
      if (eventType === 'refund.processed' || eventType === 'refund.failed') {
        const refund = entity(event, 'refund');
        const result = await serviceRpc<A>('rpc_webhook_refund', {
          p_event_id: eventId,
          p_payload: {
            providerPaymentId: refund.payment_id ?? null,
            providerReference: refund.id ?? null,
            status: eventType === 'refund.failed' ? 'failed' : 'processed',
            provider: 'razorpay', signatureVerified: true,
          },
        });
        return jsonResponse({ received: true, ...result });
      }
      return jsonResponse({ received: true, ignored: true, event: eventType });
    }

    const paymentId = typeof event.paymentId === 'string' ? event.paymentId : null;
    const result = await serviceRpc<A>('rpc_webhook_capture', {
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
