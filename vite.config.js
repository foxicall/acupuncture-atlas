import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Set VITE_BASE_PATH=/acupuncture-atlas/ for GitHub Pages project sites.
const rawBase = process.env.VITE_BASE_PATH || '/';
if (!rawBase.startsWith('/') || rawBase.includes('..') || /[?#]/.test(rawBase)) {
  throw new Error('VITE_BASE_PATH must be an absolute pathname, e.g. /acupuncture-atlas/');
}
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: 'auto',
      manifest: false,
      includeAssets: ['manifest.json', 'icons/*.png', 'models/**/*'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,glb,gltf,bin,png,svg,ico,md,json,woff2}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        // Updates are activated after all current app windows close.
        skipWaiting: false,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
});
