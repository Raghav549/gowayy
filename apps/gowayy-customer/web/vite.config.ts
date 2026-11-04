/**
 * Vite is launched with `apps/web` as its working directory (npm workspace),
 * so it needs a config in this directory. The shared config at the repository
 * root owns aliases, the API proxy and the preview-host allowlist.
 */
export { default } from '../../../vite.config';
export { aliases } from '../../../vite.config';
