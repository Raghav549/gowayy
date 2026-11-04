import { createGowayyClient, createWebTokenStore } from '@gowayy/api-client';

export const tokenStore = createWebTokenStore();
export const client = createGowayyClient({ tokenStore, env: import.meta.env });

/**
 * Booking handoff to the GOWAYY customer app. In the monorepo dev setup this is
 * the customer web app URL; in production it is the deployed GOWAYY web app,
 * and on Android it can be a gowayy:// deep link. The same backend means the
 * booking created there appears in the customer's GOWAYY journey instantly.
 */
const GOWAYY_APP_URL = (import.meta.env.VITE_GOWAYY_APP_URL as string | undefined) ?? (import.meta.env.DEV ? 'http://localhost:5173' : 'https://gowayy.vercel.app');
export function handoff(path: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${GOWAYY_APP_URL}${path}${sep}source=explore`;
}
