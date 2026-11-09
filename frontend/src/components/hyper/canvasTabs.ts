/** dsh-style Canvas tab model: local Start pages beside the agent's real Hyper canvas items. */
export type CanvasItemTab = { id: number; title: string; icon: string; active: boolean; kind?: string; args?: Record<string, unknown>; state?: Record<string, unknown> };
/** Local tabs: Start pages and Terminal pages share one counter so every key stays unique. */
export type CanvasTabsStore = { starts: number[]; terms: number[]; next: number; selected: string | null };

export const startKey = (n: number) => `start-${n}`;
export const itemKey = (id: number) => `item-${id}`;
export const termKey = (n: number) => `terminal-${n}`;
const storageKey = (agentId: string) => `hyper.canvas.tabs.${agentId}`;

/** Saved Start tabs and selection for one agent; invalid or missing data yields one Start tab. */
export function readTabs(agentId: string): CanvasTabsStore {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(agentId)) || 'null');
    const ints = (list: unknown): list is number[] => Array.isArray(list) && list.every(n => Number.isInteger(n));
    if (value && ints(value.starts) && Number.isInteger(value.next)) {
      const terms = ints(value.terms) ? value.terms : [];
      return { starts: value.starts, terms, next: Math.max(value.next, ...[...value.starts, ...terms].map(n => n + 1)), selected: typeof value.selected === 'string' ? value.selected : null };
    }
  } catch { /* Corrupt or unavailable storage falls back to the default page. */ }
  return { starts: [1], terms: [], next: 2, selected: null };
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
  const keys = new Set([...store.starts.map(startKey), ...store.terms.map(termKey), ...items.map(item => itemKey(item.id))]);
  if (store.selected && keys.has(store.selected)) return store.selected;
  const active = items.find(item => item.active) ?? items[0];
  if (active) return itemKey(active.id);
  return store.starts.length ? startKey(store.starts[0]!) : null;
}
