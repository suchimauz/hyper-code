import { createExtensionRegistry } from './registry';
import type { ExtensionGrant, UiExtension } from './types';
import { documentationExtension } from '../core-ui/documentation';
import { agentMetaExtension } from '../core-ui/agent-meta';
import { settingsExtension } from '../core-ui/settings';
import { sharedAgentsExtension } from '../core-ui/shared-agents';
import { instancesExtension } from '../core-ui/instances';
import { utilityExtension } from '../core-ui/utilities';
import { agentSourceExtension } from '../core-ui/agent-source';
import { developerCanvasesExtension } from '../core-ui/developer-canvases';
import { initialPromptExtension } from '../core-ui/initial-prompt';

/** Built-in Hyper surfaces only. Plugin UIs are not listed here: they register
 * themselves at runtime from their own folder (package.json procs.ui) through
 * /plugins/ui/manifest — see extensions/pluginRuntime.ts. */
export const coreExtensions: readonly UiExtension[] = [
  documentationExtension, agentMetaExtension, settingsExtension,
  sharedAgentsExtension, instancesExtension,
  utilityExtension, agentSourceExtension, developerCanvasesExtension, initialPromptExtension,
];
export const coreGrants: Readonly<Record<string, ExtensionGrant>> = {
  documentation: { pages: ['search', 'functions'] },
  'agent-meta': { panels: ['overview'] },
  settings: { pages: ['overview', 'declared'] },
  'shared-agents': { pages: ['overview'] },
  instances: { pages: ['overview'] },
  utilities: { pages: ['autotext'] },
  'agent-source': { pages: ['overview'] },
  'developer-canvases': { canvasKinds: ['code.tests'] },
  'initial-prompt': { pages: ['overview'] },
};
/** Static snapshot of the built-in surfaces (no runtime plugins). */
export const installedExtensions = createExtensionRegistry(coreExtensions, coreGrants);
/** Legacy application documents owned by the core that have native pages. */
export const coreApplications: Readonly<Record<string, string>> = {
  '/search': 'documentation/search', '/functions': 'documentation/functions',
  '/settings': 'settings/overview', '/settings/declared': 'settings/declared',
  '/shared-agents': 'shared-agents/overview', '/controlPlane': 'instances/overview',
  '/autotext': 'utilities/autotext',
};
