// Use the exact @electron/get instance used by the pinned electron-builder.
// Its public API supports Got options; electron-builder's config schema does not.
const { createRequire } = require('node:module');
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'));
const { devDependencies } = require('./package.json');

function downloadOptions() {
  return {
    version: devDependencies.electron,
    artifactName: 'electron',
    platform: 'win32',
    arch: 'x64',
    downloadOptions: { timeout: { request: 3600000 } },
    unsafelyDisableChecksums: false,
  };
}

async function main() {
  // Use the default official GitHub release URL and @electron/get cache.
  // Fail rather than silently accepting environment-provided mirrors/version overrides.
  for (const key of Object.keys(process.env)) {
    if (/^(electron_|npm_config_electron_|npm_package_config_electron_)(mirror|nightly_?mirror|custom_?(dir|filename|version))$/i.test(key) && process.env[key]) {
      throw new Error(`Unset ${key}: prefetch uses official Electron releases only`);
    }
  }
  const { downloadArtifact } = builderRequire('@electron/get');
  console.log('Prefetching Windows x64 Electron (request timeout: 3600000 ms, SHA256 verified)…');
  const zip = await downloadArtifact(downloadOptions());
  console.log(`Verified Electron archive in cache: ${zip}`);
}

module.exports = { downloadOptions };
if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
