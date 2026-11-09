import { createExtensionRegistry } from './registry';
import { tasksExtension } from '../ui-plugins/tasks';
import { documentationExtension } from '../ui-plugins/documentation';
import { agentMetaExtension } from '../ui-plugins/agent-meta';

/** Host-reviewed build-time allowlist. Installing a backend plugin grants no browser code execution. */
// Demonstrations are test fixtures, never production navigation or actions.
export const installedExtensions = createExtensionRegistry([tasksExtension, documentationExtension, agentMetaExtension], {
  tasks: { pages: ['overview'] },
  documentation: { pages: ['search', 'functions'] },
  'agent-meta': { panels: ['overview'] },
});
