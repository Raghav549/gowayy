/**
 * Vite runs with apps/gowayy-admin/web as its working directory (npm workspace),
 * so it extends the shared monorepo config and adds read-only proxies so admin
 * previews can load seeded images and uploaded media.
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
      '/uploads': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/images': { target: 'http://127.0.0.1:5173', changeOrigin: true },
    },
  },
});
