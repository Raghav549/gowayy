import { describe, expect, it, vi } from 'vitest';
import {
  createHttpTransport, createMemoryTokenStore, createWebTokenStore, ApiError, supabaseConfigured,
  createSupabaseTransport,
} from '@gowayy/api-client';

function mockFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift() ?? { status: 200, body: {} };
    return {
      ok: (next.status ?? 200) >= 200 && (next.status ?? 200) < 300,
      status: next.status ?? 200,
      json: async () => next.body,
    } as unknown as Response;
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

describe('shared API client contract', () => {
  it('sends bearer tokens and idempotency keys from the injected store', async () => {
    const store = createMemoryTokenStore('tok_abc');
    const { fn, calls } = mockFetch([{ body: { booking: { id: 'bkg_1' } } }]);
    const client = createHttpTransport({ baseUrl: 'http://api.test', tokenStore: store, fetchImpl: fn });
    await client.bookCab({ pickupId: 'a' }, 'idem_key_12345');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok_abc');
    expect(headers['idempotency-key']).toBe('idem_key_12345');
    expect(calls[0].url).toBe('http://api.test/bookings/cab');
    expect(calls[0].init.method).toBe('POST');
  });

  it('maps server errors to typed ApiError with details and never swallows them', async () => {
    const { fn } = mockFetch([{ status: 409, body: { error: 'NO_AVAILABILITY', message: 'No rooms left', details: [{ path: 'checkIn' }] } }]);
    const client = createHttpTransport({ baseUrl: 'http://api.test', tokenStore: createMemoryTokenStore(), fetchImpl: fn });
    await expect(client.bookStay({}, 'idem_key_12345')).rejects.toMatchObject({
      name: 'ApiError', status: 409, code: 'NO_AVAILABILITY', message: 'No rooms left',
    });
  });

  it('reports network failures with an actionable message', async () => {
    const failing = vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const client = createHttpTransport({ baseUrl: 'http://api.test', tokenStore: createMemoryTokenStore(), fetchImpl: failing });
    await expect(client.health()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('assembles the catalogue bundle from all eleven collections in one pass', async () => {
    const { fn, calls } = mockFetch(Array.from({ length: 11 }, () => ({ body: { items: [{ id: 'x' }] } })));
    const client = createHttpTransport({ baseUrl: 'http://api.test', tokenStore: createMemoryTokenStore(), fetchImpl: fn });
    const bundle = await client.catalog();
    expect(calls).toHaveLength(11);
    expect(Object.keys(bundle).sort()).toEqual([
      'attractions', 'destinations', 'experiences', 'hiddenGems', 'packages', 'places',
      'properties', 'restaurants', 'sharedRoutes', 'stores', 'vehicles',
    ].sort());
    expect(bundle.destinations).toHaveLength(1);
  });

  it('web token store persists and clears tokens', () => {
    const store = createWebTokenStore();
    expect(store.get()).toBeNull();
    store.set('tok_xyz');
    expect(store.get()).toBe('tok_xyz');
    store.set(null);
    expect(store.get()).toBeNull();
  });

  it('Supabase transport is opt-in and refuses to pretend it is connected', async () => {
    expect(supabaseConfigured({})).toBe(false);
    expect(supabaseConfigured({ VITE_GOWAYY_BACKEND: 'supabase', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' })).toBe(true);
    expect(() => createSupabaseTransport({ url: '', anonKey: '', tokenStore: createMemoryTokenStore() })).toThrow(/not configured/i);
    const t = createSupabaseTransport({ url: 'https://x.supabase.co', anonKey: 'anon', tokenStore: createMemoryTokenStore() });
    expect(t.baseUrl).toContain('/functions/v1/gowayy-api');
    // Every method is implemented through the gateway; unsupported operations
    // still fail loudly with a server error instead of returning fake data.
    const fetchStub = vi.fn(async (_url: unknown, _init?: unknown) => ({
      ok: false, status: 501,
      json: async () => ({ error: 'NOT_AVAILABLE', message: 'The development reset endpoint does not exist on the Supabase backend.' }),
    }) as unknown as Response);
    vi.stubGlobal('fetch', fetchStub);
    await expect(t.resetDev()).rejects.toBeInstanceOf(ApiError);
    expect(fetchStub).toHaveBeenCalled();
    const secondArg = fetchStub.mock.calls[0]?.[1] as { body?: string } | undefined;
    const request = JSON.parse(String(secondArg?.body)) as { op: string };
    expect(request.op).toBe('resetDev');
    vi.unstubAllGlobals();
  });
});
