import { create } from 'zustand';
import type { Journey } from '@gowayy/types';
import { client, readStored, writeStored } from '../lib/client';

interface JourneyState {
  journey: Journey | null;
  loading: boolean;
  ensure: () => Promise<Journey | null>;
  set: (journey: Journey | null) => void;
  patch: (patch: Record<string, unknown>) => Promise<void>;
  refresh: () => Promise<void>;
  clear: () => void;
}

export const useJourney = create<JourneyState>((set, get) => ({
  journey: null, loading: false,
  ensure: async () => {
    const current = get().journey; if (current) return current;
    const id = readStored<string | null>('gowayy.activeJourney', null);
    if (id) {
      try { const { journey } = await client.journey(id); set({ journey }); return journey; }
      catch { writeStored('gowayy.activeJourney', null); }
    }
    const list = await client.journeys();
    if (list.length) { set({ journey: list[0] }); writeStored('gowayy.activeJourney', list[0].id); return list[0]; }
    const created = await client.createJourney({});
    set({ journey: created }); writeStored('gowayy.activeJourney', created.id);
    return created;
  },
  set: (journey) => { set({ journey }); writeStored('gowayy.activeJourney', journey?.id ?? null); },
  patch: async (patch) => {
    const j = get().journey ?? await get().ensure();
    if (!j) return;
    set({ loading: true });
    try { set({ journey: await client.updateJourney(j.id, patch), loading: false }); }
    catch { set({ loading: false }); }
  },
  refresh: async () => {
    const j = get().journey; if (!j) return;
    try { set({ journey: (await client.journey(j.id)).journey }); } catch { /* keep */ }
  },
  clear: () => { set({ journey: null }); writeStored('gowayy.activeJourney', null); },
}));
