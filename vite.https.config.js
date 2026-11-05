import { defineConfig, mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import baseConfig from './vite.config.js';
import { localHttpsConfig } from './scripts/local-https.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const ssl = await localHttpsConfig({ root, cert: process.env.ATLAS_HTTPS_CERT, key: process.env.ATLAS_HTTPS_KEY });

export default mergeConfig(baseConfig, defineConfig({
  plugins: ssl.plugins,
  server: { host: '0.0.0.0', port: 8080, strictPort: true, https: ssl.https },
  preview: { host: '0.0.0.0', port: 8080, strictPort: true, https: ssl.https },
}));
