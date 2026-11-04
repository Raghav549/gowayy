import { create } from 'zustand';

export interface CartItem {
  id: string;
  name: string;
  quantity: number;
  unitPricePaise: number;
  options?: string[];
}
interface CartState {
  service: 'food' | 'grocery' | null;
  listingId: string | null;
  items: CartItem[];
  setListing: (service: 'food' | 'grocery', listingId: string) => void;
  add: (item: CartItem) => void;
  remove: (id: string) => void;
  clear: () => void;
  subtotalPaise: () => number;
}

export const useCart = create<CartState>((set, get) => ({
  service: null, listingId: null, items: [],
  setListing: (service, listingId) => set((s) => s.listingId === listingId ? s : { service, listingId, items: [] }),
  add: (item) => set((s) => {
    const existing = s.items.find((i) => i.id === item.id);
    if (!existing) return { service: s.service, listingId: s.listingId, items: [...s.items, item] };
    return { service: s.service, listingId: s.listingId,
      items: s.items.map((i) => i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i) };
  }),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  clear: () => set({ service: null, listingId: null, items: [] }),
  subtotalPaise: () => get().items.reduce((sum, i) => sum + i.unitPricePaise * i.quantity, 0),
}));
