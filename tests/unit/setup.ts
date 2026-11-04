import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom does not implement PointerEvent. React's pointer handlers are what the
// onboarding swipe navigation uses; without this polyfill `fireEvent.pointerDown`
// produces an Event with no clientX and the gesture cannot be simulated.
if (!window.PointerEvent) {
  Object.defineProperty(window, 'PointerEvent', { writable: true, value: window.MouseEvent });
}

// jsdom does not implement matchMedia; the design system and splash use it.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Keep tests deterministic: no real timers/network escaping by accident.
window.localStorage.clear();
