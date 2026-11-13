import type { ExtensionGrant, ExtensionRegistry, UiExtension } from './types';

/** Build a snapshot from an explicit host allowlist; ungranted entries never reach a slot.
 * `icons` maps extension id → its plugin icon, the default for launchers without their own. */
export function createExtensionRegistry(extensions: readonly UiExtension[], grants: Readonly<Record<string, ExtensionGrant>>, icons: Readonly<Record<string, string | null | undefined>> = {}): ExtensionRegistry {
  const inputKinds: ExtensionRegistry['inputKinds'][number][] = [];
  const pages: ExtensionRegistry['pages'][number][] = [];
  const navigation: ExtensionRegistry['navigation'][number][] = [];
  const sidebarNavigation: ExtensionRegistry['sidebarNavigation'][number][] = [];
  const panels: ExtensionRegistry['panels'][number][] = [];
  const actions: ExtensionRegistry['actions'][number][] = [];
  const canvasKinds: ExtensionRegistry['canvasKinds'][number][] = [];
  const canvasLaunchers: ExtensionRegistry['canvasLaunchers'][number][] = [];
  const modelProviders: ExtensionRegistry['modelProviders'][number][] = [];
  const chatCards: ExtensionRegistry['chatCards'][number][] = [];
  const iconClass = (icon: unknown) => typeof icon === 'string' && /^ph-[a-z0-9-]{1,64}$/.test(icon) ? icon : null;
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
    const seenInputs = new Set<string>();
    for (const entry of extension.inputKinds ?? []) {
      if (!/^[a-z][a-zA-Z0-9.-]{0,99}$/.test(entry.kind) || seenInputs.has(entry.kind) || typeof entry.component !== 'function' || (entry.batchComponent !== undefined && typeof entry.batchComponent !== 'function')) throw new Error(`Invalid input kind: ${entry.kind}`);
      seenInputs.add(entry.kind);
      if (!grant?.inputKinds?.includes(entry.kind)) continue;
      if (['secret', 'choice', 'confirm', 'grid', 'batch'].includes(entry.kind) || !(entry.kind.startsWith(extension.id + '-') || entry.kind.startsWith(extension.id + '.'))) throw new Error(`Input kind must belong to extension: ${entry.kind}`);
      if (inputKinds.some(kind => kind.kind === entry.kind)) throw new Error(`Duplicate input kind: ${entry.kind}`);
      inputKinds.push(Object.freeze({ ...entry, key: `${extension.id}/${entry.kind}` }));
    }
    const seenKinds = new Set<string>();
    for (const entry of extension.canvasKinds ?? []) {
      if (!/^[a-zA-Z][\w-]*\.[a-zA-Z][\w.-]*$/.test(entry.kind) || seenKinds.has(entry.kind)) throw new Error(`Invalid Canvas kind: ${entry.kind}`);
      seenKinds.add(entry.kind);
      if (!grant?.canvasKinds?.includes(entry.kind)) continue;
      if (canvasKinds.some(kind => kind.kind === entry.kind)) throw new Error(`Duplicate Canvas kind: ${entry.kind}`);
      canvasKinds.push(Object.freeze({ ...entry, key: `${extension.id}/${entry.kind}` }));
    }
    const seenLaunchers = new Set<string>();
    for (const entry of extension.canvasLaunchers ?? []) {
      if (!valid(entry.id) || seenLaunchers.has(entry.id) || !entry.title?.trim() || (typeof entry.component !== 'function') === (typeof entry.open !== 'function')) throw new Error(`Invalid Canvas launcher: ${extension.id}/${entry.id}`);
      seenLaunchers.add(entry.id);
      if (!grant?.canvasLaunchers?.includes(entry.id)) continue;
      const icon = iconClass(entry.icon) ?? iconClass(Object.hasOwn(icons, extension.id) ? icons[extension.id] : null);
      canvasLaunchers.push(Object.freeze({ ...entry, key: `${extension.id}/${entry.id}`, icon }));
    }
    const seenProviders = new Set<string>();
    for (const entry of extension.modelProviders ?? []) {
      if (typeof entry.provider !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(entry.provider) || seenProviders.has(entry.provider) || typeof entry.component !== 'function') throw new Error(`Invalid model provider component: ${extension.id}/${String(entry.provider)}`);
      seenProviders.add(entry.provider);
      if (!grant?.modelProviders?.includes(entry.provider)) continue;
      if (modelProviders.some(p => p.provider === entry.provider)) throw new Error(`Duplicate model provider component: ${entry.provider}`);
      modelProviders.push(Object.freeze({ ...entry, key: `${extension.id}/${entry.provider}` }));
    }
    const seenCards = new Set<string>();
    for (const entry of extension.chatCards ?? []) {
      if (typeof entry.kind !== 'string' || !entry.kind.startsWith(extension.id + '.') || !/^[a-z][a-z0-9-]*\.[a-z][a-zA-Z0-9.-]{0,63}$/.test(entry.kind) || seenCards.has(entry.kind) || typeof entry.component !== 'function') throw new Error(`Invalid chat card: ${extension.id}/${String(entry.kind)}`);
      seenCards.add(entry.kind);
      if (!grant?.chatCards?.includes(entry.kind)) continue;
      if (chatCards.some(card => card.kind === entry.kind)) throw new Error(`Duplicate chat card: ${entry.kind}`);
      chatCards.push(Object.freeze({ ...entry, key: `${extension.id}/${entry.kind}` }));
    }
    for (const placement of ['navigation', 'sidebarNavigation'] as const) {
    const seenNav = new Set<string>();
    for (const item of extension[placement] ?? []) {
      if (!extension.pages?.some(page => page.id === item.page) || seenNav.has(item.page) || !item.title.trim()) throw new Error(`Invalid navigation: ${extension.id}/${item.page}`);
      seenNav.add(item.page);
      const key = `${extension.id}/${item.page}`;
      if (pages.some(page => page.key === key) && (placement === 'navigation' || grant?.sidebarNavigation?.includes(item.page))) {
        (placement === 'navigation' ? navigation : sidebarNavigation).push(Object.freeze({ key, title: item.title }));
      }
    }
    }
  }
  return Object.freeze({ inputKinds: Object.freeze(inputKinds), sidebarNavigation: Object.freeze(sidebarNavigation), canvasKinds: Object.freeze(canvasKinds), canvasLaunchers: Object.freeze(canvasLaunchers), modelProviders: Object.freeze(modelProviders), chatCards: Object.freeze(chatCards), pages: Object.freeze(pages), navigation: Object.freeze(navigation), panels: Object.freeze(panels), actions: Object.freeze(actions) });
}
