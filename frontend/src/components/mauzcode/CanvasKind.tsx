import { usePluginUi } from '../../extensions/pluginRuntime';
import { ExtensionBoundary } from '../../extensions/ExtensionHost';
import type { CanvasItemTab } from './canvasTabs';

/** Only explicitly granted, build-time React kinds execute in the host. */
export function CanvasKind({ agentId, item, theme }: { agentId: string; item: CanvasItemTab; theme: 'light' | 'dark' }) {
  const installedExtensions = usePluginUi().registry;
  const entry = installedExtensions.canvasKinds.find(entry => entry.kind === item.kind);
  if (entry && item.kind) {
    const View = entry.component;
    return <ExtensionBoundary key={entry.key}><View context={{ agentId, theme, readOnly: false }} item={{ id: item.id, kind: item.kind, args: item.args ?? {}, state: item.state ?? {} }} /></ExtensionBoundary>;
  }
  return <iframe title={`Canvas: ${item.title || 'MauzCode'}`} src={`/canvas/${encodeURIComponent(agentId)}/item/${item.id}/document?theme=${theme}`} className="canvas-frame ready" />;
}
