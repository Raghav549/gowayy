/**
 * Vite is launched with `apps/gowayy-customer/web` as its working directory
 * (npm workspace), so it needs a config in this directory. It re-exports the
 * shared monorepo config (aliases, API proxy, preview-host allowlist) and adds
 * the `three` manual chunk — three.js is only imported by this app's Splash
 * component, so the chunk must live here, not in the shared config.
 */
import { defineConfig } from 'vite';
import base, { aliases } from '../../../vite.config';

export { aliases };

export default defineConfig({
  ...base,
  build: {
    ...base.build,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          three: ['three'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
