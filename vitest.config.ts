import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { aliases } from './vite.config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: aliases },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx,mjs}'],
    css: false,
  },
});
