import type { ComponentType } from 'react';

/** Host-owned identity. Visibility is not authorization: endpoints must check access again. */
export type ExtensionContext = Readonly<{ agentId: string | null; theme: 'light' | 'dark'; readOnly: boolean }>;
export type ExtensionViewProps = { context: ExtensionContext };
export type ExtensionPage = { id: string; title: string; component: ComponentType<ExtensionViewProps> };
export type ExtensionPanel = { id: string; title: string; component: ComponentType<ExtensionViewProps> };
export type ExtensionAction = { id: string; title: string; run: (context: ExtensionContext) => void | Promise<void>; mutates?: boolean };
/** Trusted, build-time React module. Never populate this from HTML or a remote module URL. */
export type UiExtension = {
  id: string;
  apiVersion: 1;
  pages?: readonly ExtensionPage[];
  navigation?: readonly { page: string; title: string }[];
  panels?: readonly ExtensionPanel[];
  actions?: readonly ExtensionAction[];
};
export type ExtensionGrant = Readonly<{ pages?: readonly string[]; panels?: readonly string[]; actions?: readonly string[] }>;
export type RegisteredView = Readonly<{ key: string; title: string; component: ComponentType<ExtensionViewProps> }>;
export type RegisteredAction = Readonly<ExtensionAction & { key: string }>;
export type ExtensionRegistry = Readonly<{
  pages: readonly RegisteredView[];
  navigation: readonly Readonly<{ key: string; title: string }>[];
  panels: readonly RegisteredView[];
  actions: readonly RegisteredAction[];
}>;
