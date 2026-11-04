/** Server-side configuration only. The service-role key never reaches a client bundle. */
export interface EdgeConfig {
  url: string;
  anonKey: string;
  serviceKey: string;
  webhookSecret: string;
  otpProviderUrl: string;
}

export function config(): EdgeConfig {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !anonKey || !serviceKey) {
    throw new Error('Edge function misconfigured: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  return {
    url: url.replace(/\/$/, ''), anonKey, serviceKey,
    webhookSecret: Deno.env.get('GOWAYY_PAYMENT_WEBHOOK_SECRET') ?? '',
    otpProviderUrl: Deno.env.get('GOWAYY_EMAIL_PROVIDER_URL') ?? '',
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization, apikey, idempotency-key, x-gowayy-signature',
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    },
  });
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = 'HttpError';
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse({ error: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) }, error.status);
  }
  console.error('gowayy edge error', error);
  return jsonResponse({ error: 'INTERNAL_ERROR', message: 'The GOWAYY service could not complete this request.' }, 500);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const text = await req.text();
    if (!text) return {};
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Malformed JSON body.');
  }
}
