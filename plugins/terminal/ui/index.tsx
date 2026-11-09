import type { ExtensionLauncherProps, UiExtension } from '@hyper/ui';
import { TerminalView } from './TerminalView';

/** One Start-page tab: a shell bound to the chat's local workspace, alive while the tab exists. */
export function TerminalLauncher({ context, active }: ExtensionLauncherProps) {
  if (!context.agentId) return <p role="alert">Терминал доступен только внутри чата.</p>;
  return <TerminalView agentId={context.agentId} theme={context.theme} active={active} />;
}

/** Terminal plugin UI: declares the Canvas Start launcher; the icon is the plugin's procs.icon. */
const extension: UiExtension = {
  id: 'terminal',
  apiVersion: 1,
  canvasLaunchers: [{ id: 'terminal', title: 'Terminal', description: 'Оболочка в рабочей папке чата', component: TerminalLauncher }],
};
export default extension;
