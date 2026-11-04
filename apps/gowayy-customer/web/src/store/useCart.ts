import { create } from 'zustand';

export interface CartItem { id: string; name: string; quantity: number; unitPricePaise: number; options: string[] }

interface CartState {
  items: CartItem[];
  listingId: string | null;
  add: (listingId: string, item: CartItem) => void;
  remove: (id: string) => void;
  quantity: (id: string, delta: number) => void;
  clear: () => void;
  totalPaise: () => number;
}

export const useCart = create<CartState>((set, get) => ({
  items: [], listingId: null,
  add: (listingId, item) => set((s) => {
    const base = s.listingId === listingId ? s.items : [];
    const existing = base.find((i) => i.id === item.id && i.options.join() === item.options.join());
    const items = existing
      ? base.map((i) => i === existing ? { ...i, quantity: i.quantity + item.quantity } : i)
      : [...base, item];
    return { listingId, items };
  }),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  quantity: (id, delta) => set((s) => ({ items: s.items.map((i) => i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i).filter((i) => i.quantity > 0) })),
  clear: () => set({ items: [], listingId: null }),
  totalPaise: () => get().items.reduce((sum, i) => sum + i.unitPricePaise * i.quantity, 0),
}));
