import { sdkExample } from '../ui-plugins/sdk-example';
import { createExtensionRegistry } from './registry';

/** Host-reviewed build-time allowlist. Installing a backend plugin grants no browser code execution. */
export const installedExtensions = createExtensionRegistry([sdkExample], {
  'sdk-example': { pages: ['overview'], panels: ['overview'], actions: ['top'] },
});
