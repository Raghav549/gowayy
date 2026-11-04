import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ServiceAreaState {
  pincode: string;
  setPincode: (pincode: string) => void;
}

/** Pincode chosen by the customer for food/grocery serviceability checks. */
export const useServiceArea = create<ServiceAreaState>()(
  persist(
    (set) => ({
      pincode: '734101',
      setPincode: (pincode) => set({ pincode: pincode.replace(/\D/g, '').slice(0, 6) }),
    }),
    { name: 'gowayy-service-area' },
  ),
);
