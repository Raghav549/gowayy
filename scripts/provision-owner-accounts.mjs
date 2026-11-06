#!/usr/bin/env node
/**
 * Provision real Supabase Auth users and roles for the three GOWAYY apps.
 * Server-side only. No credential is written to disk or printed.
 */
import { pathToFileURL } from 'node:url';

const ACCOUNTS = [
  { key: 'CUSTOMER', role: 'customer', firstName: 'GOWAYY', lastName: 'Customer' },
  { key: 'PARTNER', role: 'seller', firstName: 'GOWAYY', lastName: 'Partner' },
  { key: 'ADMIN', role: 'admin', firstName: 'GOWAYY', lastName: 'Admin' },
];

function required(name) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function validatePassword(name, password) {
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password)
    || !/\d/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
    throw new Error(`${name} must be at least 12 characters and include upper/lowercase letters, a number and a symbol`);
  }
}

async function responseJson(response, action) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.msg ?? payload.message ?? payload.error_description ?? payload.error ?? response.statusText;
    throw new Error(`${action} failed (${response.status}): ${String(message).slice(0, 300)}`);
  }
  return payload;
}

export async function provisionOwnerAccounts(fetchImpl = fetch) {
  const base = required('SUPABASE_URL').replace(/\/$/, '');
  const anonKey = required('SUPABASE_ANON_KEY');
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');
  if (anonKey === serviceKey) throw new Error('SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be different keys');
  const serviceHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' };

  async function findUser(email) {
    for (let page = 1; page <= 100; page += 1) {
      const response = await fetchImpl(`${base}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: serviceHeaders });
      const payload = await responseJson(response, `Looking up ${email}`);
      const users = Array.isArray(payload) ? payload : (payload.users ?? []);
      const match = users.find((user) => String(user.email).toLowerCase() === email.toLowerCase());
      if (match) return match;
      if (users.length < 200) return null;
    }
    throw new Error('User lookup exceeded 20,000 Auth users; provision this account through the Supabase dashboard instead');
  }

  const prepared = ACCOUNTS.map((account) => {
    const email = required(`GOWAYY_${account.key}_EMAIL`).toLowerCase();
    const password = required(`GOWAYY_${account.key}_PASSWORD`);
    validatePassword(`GOWAYY_${account.key}_PASSWORD`, password);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`GOWAYY_${account.key}_EMAIL is not a valid email address`);
    return { ...account, email, password };
  });
  const results = [];
  for (const account of prepared) {
    const { email, password } = account;
    let user = await findUser(email);
    let existed = Boolean(user);
    if (!user) {
      const response = await fetchImpl(`${base}/auth/v1/admin/users`, {
        method: 'POST', headers: serviceHeaders,
        body: JSON.stringify({
          email, password, email_confirm: true,
          user_metadata: { first_name: process.env[`GOWAYY_${account.key}_FIRST_NAME`] || account.firstName, last_name: process.env[`GOWAYY_${account.key}_LAST_NAME`] || account.lastName },
        }),
      });
      user = await responseJson(response, `Creating ${email}`);
    }
    if (!user?.id) throw new Error(`Supabase did not return an Auth user id for ${email}`);
    const firstName = process.env[`GOWAYY_${account.key}_FIRST_NAME`] || user.user_metadata?.first_name || account.firstName;
    const lastName = process.env[`GOWAYY_${account.key}_LAST_NAME`] || user.user_metadata?.last_name || account.lastName;
    const profileResponse = await fetchImpl(`${base}/rest/v1/profiles?on_conflict=id`, {
      method: 'POST', headers: { ...serviceHeaders, prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ id: user.id, first_name: firstName, last_name: lastName }),
    });
    await responseJson(profileResponse, `Upserting the profile for ${email}`);
    const roleResponse = await fetchImpl(`${base}/rest/v1/user_roles?on_conflict=user_id,role`, {
      method: 'POST', headers: { ...serviceHeaders, prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ user_id: user.id, role: account.role }),
    });
    await responseJson(roleResponse, `Assigning ${account.role} to ${email}`);

    // Confirm a real password session; do not print or persist the returned token.
    const loginResponse = await fetchImpl(`${base}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const session = await responseJson(loginResponse, `Verifying password sign-in for ${email}`);
    if (!session.access_token) throw new Error(`Supabase did not return a session for ${email}`);
    const whoResponse = await fetchImpl(`${base}/auth/v1/user`, { headers: { apikey: anonKey, authorization: `Bearer ${session.access_token}` } });
    const verified = await responseJson(whoResponse, `Verifying the session for ${email}`);
    if (verified.id !== user.id) throw new Error(`Session user mismatch for ${email}`);
    results.push({ app: account.key.toLowerCase(), email, id: user.id, role: account.role, existed });
  }
  return results;
}

async function main() {
  try {
    const results = await provisionOwnerAccounts();
    for (const result of results) {
      console.log(`OK ${result.app}: ${result.email} · ${result.role} · ${result.existed ? 'existing Auth user' : 'created Auth user'} · password session verified`);
    }
    console.log('No passwords, keys or access tokens were written to disk. The Partner seller role can create a store after business verification.');
  } catch (error) {
    console.error(`Provisioning stopped: ${error.message}`);
    console.error('No success is assumed. Fix the reported configuration/account issue and rerun; existing users are safe to look up again.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
