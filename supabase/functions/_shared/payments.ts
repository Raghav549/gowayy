import { config, HttpError } from './config.ts';
import { serviceRpc } from './supabase.ts';
import { camelize } from './normalize.ts';

type A = Record<string, any>;

function razorpayCredentials(): { keyId: string; keySecret: string } {
  const { razorpayKeyId, razorpayKeySecret } = config();
  if (!razorpayKeyId || !razorpayKeySecret) {
    throw new HttpError(503, 'GATEWAY_NOT_CONFIGURED', 'Razorpay requires GOWAYY_RAZORPAY_KEY_ID and GOWAYY_RAZORPAY_KEY_SECRET on the API server.');
  }
  return { keyId: razorpayKeyId, keySecret: razorpayKeySecret };
}

async function razorpayRequest(path: string, method: 'POST', body: Record<string, unknown>): Promise<A> {
  const { keyId, keySecret } = razorpayCredentials();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({})) as A;
  if (!response.ok) {
    const description = payload.error?.description ?? payload.error?.message ?? 'Razorpay rejected the request.';
    throw new HttpError(502, 'PAYMENT_PROVIDER_REJECTED', String(description));
  }
  return payload;
}

/** Creates a provider order only after our server-priced payment row exists. */
export async function preparePayment(payment: A): Promise<A> {
  if (payment.provider !== 'razorpay' || payment.method === 'cash') return payment;
  let providerOrderId = typeof payment.providerReference === 'string' && payment.providerReference.startsWith('order_')
    ? payment.providerReference : '';
  if (!providerOrderId) {
    const order = await razorpayRequest('/orders', 'POST', {
      amount: payment.amountPaise,
      currency: 'INR',
      receipt: payment.id,
      notes: { gowayyPaymentId: payment.id },
    });
    providerOrderId = String(order.id ?? '');
    await serviceRpc('rpc_attach_payment_provider', {
      p_payment_id: payment.id, p_reference: providerOrderId, p_payload: order,
    });
  }
  const { keyId } = razorpayCredentials();
  // The key ID is public checkout configuration. The key secret never leaves the Edge function.
  return { ...payment, providerReference: providerOrderId, keyId, providerOrderId, currency: 'INR' };
}

/**
 * Submits an already-persisted refund request. A provider outage does not turn a
 * pending request into a success or undo the related cancellation.
 */
export async function processRefundResult(result: A): Promise<A> {
  const refund = result?.refund as A | undefined;
  const payment = result?.payment as A | undefined;
  if (!refund?.id || !payment || refund.status !== 'pending') return result;
  try {
    if (payment.provider === 'sandbox') {
      const completed = camelize(await serviceRpc<A>('rpc_complete_sandbox_refund', { p_refund_id: refund.id })) as A;
      return { ...result, ...completed, pending: false, sandbox: true, note: 'Demo refund completed; no real money moved.' };
    }
    if (payment.provider !== 'razorpay') {
      return { ...result, pending: true, note: 'Refund request recorded. No supported live provider is configured to process it yet.' };
    }
    if (typeof payment.providerReference !== 'string' || !payment.providerReference.startsWith('pay_')) {
      return { ...result, pending: true, note: 'Refund is waiting for a captured provider payment reference.' };
    }
    const providerRefund = await razorpayRequest(`/payments/${encodeURIComponent(payment.providerReference)}/refunds`, 'POST', {
      amount: refund.amountPaise,
      speed: 'normal',
      notes: { gowayyRefundId: refund.id },
    });
    const updated = camelize(await serviceRpc<A>('rpc_provider_refund_update', {
      p_refund_id: refund.id,
      p_reference: String(providerRefund.id ?? ''),
      p_status: String(providerRefund.status ?? 'pending'),
      p_payload: providerRefund,
    })) as A;
    return {
      ...result, ...updated,
      pending: updated.refund?.status !== 'succeeded',
      note: updated.refund?.status === 'succeeded' ? 'Refund confirmed by Razorpay.' : 'Razorpay accepted the refund; it is pending provider confirmation.',
    };
  } catch (error) {
    return {
      ...result,
      pending: true,
      note: `Refund request remains pending: ${error instanceof Error ? error.message : 'the provider could not be reached'}`,
    };
  }
}
