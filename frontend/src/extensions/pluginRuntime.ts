import { useSyncExternalStore } from 'react';
import { requestJson } from '../sdk/api';
import { subscribeLive } from '../sdk/live';
import { createExtensionRegistry } from './registry';
import { coreApplications, coreExtensions, coreGrants } from './installed';
import { installHostRuntime } from './hostRuntime';
import type { ExtensionGrant, ExtensionRegistry, UiExtension } from './types';

export type PluginUiEntry = { name: string; url: string; hash: string; grants: ExtensionGrant; applications?: Record<string, string>; /** package.json procs.icon, the default launcher icon. */ icon?: string | null };
export type PluginUiManifest = { apiVersion: 1; plugins: PluginUiEntry[] };
export type PluginUiState = Readonly<{
  registry: ExtensionRegistry;
  /** Legacy document path → `extension:<key>` page key, core and plugins. */
  applications: Readonly<Record<string, string>>;
  /** Plugins whose bundle failed to load or validate; others keep working. */
  errors: Readonly<Record<string, string>>;
  loaded: boolean;
}>;
type Importer = (url: string) => Promise<{ default?: unknown }>;

const browserImport: Importer = url => import(/* @vite-ignore */ url);

/** Runtime registry: built-in surfaces plus approved plugin bundles from /plugins/ui/manifest.
 * Plugins are validated one by one, so a broken plugin is reported and skipped. */
export function createPluginRuntime(options: { importer?: Importer; fetchManifest?: (signal: AbortSignal) => Promise<PluginUiManifest> } = {}) {
  const importer = options.importer ?? browserImport;
  const fetchManifest = options.fetchManifest ?? (signal => requestJson<PluginUiManifest>('/plugins/ui/manifest', { signal }));
  const modules = new Map<string, { hash: string; extension: UiExtension }>();
  let state: PluginUiState = { registry: createExtensionRegistry(coreExtensions, coreGrants), applications: { ...coreApplications }, errors: {}, loaded: false };
  const listeners = new Set<() => void>();
  let controller: AbortController | undefined;
  let generation = 0;

  const emit = () => { for (const listener of listeners) listener(); };
  async function refresh(): Promise<PluginUiState> {
    const current = ++generation;
    controller?.abort(); controller = new AbortController();
    let manifest: PluginUiManifest;
    try { manifest = await fetchManifest(controller.signal); }
    catch (error) {
      if (current !== generation || (error as { name?: string })?.name === 'AbortError') return state;
      state = { ...state, loaded: true, errors: { ...state.errors, manifest: error instanceof Error ? error.message : String(error) } };
      emit(); return state;
    }
    if (manifest?.apiVersion !== 1 || !Array.isArray(manifest.plugins)) manifest = { apiVersion: 1, plugins: [] };
    const extensions: UiExtension[] = [...coreExtensions];
    const grants: Record<string, ExtensionGrant> = { ...coreGrants };
    const applications: Record<string, string> = { ...coreApplications };
    const errors: Record<string, string> = {};
    const icons: Record<string, string | null> = {};
    await Promise.all(manifest.plugins.map(async entry => {
      try {
        const cached = modules.get(entry.name);
        let extension = cached?.hash === entry.hash ? cached.extension : undefined;
        if (!extension) {
          const module = await importer(entry.url);
          extension = module?.default as UiExtension;
          if (!extension || typeof extension !== 'object' || extension.id !== entry.name) throw new Error(`UI extension id must equal plugin name ${entry.name}`);
          if (Object.hasOwn(coreGrants, extension.id)) throw new Error(`Plugin ${entry.name} cannot replace a built-in surface`);
          createExtensionRegistry([extension], { [entry.name]: entry.grants }, { [entry.name]: entry.icon }); // validate alone first
          modules.set(entry.name, { hash: entry.hash, extension });
        }
        extensions.push(extension); grants[entry.name] = entry.grants; icons[entry.name] = typeof entry.icon === 'string' ? entry.icon : null;
        for (const [href, page] of Object.entries(entry.applications ?? {})) applications[href] = `${entry.name}/${page}`;
      } catch (error) { errors[entry.name] = error instanceof Error ? error.message : String(error); }
    }));
    if (current !== generation) return state;
    for (const name of [...modules.keys()]) if (!manifest.plugins.some(entry => entry.name === name)) modules.delete(name);
    let registry: ExtensionRegistry;
    try { registry = createExtensionRegistry(extensions, grants, icons); }
    catch (error) { // e.g. two plugins claiming the same Canvas kind: keep the core working
      registry = createExtensionRegistry(coreExtensions, coreGrants); errors.registry = error instanceof Error ? error.message : String(error);
    }
    state = { registry, applications, errors, loaded: true };
    emit(); return state;
  }
  let stopLive: (() => void) | undefined;
  return {
    getState: () => state,
    refresh,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /** Load once and follow plugins.changed (and reconnect resync) without a page reload. */
    start() {
      if (stopLive) return;
      installHostRuntime();
      void refresh();
      stopLive = subscribeLive({ name: 'plugin-ui-runtime', types: ['plugins.changed'], onEvent: () => { void refresh(); }, resync: () => { void refresh(); }, onError: error => console.warn('Plugin UI live updates unavailable', error) });
    },
    stop() { stopLive?.(); stopLive = undefined; controller?.abort(); },
  };
}

export const pluginRuntime = createPluginRuntime();

/** Current extension registry (core + approved runtime plugins); re-renders on change. */
export function usePluginUi(): PluginUiState {
  return useSyncExternalStore(pluginRuntime.subscribe, pluginRuntime.getState, pluginRuntime.getState);
}
