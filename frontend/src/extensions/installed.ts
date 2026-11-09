import { createExtensionRegistry } from './registry';

/** Host-reviewed build-time allowlist. Installing a backend plugin grants no browser code execution. */
// Demonstrations are test fixtures, never production navigation or actions.
export const installedExtensions = createExtensionRegistry([], {});
