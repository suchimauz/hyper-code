import { createExtensionRegistry } from './registry';
import { documentationExtension } from '../ui-plugins/documentation';
import { agentMetaExtension } from '../ui-plugins/agent-meta';
import { settingsExtension } from '../ui-plugins/settings';
import { sharedAgentsExtension } from '../ui-plugins/shared-agents';
import { instancesExtension } from '../ui-plugins/instances';
import { visualizationsExtension } from '../ui-plugins/visualizations';
import { whisperExtension } from '../ui-plugins/whisper';
import { utilityExtension } from '../ui-plugins/utilities';
import { telegramExtension } from '../ui-plugins/telegram';
import { agentSourceExtension } from '../ui-plugins/agent-source';
import { developerCanvasesExtension } from '../ui-plugins/developer-canvases';
import { browserLiveExtension } from '../ui-plugins/browser-live';
import { initialPromptExtension } from '../ui-plugins/initial-prompt';

/** Host-reviewed build-time allowlist. Backend installation grants no browser code execution. */
// Demonstrations remain test fixtures, never production navigation or actions.
export const installedExtensions = createExtensionRegistry([
  documentationExtension, agentMetaExtension, settingsExtension,
  sharedAgentsExtension, instancesExtension,
  visualizationsExtension, whisperExtension,
  utilityExtension, telegramExtension, agentSourceExtension, developerCanvasesExtension, browserLiveExtension, initialPromptExtension,
], {
  documentation: { pages: ['search', 'functions'] },
  'agent-meta': { panels: ['overview'] },
  settings: { pages: ['overview', 'declared'] },
  'shared-agents': { pages: ['overview'] },
  instances: { pages: ['overview'] },
  visualizations: { pages: ['architecture', 'turbulence'], canvasKinds: ['architectureMap.map', 'architectureMap.turbulence'] },
  whisper: { pages: ['overview'] },
  utilities: { pages: ['autotext', 'update'] },
  telegram: { pages: ['overview'] },
  'agent-source': { pages: ['overview'] },
  'developer-canvases': { canvasKinds: ['code.tests', 'icons.browser'] },
  'browser-live': { pages: ['live'] },
  'initial-prompt': { pages: ['overview'] },
});
