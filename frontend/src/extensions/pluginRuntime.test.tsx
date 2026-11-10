import { describe, expect, it, vi } from 'vitest';
import { createPluginRuntime, type PluginUiManifest } from './pluginRuntime';
import type { UiExtension } from './types';

const page = (id: string): UiExtension => ({ id, apiVersion: 1, pages: [{ id: 'overview', title: id, component: () => null }] });
const entry = (name: string, hash: string) => ({ name, hash, url: `/plugins/ui/${name}/${hash}.js`, grants: { pages: ['overview'] }, applications: { [`/${name}`]: 'overview' } });

describe('runtime plugin UI registry', () => {
  it('loads approved bundles dynamically, hot-replaces on a new hash and removes plugins', async () => {
    let manifest: PluginUiManifest = { apiVersion: 1, plugins: [entry('alpha', 'a'.repeat(16))] };
    const importer = vi.fn(async (url: string) => ({ default: { ...page('alpha'), pages: [{ id: 'overview', title: url, component: () => null }] } }));
    const runtime = createPluginRuntime({ importer, fetchManifest: async () => manifest });
    const listener = vi.fn(); runtime.subscribe(listener);
    let state = await runtime.refresh();
    expect(state.registry.pages.map(p => p.key)).toContain('alpha/overview');
    expect(state.applications['/alpha']).toBe('alpha/overview');
    await runtime.refresh(); expect(importer).toHaveBeenCalledTimes(1); // cached by hash
    manifest = { apiVersion: 1, plugins: [entry('alpha', 'b'.repeat(16))] };
    state = await runtime.refresh();
    expect(importer).toHaveBeenCalledTimes(2);
    expect(state.registry.pages.find(p => p.key === 'alpha/overview')?.title).toBe(`/plugins/ui/alpha/${'b'.repeat(16)}.js`);
    manifest = { apiVersion: 1, plugins: [] };
    state = await runtime.refresh();
    expect(state.registry.pages.some(p => p.key.startsWith('alpha/'))).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it('isolates broken plugins and rejects id mismatch, core override and ungranted surfaces', async () => {
    const modules: Record<string, unknown> = { good: page('good'), wrong: page('other'), settings: page('settings'), boom: null, greedy: { ...page('greedy'), canvasKinds: [{ kind: 'greedy.x', component: () => null }] } };
    const runtime = createPluginRuntime({
      importer: async url => { const name = url.split('/')[3]!; if (name === 'boom') throw new Error('syntax error'); return { default: modules[name] }; },
      fetchManifest: async () => ({ apiVersion: 1, plugins: ['good', 'wrong', 'settings', 'boom', 'greedy'].map(n => entry(n, 'c'.repeat(16))) }),
    });
    const state = await runtime.refresh();
    expect(state.registry.pages.map(p => p.key)).toContain('good/overview');
    expect(state.registry.pages.map(p => p.key)).toContain('settings/overview');
    expect(Object.keys(state.errors).sort()).toEqual(['boom', 'settings', 'wrong']);
    expect(state.registry.canvasKinds.some(k => k.kind === 'greedy.x')).toBe(false); // ungranted surface never reaches a slot
    expect(state.errors.boom).toMatch(/syntax error/);
  });

  it('keeps core surfaces when the manifest is unavailable', async () => {
    const runtime = createPluginRuntime({ importer: vi.fn(), fetchManifest: async () => { throw new Error('offline'); } });
    const state = await runtime.refresh();
    expect(state.loaded).toBe(true);
    expect(state.errors.manifest).toBe('offline');
    expect(state.registry.pages.map(p => p.key)).toContain('documentation/search');
  });
});

it('inputKinds survive approved manifest grants and disappear when approval is absent', async () => {
 const extension: UiExtension = {id:'alpha',apiVersion:1,inputKinds:[{kind:'alpha-review',component:()=>null}]};
 let manifest: PluginUiManifest = {apiVersion:1,plugins:[{...entry('alpha','a'.repeat(16)),grants:{inputKinds:['alpha-review']}}]};
 const importer=vi.fn(async()=>({default:extension}));
 const runtime=createPluginRuntime({importer,fetchManifest:async()=>manifest});
 expect((await runtime.refresh()).registry.inputKinds.map(k=>k.kind)).toEqual(['alpha-review']);
 manifest={apiVersion:1,plugins:[]};
 expect((await runtime.refresh()).registry.inputKinds).toHaveLength(0);
 expect(importer).toHaveBeenCalledTimes(1);
});
