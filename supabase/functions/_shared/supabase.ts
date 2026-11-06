/** Thin Supabase REST helpers. No external SDK, no client-side service keys. */
import { config, HttpError } from './config.ts';

export interface Caller {
  id: string;
  email: string;
  token: string;
}

export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] ?? null;
}

/** Verifies the caller's JWT with Supabase Auth instead of trusting a client user id. */
export async function requireCaller(req: Request): Promise<Caller> {
  const token = bearer(req);
  if (!token) throw new HttpError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  const { url, anonKey } = config();
  const r = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new HttpError(401, 'INVALID_SESSION', 'Your session expired. Please sign in again.');
  const user = await r.json() as { id?: string; email?: string };
  if (!user.id) throw new HttpError(401, 'INVALID_SESSION', 'Your session expired. Please sign in again.');
  // Auth validity alone is insufficient: suspended/deleted profiles must lose
  // access to every protected operation, not only to particular UI routes.
  await rpc('gowayy_assert_active', {}, token);
  return { id: user.id, email: user.email ?? '', token };
}

interface FetchOptions {
  token?: string;
  service?: boolean;
  method?: string;
  body?: unknown;
}

async function call(path: string, opts: FetchOptions = {}): Promise<Response> {
  const { url, anonKey, serviceKey } = config();
  const key = opts.service ? serviceKey : anonKey;
  const auth = opts.service ? serviceKey : opts.token;
  const headers: Record<string, string> = {
    apikey: key,
    'content-type': 'application/json',
    'prefer': 'return=representation',
  };
  if (auth) headers.authorization = `Bearer ${auth}`;
  const r = await fetch(`${url}${path}`, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  if (!r.ok) {
    let message = `Supabase request failed (${r.status})`;
    try {
      const payload = await r.json() as { message?: string; hint?: string; details?: unknown };
      message = payload.message ?? message;
      if (payload.hint && Deno.env.get('GOWAYY_DEBUG') === 'true') message += ` — ${payload.hint}`;
    } catch { /* non-JSON error */ }
    throw new HttpError(r.status >= 400 && r.status < 500 ? r.status : 502, 'BACKEND_REJECTED', message);
  }
  return r;
}

async function json<T>(path: string, opts: FetchOptions): Promise<T> {
  const r = await call(path, opts);
  const text = await r.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** PostgREST read with the caller's token: RLS is enforced by PostgreSQL. */
export async function select<T>(table: string, query: string, token: string): Promise<T[]> {
  return await json<T[]>(`/rest/v1/${table}?${query}`, { token });
}

export async function insert<T>(table: string, body: unknown, token: string): Promise<T> {
  const out = await json<T[]>(`/rest/v1/${table}`, { token, method: 'POST', body });
  return Array.isArray(out) ? out[0] : out;
}

export async function patch<T>(table: string, query: string, body: unknown, token: string): Promise<T> {
  const out = await json<T[]>(`/rest/v1/${table}?${query}`, { token, method: 'PATCH', body });
  return Array.isArray(out) ? out[0] : out;
}

export async function remove(table: string, query: string, token: string): Promise<void> {
  await call(`/rest/v1/${table}?${query}`, { token, method: 'DELETE' });
}

/** SECURITY DEFINER RPC with the caller's JWT so auth.uid() is the verified user. */
export async function rpc<T>(name: string, args: Record<string, unknown>, token: string): Promise<T> {
  return await json<T>(`/rest/v1/rpc/${name}`, { token, method: 'POST', body: args });
}

/** Server-only RPC, used after verifying a signature or an OTP. Never callable by clients. */
export async function serviceRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  return await json<T>(`/rest/v1/rpc/${name}`, { service: true, method: 'POST', body: args });
}

/** Supabase Auth admin operations (server-side only). */
export async function authAdmin<T>(path: string, method: string, body?: unknown): Promise<T> {
  const { url, serviceKey, anonKey } = config();
  const r = await fetch(`${url}/auth/v1${path}`, {
    method,
    headers: { apikey: anonKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) {
    const payload = await r.json().catch(() => ({})) as { msg?: string; message?: string };
    throw new HttpError(r.status, 'AUTH_ADMIN_FAILED', payload.msg ?? payload.message ?? 'Auth operation failed.');
  }
  return await r.json() as T;
}

export async function passwordLogin(email: string, password: string): Promise<{
  access_token: string; refresh_token: string; expires_in: number;
  user: { id: string; email?: string; created_at?: string };
}> {
  const { url, anonKey } = config();
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  return await r.json();
}

export async function authLogout(token: string): Promise<void> {
  const { url, anonKey } = config();
  await fetch(`${url}/auth/v1/logout`, {
    method: 'POST', headers: { apikey: anonKey, authorization: `Bearer ${token}` },
  }).catch(() => { /* session already expired */ });
}

/** RPC callable before sign-in (catalog, registration, OTP). Uses the anon role. */
export async function publicRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { anonKey } = config();
  return await json<T>(`/rest/v1/rpc/${name}`, { token: anonKey, method: 'POST', body: args });
}
