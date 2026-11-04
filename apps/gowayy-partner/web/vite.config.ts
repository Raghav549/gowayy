/**
 * Vite runs with apps/gowayy-partner/web as its working directory (npm
 * workspace), so it extends the shared monorepo config (aliases, API proxy,
 * preview-host allowlist) and adds read-only proxies for customer-owned media.
 */
import { defineConfig } from 'vite';
import base, { aliases } from '../../../vite.config';

export { aliases };

export default defineConfig({
  ...base,
  server: {
    ...base.server,
    proxy: {
      ...(base.server?.proxy ?? {}),
      // Uploaded store/media files live on the API server.
      '/uploads': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      // Seeded destination/product images live in the customer app's public dir.
      '/images': { target: 'http://127.0.0.1:5173', changeOrigin: true },
    },
  },
});
