import type { ComponentType } from 'react';

/** Host-owned identity. Visibility is not authorization: endpoints must check access again. */
export type ExtensionContext = Readonly<{ agentId: string | null; theme: 'light' | 'dark'; readOnly: boolean }>;
export type ExtensionViewProps = { context: ExtensionContext };
export type ExtensionCanvasProps = ExtensionViewProps & { item: Readonly<{ id: number; kind: string; args: Record<string, unknown>; state: Record<string, unknown> }> };
/** Safe server-projected input metadata; never contains completion capabilities or secrets. */
export type ExtensionInput = Readonly<{ id: string; kind: string; title: string; message?: string; spec?: Record<string, unknown>; state?: string }>;
/** onDone only refreshes authoritative server state; it never approves or completes an input. */
export type ExtensionInputProps = ExtensionViewProps & { input: ExtensionInput; onDone: () => void };
export type ExtensionInputKind = { kind: string; component: ComponentType<ExtensionInputProps> };
export type ExtensionCanvasKind = { kind: string; component: ComponentType<ExtensionCanvasProps> };
/** Props of a Start-page launcher tab: a local browser tab, unmounted when closed. */
export type ExtensionLauncherProps = ExtensionViewProps & { tabId: string; active: boolean };
/** A button on the Canvas Start page that opens a local tab with `component`.
 * `icon` is a Phosphor class (e.g. "ph-terminal-window"); omitted, the plugin's own procs.icon is used. */
export type ExtensionCanvasLauncher = { id: string; title: string; description?: string; icon?: string; component: ComponentType<ExtensionLauncherProps> };
export type ExtensionPage = { id: string; title: string; component: ComponentType<ExtensionViewProps> };
export type ExtensionPanel = { id: string; title: string; component: ComponentType<ExtensionViewProps> };
export type ExtensionAction = { id: string; title: string; run: (context: ExtensionContext) => void | Promise<void>; mutates?: boolean };
/** Trusted, build-time React module. Never populate this from HTML or a remote module URL. */
export type UiExtension = {
  id: string;
  apiVersion: 1;
  pages?: readonly ExtensionPage[];
  /** Page menu entries. Plugin entries appear under Pages, not directly in the sidebar. */
  navigation?: readonly { page: string; title: string }[];
  /** Opt-in direct sidebar links; each page also requires a sidebarNavigation grant. */
  sidebarNavigation?: readonly { page: string; title: string }[];
  panels?: readonly ExtensionPanel[];
  canvasKinds?: readonly ExtensionCanvasKind[];
  /** Plugin-owned input cards; explicit inputKinds grants are required. */
  inputKinds?: readonly ExtensionInputKind[];
  /** Start-page buttons opening local Canvas tabs; each also requires a canvasLaunchers grant. */
  canvasLaunchers?: readonly ExtensionCanvasLauncher[];
  actions?: readonly ExtensionAction[];
};
export type ExtensionGrant = Readonly<{ inputKinds?: readonly string[]; pages?: readonly string[]; sidebarNavigation?: readonly string[]; panels?: readonly string[]; actions?: readonly string[]; canvasKinds?: readonly string[]; canvasLaunchers?: readonly string[] }>;
export type RegisteredView = Readonly<{ key: string; title: string; component: ComponentType<ExtensionViewProps> }>;
/** A granted launcher; `icon` is resolved (launcher icon, else plugin icon, else null → default). */
export type RegisteredLauncher = Readonly<Omit<ExtensionCanvasLauncher, 'icon'> & { key: string; icon: string | null }>;
export type RegisteredAction = Readonly<ExtensionAction & { key: string }>;
export type ExtensionRegistry = Readonly<{
  inputKinds: readonly Readonly<ExtensionInputKind & { key: string }>[];
  pages: readonly RegisteredView[];
  navigation: readonly Readonly<{ key: string; title: string }>[];
  sidebarNavigation: readonly Readonly<{ key: string; title: string }>[];
  panels: readonly RegisteredView[];
  canvasKinds: readonly Readonly<ExtensionCanvasKind & { key: string }>[];
  canvasLaunchers: readonly RegisteredLauncher[];
  actions: readonly RegisteredAction[];
}>;
