/**
 * Small persistent key/value layer. Expo Secure Store on native, localStorage on web.
 * A synchronous in-memory cache is hydrated once at startup so Zustand stores can
 * initialise without a flash of the wrong theme or onboarding state.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const cache = new Map<string, unknown>();

export function readStored<T>(key: string, fallback: T): T {
  return cache.has(key) ? (cache.get(key) as T) : fallback;
}

export async function writeStored(key: string, value: unknown): Promise<void> {
  cache.set(key, value);
  try {
    const raw = JSON.stringify(value);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, raw);
    } else {
      await SecureStore.setItemAsync(key, raw);
    }
  } catch { /* storage unavailable; cache still works for this session */ }
}

export async function deleteStored(key: string): Promise<void> {
  cache.delete(key);
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch { /* ignore */ }
}

async function readRaw(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    return await SecureStore.getItemAsync(key);
  } catch { return null; }
}

export async function hydrateStorage(): Promise<void> {
  const keys = ['gowayy.theme', 'gowayy.splashSeen', 'gowayy.onboarded', 'gowayy.session.token', 'gowayy.activeJourney'];
  await Promise.all(keys.map(async (key) => {
    const raw = await readRaw(key);
    if (raw === null) return;
    try { cache.set(key, JSON.parse(raw) as unknown); } catch { cache.set(key, raw); }
  }));
}

export function createSecureTokenStore() {
  return {
    get(): string | null {
      const v = cache.get('gowayy.session.token');
      return typeof v === 'string' ? v : null;
    },
    set(token: string | null): void {
      if (token) {
        cache.set('gowayy.session.token', token);
        void writeStored('gowayy.session.token', token);
      } else {
        void deleteStored('gowayy.session.token');
      }
    },
  };
}
