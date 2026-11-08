import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  base: '/ui-lab/',
  plugins: [react()],
  server: {
    host: '127.0.0.1', port: 5174, strictPort: true,
    fs: { strict: true, allow: [new URL('.', import.meta.url).pathname, new URL('../node_modules', import.meta.url).pathname] },
    hmr: { path: 'hmr' },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false, exclude: ['**/node_modules/**', '**/dist/**', '.hyper/**'] },
});
