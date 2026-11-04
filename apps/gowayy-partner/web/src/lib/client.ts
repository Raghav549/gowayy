import { createGowayyClient, createWebTokenStore } from '@gowayy/api-client';

export const tokenStore = createWebTokenStore();
export const client = createGowayyClient({ tokenStore, env: import.meta.env });
export const idemKey = (): string => `idem_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
