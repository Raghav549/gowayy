/**
 * Vite is launched with `apps/gowayy-customer/web` as its working directory
 * (npm workspace), so it needs a config in this directory. It re-exports the
 * shared monorepo config (aliases, API proxy, preview-host allowlist) and keeps
 * the customer app's production chunks explicit without a separate renderer.
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
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
