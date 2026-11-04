import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export const aliases = {
  '@gowayy/types': r('./packages/types/src/index.ts'),
  '@gowayy/validation': r('./packages/validation/src/index.ts'),
  '@gowayy/shared-utils': r('./packages/shared-utils/src/index.ts'),
  '@gowayy/design-system': r('./packages/design-system/src/index.ts'),
  '@gowayy/ui': r('./packages/ui/src/index.tsx'),
  '@gowayy/api-client': r('./packages/api-client/src/index.ts'),
  '@gowayy/booking-engine': r('./packages/booking-engine/src/index.ts'),
  '@gowayy/location-engine': r('./packages/location-engine/src/index.ts'),
  '@gowayy/pricing-engine': r('./packages/pricing-engine/src/index.ts'),
  '@gowayy/notification-engine': r('./packages/notification-engine/src/index.ts'),
  '@gowayy/catalog': r('./packages/catalog/src/index.ts'),
  '@gowayy/commerce': r('./packages/commerce/src/index.ts'),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias: aliases },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
  },
  build: {
    target: 'es2020', sourcemap: true,
    // NOTE: no 'three' chunk here — only the customer app imports three; a shared
    // manualChunks entry made partner/explore emit `Generated an empty chunk: "three"`.
    // The customer app adds its own three chunk in apps/gowayy-customer/web/vite.config.ts.
    rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], query: ['@tanstack/react-query'] } } },
  },
});
