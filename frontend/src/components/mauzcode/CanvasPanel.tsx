import { useCallback, useEffect, useRef, useState } from 'react';
import { AppWindow, Compass, FileText, FolderOpen, Globe, Maximize, Minimize, PanelRightClose, Plus, Square, X } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { itemKey, pageKey, parseCanvasTabs, readTabs, resolveSelected, startKey, writeTabs, type CanvasItemTab, type CanvasLauncherTab, type CanvasTabsStore } from './canvasTabs';
import { usePluginUi } from '../../extensions/pluginRuntime';
import { ExtensionBoundary } from '../../extensions/ExtensionHost';
import type { RegisteredLauncher } from '../../extensions/types';
import { PhosphorIcon } from './PhosphorIcon';
import { CanvasFile } from './CanvasFile';
import { CanvasKind } from './CanvasKind';
import './canvas-panel.css';

type Props = { agentId: string; revision: string | null; theme: 'light' | 'dark'; onClose: () => void; expanded: boolean; onExpand: () => void };
const stateUrl = (agentId: string) => `/canvas/${encodeURIComponent(agentId)}/state`;
/** dsh dockkit close/appear timing; the CSS keyframes use the same values. */
const CLOSE_MS = 120;

function ItemIcon({ icon }: { icon: string }) {
  if (icon === 'file-text') return <FileText size={14} aria-hidden="true" />;
  if (icon === 'folder' || icon === 'folder-open') return <FolderOpen size={14} aria-hidden="true" />;
  if (icon === 'globe') return <Globe size={14} aria-hidden="true" />;
  if (icon === 'browser') return <AppWindow size={14} aria-hidden="true" />;
  return <Square size={14} aria-hidden="true" />;
}

async function canvasPost(agentId: string, body: object, csrfToken: string) {
  const response = await fetch(`/canvas/${encodeURIComponent(agentId)}`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.text().catch(() => '')) || `Canvas: HTTP ${response.status}`);
  return response.json() as Promise<{ activeItemId: number | null }>;
}

/** The dsh guide page: the default content of a new tab, with one capsule per available page. */
export function CanvasStartPage({ onFiles, launchers, onLaunch, busy, error }: { onFiles: () => void; launchers: readonly RegisteredLauncher[]; onLaunch: (key: string) => void; busy: boolean; error: string | null }) {
  return <div className="canvas-start" role="tabpanel" aria-label="Start">
    <div className="canvas-start-column">
      <div className="canvas-start-hero" aria-hidden="true"><Compass size={56} strokeWidth={1} /></div>
      <button type="button" className="canvas-start-entry" onClick={onFiles} disabled={busy}>
        <span className="canvas-start-icon"><FolderOpen size={22} strokeWidth={1.5} aria-hidden="true" /></span>
        <span className="canvas-start-text"><span className="canvas-start-title">Workspace files</span><span className="canvas-start-description">{busy ? 'Открываем…' : 'Файлы рабочей папки чата'}</span></span>
      </button>
      {launchers.map(launcher => <button key={launcher.key} type="button" className="canvas-start-entry" data-launcher={launcher.key} onClick={() => onLaunch(launcher.key)} disabled={busy}>
        <span className="canvas-start-icon"><PhosphorIcon icon={launcher.icon} size={22} /></span>
        <span className="canvas-start-text"><span className="canvas-start-title">{launcher.title}</span>{launcher.description && <span className="canvas-start-description">{launcher.description}</span>}</span>
      </button>)}
      {error && <p className="canvas-start-error" role="alert">{error}</p>}
    </div>
  </div>;
}

/** A local launcher tab: the plugin component, or a notice when its plugin is no longer available. */
function LauncherPage({ page, launcher, loaded, agentId, theme, active }: { page: CanvasLauncherTab; launcher: RegisteredLauncher | undefined; loaded: boolean; agentId: string; theme: 'light' | 'dark'; active: boolean }) {
  const tabId = pageKey(page.n);
  if (!launcher && !loaded) return <div className="canvas-loading" role="status" hidden={!active}>Загружаем плагины…</div>;
  if (!launcher) return <div className="canvas-launcher-missing" role="tabpanel" hidden={!active}>Плагин недоступен: {page.launcher}. Закройте вкладку или включите плагин.</div>;
  const View = launcher.component;
  if (!View) return <div className="canvas-launcher-missing" role="tabpanel" hidden={!active}>{launcher.title} открывается как вкладка Canvas. Закройте эту вкладку.</div>;
  return <div className="canvas-launcher-page" data-launcher={launcher.key} hidden={!active}>
    <ExtensionBoundary key={launcher.key}><View context={{ agentId, theme, readOnly: false }} tabId={tabId} active={active} /></ExtensionBoundary>
  </div>;
}

/** Render authenticated JSON tabs alongside local Start and plugin launcher pages.
 * Content lives in an agent/item-bound compatibility document, not the legacy application shell.
 * Inner HTML/URL frames keep their original CSP and sandbox. */
export function CanvasPanel({ agentId, revision, theme, onClose, expanded, onExpand }: Props) {
  const bound = useRef(agentId);
  const pluginUi = usePluginUi();
  const launchers = pluginUi.registry.canvasLaunchers;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [store, setStoreState] = useState<CanvasTabsStore>(() => readTabs(agentId));
  const [items, setItems] = useState<CanvasItemTab[]>([]);
  const [csrfToken, setCsrfToken] = useState('');
  const [closing, setClosing] = useState<Set<string>>(() => new Set());
  const [opening, setOpening] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const lastActive = useRef<number | null>(null);
  const knownItems = useRef<Set<number> | null>(null);
  const setStore = useCallback((update: (value: CanvasTabsStore) => CanvasTabsStore) => {
    setStoreState(value => { const next = update(value); writeTabs(bound.current, next); return next; });
  }, []);

  // JSON is the sole source of tab metadata. Never inspect the frame DOM.
  const request = useRef(0);
  const sync = useCallback(async () => {
    const id = bound.current;
    const ticket = ++request.current;
    try {
      const response = await fetch(stateUrl(id), { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Canvas state unavailable');
      const data = await response.json();
      const next = parseCanvasTabs(data);
      if (ticket !== request.current || bound.current !== id) return;
      setCsrfToken(typeof data.csrfToken === 'string' ? data.csrfToken : '');
      setItems(next); setReady(true); setError(false);
      const active = next.find(item => item.active)?.id ?? null;
      const known = knownItems.current;
      const added = known ? next.find(item => !known.has(item.id)) : undefined;
      const activated = known && active !== null && active !== lastActive.current;
      knownItems.current = new Set(next.map(item => item.id));
      lastActive.current = active;
      const focus = added?.id ?? (activated ? active : null);
      if (focus != null) setStore(value => ({ ...value, selected: itemKey(focus) }));
    } catch { if (ticket === request.current && bound.current === id) setError(true); }
  }, [setStore]);
  useEffect(() => {
    if (bound.current !== agentId) {
      bound.current = agentId; setStoreState(readTabs(agentId)); setItems([]); setCsrfToken('');
      knownItems.current = null; lastActive.current = null; setStartError(null); setReady(false);
    }
    void sync();
    return () => { request.current++; };
  }, [agentId, revision, sync]);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) void sync(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [sync]);
  const retry = () => { setError(false); void sync(); };

  // Every tab gone (also when the agent closed its items) leaves a fresh Start page, like dsh's guide.
  // A just-opened item that the shell has not drawn yet is pending, not gone.
  const pending = !!store.selected?.startsWith('item-') && !items.some(item => itemKey(item.id) === store.selected);
  useEffect(() => {
    if (ready && !opening && !pending && items.length === 0 && store.starts.length === 0 && store.pages.length === 0) setStore(value => ({ ...value, starts: [value.next], next: value.next + 1, selected: startKey(value.next) }));
  }, [ready, opening, pending, items.length, store.starts.length, store.pages.length, setStore]);
  const selected = resolveSelected(store, items);
  const selectedItem = items.find(item => itemKey(item.id) === selected) ?? null;
  // Keep visited content mounted across all tab switches, preserving unsaved edits.
  const visited = useRef<{ agentId: string; ids: Set<number> }>({ agentId, ids: new Set() });
  if (visited.current.agentId !== agentId) visited.current = { agentId, ids: new Set() };
  if (selectedItem) visited.current.ids.add(selectedItem.id);
  const documentItems = items.filter(item => visited.current.ids.has(item.id));
  const select = (key: string) => {
    setStore(value => ({ ...value, selected: key }));
    const item = items.find(entry => itemKey(entry.id) === key);
    if (item && !item.active) void canvasPost(bound.current, { activeItemId: item.id }, csrfToken).then(() => sync()).catch(() => setError(true));
  };
  const addStart = () => setStore(value => ({ ...value, starts: [...value.starts, value.next], next: value.next + 1, selected: startKey(value.next) }));
  const order = [...items.map(item => itemKey(item.id)), ...store.pages.map(page => pageKey(page.n)), ...store.starts.map(startKey)];
  const close = (key: string) => {
    if (closing.has(key)) return;
    setClosing(set => new Set(set).add(key));
    const index = order.indexOf(key);
    const neighbour = order.filter(entry => entry !== key)[Math.max(0, index - 1)] ?? null;
    window.setTimeout(() => {
      setClosing(set => { const next = new Set(set); next.delete(key); return next; });
      const item = items.find(entry => itemKey(entry.id) === key);
      setStore(value => {
        const starts = item ? value.starts : value.starts.filter(n => startKey(n) !== key);
        // Closing a launcher tab unmounts its component (a Terminal closes its socket and so kills the shell).
        const pages = item ? value.pages : value.pages.filter(page => pageKey(page.n) !== key);
        // The last tab closed leaves a fresh Start page, like dsh's guide.
        const empty = starts.length === 0 && pages.length === 0 && items.length - (item ? 1 : 0) === 0;
        return { pages, starts: empty ? [value.next] : starts, next: empty ? value.next + 1 : value.next, selected: empty ? startKey(value.next) : value.selected === key ? neighbour : value.selected };
      });
      if (item) {
        setItems(list => list.filter(entry => entry.id !== item.id));
        void canvasPost(bound.current, { closeItemId: item.id }, csrfToken).then(() => sync()).catch(() => { setError(true); void sync(); });
      }
    }, CLOSE_MS);
  };
  const openFiles = async (startTab: string) => {
    setOpening(true); setStartError(null);
    try {
      const state = await canvasPost(bound.current, { show: { kind: 'file', args: { path: '.' } } }, csrfToken);
      await sync();
      // The Start page becomes the opened page, as a dsh guide capsule does.
      setStore(value => ({ ...value, starts: value.starts.filter(n => startKey(n) !== startTab), selected: state.activeItemId == null ? value.selected : itemKey(state.activeItemId) }));
    } catch (failure) {
      setStartError(failure instanceof Error ? failure.message : String(failure));
    } finally { setOpening(false); }
  };
  // The Start page becomes the launcher's page with the next free number.
  const openLauncher = (startTab: string, launcher: string) => {
    const entry = launchers.find(item => item.key === launcher);
    if (entry?.open) { void openServerLauncher(startTab, entry.open); return; }
    setStore(value => ({ ...value, starts: value.starts.filter(n => startKey(n) !== startTab), pages: [...value.pages, { n: value.next, launcher }], next: value.next + 1, selected: pageKey(value.next) }));
  };
  // One-step launchers create a server Canvas item; the Start page becomes that item, like Workspace files.
  const openServerLauncher = async (startTab: string, open: (context: { agentId: string; theme: 'light' | 'dark'; readOnly: boolean }) => Promise<{ id: number }>) => {
    setOpening(true); setStartError(null);
    try {
      const item = await open({ agentId, theme, readOnly: false });
      await sync();
      setStore(value => ({ ...value, starts: value.starts.filter(n => startKey(n) !== startTab), selected: typeof item?.id === 'number' ? itemKey(item.id) : value.selected }));
    } catch (failure) {
      setStartError(failure instanceof Error ? failure.message : String(failure));
    } finally { setOpening(false); }
  };
  const onStrip = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = selected ? order.indexOf(selected) : -1;
    const next = order[(index + (event.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
    if (next) { event.preventDefault(); select(next); (event.currentTarget.querySelector(`[data-tab-key="${next}"] .canvas-tab-select`) as HTMLElement | null)?.focus(); }
  };
  const tab = (key: string, title: string, icon: React.ReactNode) => <div key={key} data-tab-key={key} className={`canvas-tab-chip${selected === key ? ' active' : ''}${closing.has(key) ? ' closing' : ''}`}>
    <button type="button" role="tab" aria-selected={selected === key} tabIndex={selected === key ? 0 : -1} className="canvas-tab-select" title={title} onClick={() => select(key)}
      onAuxClick={event => { if (event.button === 1) { event.preventDefault(); close(key); } }}>
      <span className="canvas-tab-title">{icon}<span>{title}</span></span>
    </button>
    <button type="button" className="canvas-tab-close" aria-label={`Закрыть ${title}`} title="Закрыть вкладку" onClick={() => close(key)}><X size={14} aria-hidden="true" /></button>
  </div>;
  const onStart = selected?.startsWith('start-') ?? false;
  const onLocal = onStart || (selected?.startsWith('page-') ?? false);
  const launcherTitle = (page: CanvasLauncherTab) => {
    const base = launchers.find(entry => entry.key === page.launcher)?.title ?? page.launcher;
    const index = store.pages.filter(entry => entry.launcher === page.launcher).indexOf(page);
    return index === 0 ? base : `${base} ${index + 1}`;
  };

  return <section className="live-canvas" aria-label="Canvas">
    <div className="canvas-strip">
      <div className="canvas-tabs" role="tablist" aria-label="Вкладки Canvas" onKeyDown={onStrip}>
        {items.map(item => tab(itemKey(item.id), item.title, <ItemIcon icon={item.icon} />))}
        {store.pages.map(page => tab(pageKey(page.n), launcherTitle(page), <PhosphorIcon icon={launchers.find(entry => entry.key === page.launcher)?.icon ?? null} size={14} />))}
        {store.starts.map(n => tab(startKey(n), 'Start', <Compass size={14} aria-hidden="true" />))}
        <button type="button" className="canvas-add-tab" aria-label="Новая вкладка" title="Новая вкладка" onClick={addStart}><Plus size={16} aria-hidden="true" /></button>
      </div>
      <div className="canvas-window-actions">
        <IconButton label={expanded ? 'Вернуть ширину Canvas' : 'Развернуть Canvas'} onClick={onExpand}>{expanded ? <Minimize size={16} /> : <Maximize size={16} />}</IconButton>
        <IconButton label="Свернуть Canvas" onClick={onClose}><PanelRightClose size={16} /></IconButton>
      </div>
    </div>
    <div className="canvas-body">
      {onStart && selected && <CanvasStartPage key={selected} onFiles={() => void openFiles(selected)} launchers={launchers} onLaunch={key => openLauncher(selected, key)} busy={opening} error={startError} />}
      {store.pages.map(page => <LauncherPage key={`${agentId}:${page.n}`} page={page} launcher={launchers.find(entry => entry.key === page.launcher)} loaded={pluginUi.loaded} agentId={agentId} theme={theme} active={selected === pageKey(page.n)} />)}
      {!onLocal && !ready && !error && <div className="canvas-loading" role="status">Загружаем Canvas…</div>}
      {error && <div className="canvas-load-error" role="alert">Не удалось загрузить Canvas. <button onClick={retry}>Повторить</button></div>}
      {documentItems.map(item => <div key={`${agentId}:${item.id}`} className="canvas-content" hidden={selectedItem?.id !== item.id}>
        {item.kind === 'file' ? <CanvasFile agentId={agentId} item={item} theme={theme} csrfToken={csrfToken} refresh={() => void sync()} /> :
          <CanvasKind agentId={agentId} item={item} theme={theme} />}
      </div>)}
    </div>
  </section>;
}
