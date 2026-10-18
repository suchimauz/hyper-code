import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
const localRequire = createRequire(import.meta.url);
const { downloadOptions } = localRequire('./prefetch-electron.cjs');
const pkg = localRequire('./package.json');
const builderRequire = createRequire(localRequire.resolve('app-builder-lib/package.json'));

test('prefetch targets the pinned Windows archive with a one-hour request and checksums', () => {
  expect(downloadOptions()).toEqual({
    version: pkg.devDependencies.electron,
    artifactName: 'electron', platform: 'win32', arch: 'x64',
    downloadOptions: { timeout: { request: 3600000 } },
    unsafelyDisableChecksums: false,
  });
  expect(typeof builderRequire('@electron/get').downloadArtifact).toBe('function');
  expect(pkg.scripts['build:win']).toBe('bun run prefetch:win && electron-builder --win nsis --x64');
});

test('prefetch rejects mirror overrides before making any network request', () => {
  const result = Bun.spawnSync([process.execPath, 'run', 'prefetch-electron.cjs'], {
    cwd: import.meta.dir,
    env: { ...process.env, ELECTRON_MIRROR: 'https://example.invalid/' },
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain('Unset ELECTRON_MIRROR');
});
