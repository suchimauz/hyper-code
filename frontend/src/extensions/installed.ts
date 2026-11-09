import { createExtensionRegistry } from './registry';
import { tasksExtension } from '../ui-plugins/tasks';
import { documentationExtension } from '../ui-plugins/documentation';
import { agentMetaExtension } from '../ui-plugins/agent-meta';
import { settingsExtension } from '../ui-plugins/settings';
import { sharedAgentsExtension } from '../ui-plugins/shared-agents';
import { instancesExtension } from '../ui-plugins/instances';
import { readersExtension } from '../ui-plugins/readers';
import { newsExtension } from '../ui-plugins/news';
import { visualizationsExtension } from '../ui-plugins/visualizations';
import { whisperExtension } from '../ui-plugins/whisper';
import { knowledgeExtension } from '../ui-plugins/knowledge';
import { operationsExtension } from '../ui-plugins/operations';
import { utilityExtension } from '../ui-plugins/utilities';
import { telegramExtension } from '../ui-plugins/telegram';
import { agentSourceExtension } from '../ui-plugins/agent-source';
import { developerCanvasesExtension } from '../ui-plugins/developer-canvases';
import { browserLiveExtension } from '../ui-plugins/browser-live';

/** Host-reviewed build-time allowlist. Backend installation grants no browser code execution. */
// Demonstrations remain test fixtures, never production navigation or actions.
export const installedExtensions = createExtensionRegistry([
  tasksExtension, documentationExtension, agentMetaExtension, settingsExtension,
  sharedAgentsExtension, instancesExtension, readersExtension, newsExtension,
  visualizationsExtension, whisperExtension, knowledgeExtension, operationsExtension,
  utilityExtension, telegramExtension, agentSourceExtension, developerCanvasesExtension, browserLiveExtension,
], {
  tasks: { pages: ['overview'] },
  documentation: { pages: ['search', 'functions'] },
  'agent-meta': { panels: ['overview'] },
  settings: { pages: ['overview', 'declared'] },
  'shared-agents': { pages: ['overview'] },
  instances: { pages: ['overview'] },
  readers: { pages: ['hackernews', 'substack', 'inbox'] },
  news: { pages: ['overview', 'rss'] },
  visualizations: { pages: ['calendar', 'architecture', 'turbulence'], canvasKinds: ['gcal.calendar', 'architectureMap.map', 'architectureMap.turbulence'] },
  whisper: { pages: ['overview'] },
  knowledge: { pages: ['overview'] },
  operations: { pages: ['telemetry', 'gaps'] },
  utilities: { pages: ['autotext', 'update'] },
  telegram: { pages: ['overview'] },
  'agent-source': { pages: ['overview'] },
  'developer-canvases': { canvasKinds: ['code.tests', 'icons.browser'] },
  'browser-live': { pages: ['live'] },
});
