import { create } from 'zustand';
import type { Journey } from '@gowayy/types';
import { client } from '../lib/client';
import { readStored, writeStored } from '../lib/storage';

interface JourneyState {
  journey: Journey | null;
  loading: boolean;
  ensure: () => Promise<Journey | null>;
  set: (j: Journey | null) => void;
  patch: (patch: Record<string, unknown>) => Promise<void>;
  refresh: () => Promise<void>;
  clear: () => void;
}

export const useJourney = create<JourneyState>((set, get) => ({
  journey: null, loading: false,
  ensure: async () => {
    const current = get().journey;
    if (current) return current;
    set({ loading: true });
    try {
      const id = readStored<string | null>('gowayy.activeJourney', null);
      if (id) {
        try { const r = await client.journey(id); set({ journey: r.journey, loading: false }); return r.journey; }
        catch { await writeStored('gowayy.activeJourney', null); }
      }
      const list = await client.journeys();
      if (list.length) {
        set({ journey: list[0], loading: false });
        await writeStored('gowayy.activeJourney', list[0].id);
        return list[0];
      }
      const created = await client.createJourney({});
      set({ journey: created, loading: false });
      await writeStored('gowayy.activeJourney', created.id);
      return created;
    } catch { set({ loading: false }); return null; }
  },
  set: (journey) => { set({ journey }); void writeStored('gowayy.activeJourney', journey?.id ?? null); },
  patch: async (patch) => {
    const j = get().journey ?? await get().ensure();
    if (!j) return;
    set({ loading: true });
    try { set({ journey: await client.updateJourney(j.id, patch), loading: false }); }
    catch { set({ loading: false }); }
  },
  refresh: async () => {
    const j = get().journey;
    if (!j) return;
    try { const r = await client.journey(j.id); set({ journey: r.journey }); } catch { /* keep */ }
  },
  clear: () => { set({ journey: null }); void writeStored('gowayy.activeJourney', null); },
}));
