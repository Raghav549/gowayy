import type { Payment } from '@gowayy/types';
import { client } from './client';

export type PaymentAction = Payment & {
  keyId?: string;
  providerOrderId?: string;
  currency?: string;
};

type RazorpayInstance = {
  open: () => void;
  on: (event: string, callback: (response: { error?: { description?: string } }) => void) => void;
};
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window { Razorpay?: RazorpayConstructor }
}

let checkoutScript: Promise<void> | null = null;
function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScript) return checkoutScript;
  checkoutScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { checkoutScript = null; reject(new Error('Razorpay Checkout could not be loaded. Check your connection and retry.')); };
    document.head.appendChild(script);
  });
  return checkoutScript;
}

/** Returns "captured" only after server confirmation; a browser callback is pending. */
export async function completePayment(payment: PaymentAction, description: string): Promise<'captured' | 'pending'> {
  if (payment.method === 'cash') throw new Error('Pay-later is already recorded for this order. Contact support to change the payment method.');
  if (payment.provider === 'sandbox') {
    const result = await client.captureSandboxPayment(payment.id);
    if (result.payment.status !== 'captured') throw new Error('Payment was not confirmed by the server. Your order is saved; retry from Orders.');
    return 'captured';
  }
  if (payment.provider !== 'razorpay') {
    throw new Error('This payment provider is not supported by the customer checkout. Your order remains saved and unpaid.');
  }
  if (!payment.keyId || !payment.providerOrderId) throw new Error('The server did not return a provider order. Retry payment from Orders.');
  await loadRazorpay();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error('Razorpay Checkout is unavailable. Retry from Orders.');
  return await new Promise<'pending'>((resolve, reject) => {
    const checkout = new Razorpay({
      key: payment.keyId,
      order_id: payment.providerOrderId,
      amount: payment.amountPaise,
      currency: payment.currency ?? 'INR',
      name: 'GOWAYY',
      description,
      retry: { enabled: true },
      handler: () => resolve('pending'),
      modal: { ondismiss: () => reject(new Error('Payment was not completed. Your order is saved and you can retry from Orders.')) },
    });
    checkout.on('payment.failed', (response) => reject(new Error(response.error?.description ?? 'The provider could not complete payment. Your order is saved.')));
    checkout.open();
  });
}
