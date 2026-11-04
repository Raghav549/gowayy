import { client, tokenStore } from './client';

/**
 * Invoice download. The PDF is generated server-side from trusted order data and
 * requires the signed-in customer's bearer token, so it is fetched as a blob
 * (never a public URL) and saved with the order reference as the filename.
 */
export async function downloadInvoice(kind: 'orders' | 'bookings', id: string, reference?: string): Promise<void> {
  const token = tokenStore.get();
  const response = await fetch(`${client.baseUrl}/${kind}/${encodeURIComponent(id)}/invoice`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message ?? 'Invoice could not be downloaded.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `GOWAYY-invoice-${reference ?? id}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
