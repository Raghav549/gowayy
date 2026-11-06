import { afterEach, describe, expect, it, vi } from 'vitest';
import { provisionOwnerAccounts } from '../../scripts/provision-owner-accounts.mjs';

const ENV = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-anon-key', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  GOWAYY_CUSTOMER_EMAIL: 'customer@example.com', GOWAYY_CUSTOMER_PASSWORD: 'Customer!Test123',
  GOWAYY_PARTNER_EMAIL: 'partner@example.com', GOWAYY_PARTNER_PASSWORD: 'Partner!Test123',
  GOWAYY_ADMIN_EMAIL: 'admin@example.com', GOWAYY_ADMIN_PASSWORD: 'Admin!Test1234',
};
afterEach(() => vi.unstubAllEnvs());

function stubEnv() { for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value); }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('secure owner provisioning', () => {
  it('creates real API-shaped users, assigns roles and verifies each password session', async () => {
    stubEnv();
    const ids = new Map(); const roles = []; let sequence = 0;
    const fetchMock = vi.fn(async (input, init = {}) => {
      const url = new URL(input);
      if (url.pathname === '/auth/v1/admin/users' && init.method !== 'POST') return json({ users: [] });
      if (url.pathname === '/auth/v1/admin/users' && init.method === 'POST') {
        const body = JSON.parse(init.body); const id = `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
        ids.set(body.email, id); return json({ id, email: body.email, user_metadata: body.user_metadata });
      }
      if (url.pathname === '/rest/v1/profiles') return json([JSON.parse(init.body)]);
      if (url.pathname === '/rest/v1/user_roles') { const body = JSON.parse(init.body); roles.push(body); return json([body]); }
      if (url.pathname === '/auth/v1/token') { const body = JSON.parse(init.body); return json({ access_token: `session-${ids.get(body.email)}` }); }
      if (url.pathname === '/auth/v1/user') {
        const id = init.headers.authorization.replace('Bearer session-', ''); return json({ id });
      }
      throw new Error(`Unexpected request: ${init.method ?? 'GET'} ${url}`);
    });
    const results = await provisionOwnerAccounts(fetchMock);
    expect(results.map((result) => result.role)).toEqual(['customer', 'seller', 'admin']);
    expect(results.every((result) => !result.existed)).toBe(true);
    expect(roles.map((role) => role.role)).toEqual(['customer', 'seller', 'admin']);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/auth/v1/token'))).toHaveLength(3);
  });

  it('rejects weak owner passwords before making an Auth request', async () => {
    stubEnv(); vi.stubEnv('GOWAYY_ADMIN_PASSWORD', 'weak');
    const fetchMock = vi.fn();
    await expect(provisionOwnerAccounts(fetchMock)).rejects.toThrow(/at least 12 characters/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
