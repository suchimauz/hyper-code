import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

/** A plugin UI may also import packages listed in its own package.json dependencies (the runtime build bundles them too). */
const pluginDependency = (importer: string, source: string) => {
  const plugin = /\/plugins\/([^/]+)\/ui\//.exec(importer)?.[1];
  if (!plugin) return false;
  const name = source.match(/^(?:@[^/]+\/)?[^/]+/)?.[0] ?? '';
  try { return Object.hasOwn(JSON.parse(readFileSync(new URL(`../plugins/${plugin}/package.json`, import.meta.url), 'utf8')).dependencies ?? {}, name); } catch { return false; }
};

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  base: '/ui-lab/',
  plugins: [react(), {
    name: 'mauzcode-ui-public-boundary',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source.startsWith('@mauzcode/ui/')) throw new Error('Use the public @mauzcode/ui entry, not deep imports');
      if (importer && /\/(?:core-ui\/|plugins\/[^/]+\/ui\/)/.test(importer.replaceAll('\\\\', '/')) && !source.startsWith('.') && source !== '@mauzcode/ui' && source !== new URL('./src/sdk/index.ts', import.meta.url).pathname && source !== 'react' && !source.startsWith('react/') && source !== '/@react-refresh' && source.split('?')[0] !== importer?.split('?')[0] && !pluginDependency(importer.replaceAll('\\\\', '/'), source)) {
        throw new Error(`Core and plugin UIs may import only React, @mauzcode/ui and (plugins) their own package.json dependencies: ${source}`);
      }
      return null;
    },
  }],
  resolve: {
    alias: [{ find: /^@mauzcode\/ui$/, replacement: new URL('./src/sdk/index.ts', import.meta.url).pathname }],
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1', port: 5174, strictPort: true,
    fs: { strict: true, allow: [new URL('.', import.meta.url).pathname, new URL('../node_modules', import.meta.url).pathname, new URL('../plugins', import.meta.url).pathname] },
    hmr: { path: 'hmr' },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false, exclude: ['**/node_modules/**', '**/dist/**', '.mauzcode/**'] },
});
