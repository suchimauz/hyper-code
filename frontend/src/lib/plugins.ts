import { requestJson } from './hyper';

export type InstalledPlugin = {
  name: string; label: string; description: string; icon: string | null; version: string | null; source: string;
  namespaces: string[]; functions: number; routes: number; hasSkill: boolean; configurable: boolean;
};
export type PluginSelection = { provider: string; name: string; revision: string; source: Record<string, string> };
export type MarketItem = { name: string; label: string; description: string; icon: string | null; version: string | null; mounted: boolean; selection?: PluginSelection; reviewable?: boolean };
export type MarketSection = { provider: string; label: string; errors: string[]; items: MarketItem[] };

const PATH = '/ui-lab-api/plugins';

export async function getPlugins(signal?: AbortSignal) {
  const data = await requestJson<{ plugins: InstalledPlugin[]; csrfToken: string }>(PATH, { signal });
  if (!Array.isArray(data.plugins) || typeof data.csrfToken !== 'string') throw new Error('Не удалось загрузить плагины');
  return data;
}

export type SourcePlugin = { name: string; label?: string; description?: string; version?: string; selection?: PluginSelection; previousSelection?: PluginSelection; managed: boolean; modified?: boolean; status: string; mounted: boolean };
export type SourceProvider = { id: string; label: string; description: string; configurationHref: string | null };
export function getPluginSources(signal?: AbortSignal) {
  return requestJson<{ sources: SourcePlugin[]; providers: SourceProvider[]; errors: string[] }>(`${PATH}?sources=1`, { signal });
}

export async function searchPluginMarket(q: string, signal?: AbortSignal, provider = '') {
  const data = await requestJson<{ sections: MarketSection[] }>(`${PATH}?market=1&q=${encodeURIComponent(q)}&provider=${encodeURIComponent(provider)}`, { signal });
  if (!Array.isArray(data.sections)) throw new Error('Не удалось загрузить каталог');
  return data.sections;
}

export function reloadPlugins(csrfToken: string, name?: string) {
  return requestJson<{ ok: boolean }>(PATH, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(name ? { action: 'reload', name } : { action: 'reload' }) });
}

export type PluginDetail = {
  name: string; label: string; description: string; source: string; namespaces: string[]; routes: number; domains: string[];
  overview: string | null; overviewTruncated: boolean;
  functions: { name: string; summary: string; signature: string; returnType: string }[];
  settings: { key: string; title: string; description: string; type: string; secret: boolean; configured: boolean; source: string; value: string | number | boolean | null }[];
  secrets: { name: string; title: string; description: string; required: boolean; configured: boolean }[];
};

export async function getPluginDetail(name: string, signal?: AbortSignal) {
  const data = await requestJson<{ plugin: PluginDetail }>(`${PATH}?plugin=${encodeURIComponent(name)}`, { signal });
  if (!data.plugin || !Array.isArray(data.plugin.functions)) throw new Error('Не удалось загрузить плагин');
  return data.plugin;
}

/** SKILL.md front matter is metadata, not prose for the card. */
export const stripFrontMatter = (text: string) => text.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();

/** Opens Hyper's preview-only install review agent; activation needs separate confirmation there. */
export function reviewPluginInstall(csrfToken: string, selection: PluginSelection, operation: 'install' | 'update' | 'rollback' = 'install') {
  return requestJson<{ ok: boolean; agentId: string }>(PATH, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ action: 'review', selection, operation }) });
}

/** Groups by the real Hyper plugin layer, in dsh section order. */
export const PLUGIN_GROUPS = [
  { source: 'official', title: 'Official plugins' },
  { source: 'user', title: 'Installed plugins' },
] as const;

export function groupPlugins(plugins: InstalledPlugin[], query = '') {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const match = (p: InstalledPlugin) => words.every(w => `${p.name} ${p.label} ${p.description}`.toLocaleLowerCase().includes(w));
  const known = new Set<string>(PLUGIN_GROUPS.map(g => g.source));
  const groups: { title: string; plugins: InstalledPlugin[] }[] = PLUGIN_GROUPS.map(g => ({ title: g.title as string, plugins: plugins.filter(p => p.source === g.source && match(p)) }));
  const other = plugins.filter(p => !known.has(p.source) && match(p));
  if (other.length) groups.push({ title: 'Other plugins', plugins: other });
  return groups.filter(g => g.plugins.length);
}

/** Only Phosphor class names from plugin metadata reach the DOM. */
export const phosphorClass = (icon: string | null) => icon && /^ph-[a-z0-9-]+$/.test(icon) ? icon : null;
