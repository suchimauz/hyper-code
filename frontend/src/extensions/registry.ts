import type { ExtensionGrant, ExtensionRegistry, UiExtension } from './types';

/** Build a snapshot from an explicit host allowlist; ungranted entries never reach a slot. */
export function createExtensionRegistry(extensions: readonly UiExtension[], grants: Readonly<Record<string, ExtensionGrant>>): ExtensionRegistry {
  const pages: ExtensionRegistry['pages'][number][] = [];
  const navigation: ExtensionRegistry['navigation'][number][] = [];
  const panels: ExtensionRegistry['panels'][number][] = [];
  const actions: ExtensionRegistry['actions'][number][] = [];
  const canvasKinds: ExtensionRegistry['canvasKinds'][number][] = [];
  const ids = new Set<string>();
  const valid = (id: string) => /^[a-z][a-z0-9-]{0,63}$/.test(id);
  for (const extension of extensions) {
    if (!valid(extension.id) || ids.has(extension.id) || extension.apiVersion !== 1) throw new Error(`Invalid UI extension: ${extension.id}`);
    ids.add(extension.id);
    const grant = Object.hasOwn(grants, extension.id) ? grants[extension.id] : undefined;
    for (const [kind, entries] of [['pages', extension.pages], ['panels', extension.panels], ['actions', extension.actions]] as const) {
      const seen = new Set<string>();
      for (const entry of entries ?? []) {
        if (!valid(entry.id) || seen.has(entry.id) || !entry.title.trim()) throw new Error(`Invalid ${kind} entry: ${extension.id}/${entry.id}`);
        seen.add(entry.id);
        if (!grant?.[kind]?.includes(entry.id)) continue;
        const key = `${extension.id}/${entry.id}`;
        if (kind === 'actions') actions.push(Object.freeze({ ...entry, key }) as ExtensionRegistry['actions'][number]);
        else (kind === 'pages' ? pages : panels).push(Object.freeze({ ...entry, key }) as ExtensionRegistry['pages'][number]);
      }
    }
    const seenKinds = new Set<string>();
    for (const entry of extension.canvasKinds ?? []) {
      if (!/^[a-zA-Z][\w-]*\.[a-zA-Z][\w.-]*$/.test(entry.kind) || seenKinds.has(entry.kind)) throw new Error(`Invalid Canvas kind: ${entry.kind}`);
      seenKinds.add(entry.kind);
      if (!grant?.canvasKinds?.includes(entry.kind)) continue;
      if (canvasKinds.some(kind => kind.kind === entry.kind)) throw new Error(`Duplicate Canvas kind: ${entry.kind}`);
      canvasKinds.push(Object.freeze({ ...entry, key: `${extension.id}/${entry.kind}` }));
    }
    const seenNav = new Set<string>();
    for (const item of extension.navigation ?? []) {
      if (!extension.pages?.some(page => page.id === item.page) || seenNav.has(item.page) || !item.title.trim()) throw new Error(`Invalid navigation: ${extension.id}/${item.page}`);
      seenNav.add(item.page);
      const key = `${extension.id}/${item.page}`;
      if (pages.some(page => page.key === key)) navigation.push(Object.freeze({ key, title: item.title }));
    }
  }
  return Object.freeze({ canvasKinds: Object.freeze(canvasKinds), pages: Object.freeze(pages), navigation: Object.freeze(navigation), panels: Object.freeze(panels), actions: Object.freeze(actions) });
}
