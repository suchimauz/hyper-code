/** dsh-style Canvas tab model: local Start pages beside the agent's real Hyper canvas items. */
export type CanvasItemTab = { id: number; title: string; icon: string; active: boolean; kind?: string; args?: Record<string, unknown>; state?: Record<string, unknown> };
/** A local tab opened from a Start-page launcher; `launcher` is its registry key "<extension>/<id>". */
export type CanvasLauncherTab = { n: number; launcher: string };
/** Local tabs: Start pages and launcher pages share one counter so every key stays unique. */
export type CanvasTabsStore = { starts: number[]; pages: CanvasLauncherTab[]; next: number; selected: string | null };
/** Launcher key of the former built-in Terminal, now the terminal plugin. */
export const LEGACY_TERMINAL_LAUNCHER = 'terminal/terminal';

export const startKey = (n: number) => `start-${n}`;
export const itemKey = (id: number) => `item-${id}`;
export const pageKey = (n: number) => `page-${n}`;
const storageKey = (agentId: string) => `hyper.canvas.tabs.${agentId}`;

/** Saved Start tabs and selection for one agent; invalid or missing data yields one Start tab. */
export function readTabs(agentId: string): CanvasTabsStore {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(agentId)) || 'null');
    const ints = (list: unknown): list is number[] => Array.isArray(list) && list.every(n => Number.isInteger(n));
    if (value && ints(value.starts) && Number.isInteger(value.next)) {
      const launcherKey = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9-]{0,63}\/[a-z][a-z0-9-]{0,63}$/.test(v);
      const pages: CanvasLauncherTab[] = Array.isArray(value.pages)
        ? value.pages.filter((p: unknown): p is CanvasLauncherTab => !!p && Number.isInteger((p as CanvasLauncherTab).n) && launcherKey((p as CanvasLauncherTab).launcher))
        // Older stores kept built-in Terminal tabs as `terms`: they now belong to the terminal plugin.
        : ints(value.terms) ? value.terms.map((n: number) => ({ n, launcher: LEGACY_TERMINAL_LAUNCHER })) : [];
      let selected = typeof value.selected === 'string' ? value.selected : null;
      if (selected?.startsWith('terminal-')) selected = `page-${selected.slice('terminal-'.length)}`;
      return { starts: value.starts, pages, next: Math.max(value.next, ...[...value.starts, ...pages.map(p => p.n)].map(n => n + 1)), selected };
    }
  } catch { /* Corrupt or unavailable storage falls back to the default page. */ }
  return { starts: [1], pages: [], next: 2, selected: null };
}

export function writeTabs(agentId: string, store: CanvasTabsStore) {
  try { localStorage.setItem(storageKey(agentId), JSON.stringify(store)); } catch { /* Tabs still work in memory. */ }
}

/** Validate the authenticated state endpoint's plain tab metadata; no frame DOM is read. */
export function parseCanvasTabs(value: unknown): CanvasItemTab[] {
  const items = (value as { items?: unknown })?.items;
  if (!Array.isArray(items)) throw new Error('Invalid Canvas state');
  return items.map(item => {
    if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || typeof item.title !== 'string' || typeof item.active !== 'boolean') throw new Error('Invalid Canvas tab');
    return { id: item.id, title: item.title, icon: typeof item.icon === 'string' ? item.icon : 'square', active: item.active, ...(typeof item.kind === 'string' ? { kind: item.kind } : {}), ...(item.args && typeof item.args === 'object' && !Array.isArray(item.args) ? { args: item.args } : {}), ...(item.state && typeof item.state === 'object' && !Array.isArray(item.state) ? { state: item.state } : {}) };
  });
}

/** The tab to show: an explicit valid choice, else the agent's active item, else the first Start page. */
export function resolveSelected(store: CanvasTabsStore, items: CanvasItemTab[]): string | null {
  const keys = new Set([...store.starts.map(startKey), ...store.pages.map(p => pageKey(p.n)), ...items.map(item => itemKey(item.id))]);
  if (store.selected && keys.has(store.selected)) return store.selected;
  const active = items.find(item => item.active) ?? items[0];
  if (active) return itemKey(active.id);
  return store.starts.length ? startKey(store.starts[0]!) : null;
}
