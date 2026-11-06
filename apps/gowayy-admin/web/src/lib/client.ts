import { createGowayyClient, createWebTokenStore } from '@gowayy/api-client';

export const tokenStore = createWebTokenStore();
export const client = createGowayyClient({ tokenStore, env: import.meta.env });

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** Thin wrapper over the secured /api/admin surface. Every call carries the admin bearer token. */
export async function admin<T = unknown>(path: string, options: { method?: Method; body?: unknown } = {}): Promise<T> {
  if (client.adminRequest) return client.adminRequest<T>(path, options);
  const token = tokenStore.get();
  const response = await fetch(`${client.baseUrl}/admin${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) tokenStore.set(null);
    throw new Error((payload as { message?: string } | null)?.message ?? `Request failed (${response.status})`);
  }
  return payload as T;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
