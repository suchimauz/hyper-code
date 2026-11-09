import type { ComponentType } from 'react';

/** Host-owned identity. Visibility is not authorization: endpoints must check access again. */
export type ExtensionContext = Readonly<{ agentId: string | null; theme: 'light' | 'dark'; readOnly: boolean }>;
export type ExtensionViewProps = { context: ExtensionContext };
export type ExtensionCanvasProps = ExtensionViewProps & { item: Readonly<{ id: number; kind: string; args: Record<string, unknown>; state: Record<string, unknown> }> };
export type ExtensionCanvasKind = { kind: string; component: ComponentType<ExtensionCanvasProps> };
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
  actions?: readonly ExtensionAction[];
};
export type ExtensionGrant = Readonly<{ pages?: readonly string[]; sidebarNavigation?: readonly string[]; panels?: readonly string[]; actions?: readonly string[]; canvasKinds?: readonly string[] }>;
export type RegisteredView = Readonly<{ key: string; title: string; component: ComponentType<ExtensionViewProps> }>;
export type RegisteredAction = Readonly<ExtensionAction & { key: string }>;
export type ExtensionRegistry = Readonly<{
  pages: readonly RegisteredView[];
  navigation: readonly Readonly<{ key: string; title: string }>[];
  sidebarNavigation: readonly Readonly<{ key: string; title: string }>[];
  panels: readonly RegisteredView[];
  canvasKinds: readonly Readonly<ExtensionCanvasKind & { key: string }>[];
  actions: readonly RegisteredAction[];
}>;
