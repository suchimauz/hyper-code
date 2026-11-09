import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  base: '/ui-lab/',
  plugins: [react(), {
    name: 'hyper-ui-public-boundary',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source.startsWith('@hyper/ui/')) throw new Error('Use the public @hyper/ui entry, not deep imports');
      if (importer && /\/(?:core-ui\/|plugins\/[^/]+\/ui\/)/.test(importer.replaceAll('\\\\', '/')) && !source.startsWith('.') && source !== '@hyper/ui' && source !== new URL('./src/sdk/index.ts', import.meta.url).pathname && source !== 'react' && !source.startsWith('react/') && source !== '/@react-refresh' && source.split('?')[0] !== importer?.split('?')[0]) {
        throw new Error(`Core and plugin UIs may import only React and @hyper/ui: ${source}`);
      }
      return null;
    },
  }],
  resolve: {
    alias: [{ find: /^@hyper\/ui$/, replacement: new URL('./src/sdk/index.ts', import.meta.url).pathname }],
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1', port: 5174, strictPort: true,
    fs: { strict: true, allow: [new URL('.', import.meta.url).pathname, new URL('../node_modules', import.meta.url).pathname, new URL('../plugins', import.meta.url).pathname] },
    hmr: { path: 'hmr' },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false, exclude: ['**/node_modules/**', '**/dist/**', '.hyper/**'] },
});
