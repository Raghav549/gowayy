/**
 * Vite runs with apps/gowayy-partner/web as its working directory (npm
 * workspace), so it re-exports the shared monorepo config (aliases, API proxy,
 * preview-host allowlist).
 */
export { default } from '../../../vite.config';
export { aliases } from '../../../vite.config';
