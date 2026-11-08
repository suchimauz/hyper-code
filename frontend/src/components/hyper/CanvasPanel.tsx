import { useCallback, useEffect, useRef, useState } from 'react';
import { AppWindow, Compass, FileText, FolderOpen, Globe, Maximize, Minimize, PanelRightClose, Plus, Square, SquareTerminal, X } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import embedStyles from './canvas-embed.css?inline';
import { itemKey, readShellTabs, readTabs, resolveSelected, startKey, termKey, writeTabs, type CanvasItemTab, type CanvasTabsStore } from './canvasTabs';
import { CanvasTerminal } from './CanvasTerminal';
import './canvas-panel.css';

type CanvasShell = Window & { hyperCanvas?: { setAgent: (id: string) => boolean } };
type Props = { agentId: string; revision: string | null; theme: 'light' | 'dark'; onClose: () => void; expanded: boolean; onExpand: () => void };
const shellUrl = (agentId: string) => `/canvas/${encodeURIComponent(agentId)}/mobile?embed=1`;
/** dsh dockkit close/appear timing; the CSS keyframes use the same values. */
const CLOSE_MS = 120;

function ItemIcon({ icon }: { icon: string }) {
  if (icon === 'file-text') return <FileText size={14} aria-hidden="true" />;
  if (icon === 'folder' || icon === 'folder-open') return <FolderOpen size={14} aria-hidden="true" />;
  if (icon === 'globe') return <Globe size={14} aria-hidden="true" />;
  if (icon === 'browser') return <AppWindow size={14} aria-hidden="true" />;
  return <Square size={14} aria-hidden="true" />;
}

async function canvasPost(agentId: string, body: object) {
  const response = await fetch(`/canvas/${encodeURIComponent(agentId)}`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.text().catch(() => '')) || `Canvas: HTTP ${response.status}`);
  return response.json() as Promise<{ activeItemId: number | null }>;
}

/** The dsh guide page: the default content of a new tab, with one capsule per available page. */
export function CanvasStartPage({ onFiles, onTerminal, busy, error }: { onFiles: () => void; onTerminal: () => void; busy: boolean; error: string | null }) {
  return <div className="canvas-start" role="tabpanel" aria-label="Start">
    <div className="canvas-start-column">
      <div className="canvas-start-hero" aria-hidden="true"><Compass size={56} strokeWidth={1} /></div>
      <button type="button" className="canvas-start-entry" onClick={onFiles} disabled={busy}>
        <span className="canvas-start-icon"><FolderOpen size={22} strokeWidth={1.5} aria-hidden="true" /></span>
        <span className="canvas-start-text"><span className="canvas-start-title">Workspace files</span><span className="canvas-start-description">{busy ? 'Открываем…' : 'Файлы рабочей папки чата'}</span></span>
      </button>
      <button type="button" className="canvas-start-entry" onClick={onTerminal} disabled={busy}>
        <span className="canvas-start-icon"><SquareTerminal size={22} strokeWidth={1.5} aria-hidden="true" /></span>
        <span className="canvas-start-text"><span className="canvas-start-title">Terminal</span><span className="canvas-start-description">Оболочка в рабочей папке чата</span></span>
      </button>
      {error && <p className="canvas-start-error" role="alert">{error}</p>}
    </div>
  </div>;
}

/** Embed the authenticated, agent-bound Canvas under a dsh-style React tab strip.
 * Start tabs are local pages (saved per agent); item tabs mirror the agent's real canvas items, whose
 * bodies stay in the trusted shell iframe. The shell's own header is hidden and only read as data.
 * Inner HTML/URL frames keep their original CSP and sandbox. Switching agents rebinds the shell in place. */
export function CanvasPanel({ agentId, theme, onClose, expanded, onExpand }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [src] = useState(() => shellUrl(agentId));
  const bound = useRef(agentId);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [store, setStoreState] = useState<CanvasTabsStore>(() => readTabs(agentId));
  const [items, setItems] = useState<CanvasItemTab[]>([]);
  const [closing, setClosing] = useState<Set<string>>(() => new Set());
  const [opening, setOpening] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const lastActive = useRef<number | null>(null);
  const knownItems = useRef<Set<number> | null>(null);
  const setStore = useCallback((update: (value: CanvasTabsStore) => CanvasTabsStore) => {
    setStoreState(value => { const next = update(value); writeTabs(bound.current, next); return next; });
  }, []);

  /** Follow the shell's tab data; a newly opened or newly activated item (by the agent or a link) comes to the front. */
  const sync = useCallback(() => {
    let doc: Document | null | undefined;
    try { doc = frame.current?.contentDocument; } catch { return; }
    const next = readShellTabs(doc, bound.current);
    if (!next) return;
    setItems(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    const active = next.find(item => item.active)?.id ?? null;
    const known = knownItems.current;
    const added = known ? next.find(item => !known.has(item.id)) : undefined;
    const activated = known && active !== null && active !== lastActive.current;
    knownItems.current = new Set(next.map(item => item.id));
    lastActive.current = active;
    const focus = added?.id ?? (activated ? active : null);
    if (focus !== null && focus !== undefined) setStore(value => ({ ...value, selected: itemKey(focus) }));
  }, [setStore]);

  const decorate = useCallback(() => {
    try {
      const doc = frame.current?.contentDocument;
      if (!doc?.querySelector('[data-mobile-canvas]')) { setError(true); return; }
      let style = doc.getElementById('hyper-react-canvas-style');
      if (!style) { style = doc.createElement('style'); style.id = 'hyper-react-canvas-style'; doc.head.append(style); }
      style.textContent = embedStyles;
      doc.documentElement.dataset.theme = theme;
      doc.documentElement.dataset.reactTabs = '';
      setReady(true); setError(false);
    } catch { setError(true); }
  }, [theme]);
  const load = useCallback(() => {
    // A load after an agent switch the shell could not take (not ready yet) must show the current agent.
    const root = frame.current?.contentDocument?.querySelector('[data-canvas-agent]');
    if (root && root.getAttribute('data-canvas-agent') !== bound.current) {
      (frame.current?.contentWindow as CanvasShell | null)?.hyperCanvas?.setAgent(bound.current);
    }
    decorate();
    sync();
  }, [decorate, sync]);
  useEffect(() => { if (ready) decorate(); }, [decorate, ready]);
  // The shell swaps its panel HTML on every change; observe it instead of polling.
  useEffect(() => {
    if (!ready) return;
    let doc: Document | null | undefined;
    try { doc = frame.current?.contentDocument; } catch { return; }
    const view = doc?.defaultView as (Window & typeof globalThis) | null | undefined;
    const Observer = view?.MutationObserver ?? MutationObserver;
    if (!doc?.body) return;
    const observer = new Observer(() => sync());
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current', 'data-canvas-agent'] });
    sync();
    return () => observer.disconnect();
  }, [ready, sync]);
  useEffect(() => {
    if (bound.current === agentId) return;
    bound.current = agentId;
    setStoreState(readTabs(agentId)); setItems([]); knownItems.current = null; lastActive.current = null; setStartError(null);
    const shell = frame.current?.contentWindow as CanvasShell | null;
    if (ready && shell?.hyperCanvas?.setAgent) { shell.hyperCanvas.setAgent(agentId); return; }
    // Older shell without in-place rebinding: load the new agent's page.
    setReady(false); setError(false);
    if (frame.current) frame.current.src = shellUrl(agentId);
  }, [agentId, ready]);
  const retry = () => { setReady(false); setError(false); if (frame.current) frame.current.src = shellUrl(bound.current); };

  // Every tab gone (also when the agent closed its items) leaves a fresh Start page, like dsh's guide.
  // A just-opened item that the shell has not drawn yet is pending, not gone.
  const pending = !!store.selected?.startsWith('item-') && !items.some(item => itemKey(item.id) === store.selected);
  useEffect(() => {
    if (ready && !opening && !pending && items.length === 0 && store.starts.length === 0 && store.terms.length === 0) setStore(value => ({ ...value, starts: [value.next], next: value.next + 1, selected: startKey(value.next) }));
  }, [ready, opening, pending, items.length, store.starts.length, store.terms.length, setStore]);
  const selected = resolveSelected(store, items);
  const selectedItem = items.find(item => itemKey(item.id) === selected) ?? null;
  const select = (key: string) => {
    setStore(value => ({ ...value, selected: key }));
    const item = items.find(entry => itemKey(entry.id) === key);
    if (item && !item.active) void canvasPost(bound.current, { activeItemId: item.id }).catch(() => undefined);
  };
  const addStart = () => setStore(value => ({ ...value, starts: [...value.starts, value.next], next: value.next + 1, selected: startKey(value.next) }));
  const order = [...items.map(item => itemKey(item.id)), ...store.terms.map(termKey), ...store.starts.map(startKey)];
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
        // Closing a Terminal tab unmounts it, which closes its socket and so kills the shell.
        const terms = item ? value.terms : value.terms.filter(n => termKey(n) !== key);
        // The last tab closed leaves a fresh Start page, like dsh's guide.
        const empty = starts.length === 0 && terms.length === 0 && items.length - (item ? 1 : 0) === 0;
        return { terms, starts: empty ? [value.next] : starts, next: empty ? value.next + 1 : value.next, selected: empty ? startKey(value.next) : value.selected === key ? neighbour : value.selected };
      });
      if (item) {
        setItems(list => list.filter(entry => entry.id !== item.id));
        void canvasPost(bound.current, { closeItemId: item.id }).catch(() => undefined);
      }
    }, CLOSE_MS);
  };
  const openFiles = async (startTab: string) => {
    setOpening(true); setStartError(null);
    try {
      const state = await canvasPost(bound.current, { show: { kind: 'file', args: { path: '.' } } });
      // The Start page becomes the opened page, as a dsh guide capsule does.
      setStore(value => ({ ...value, starts: value.starts.filter(n => startKey(n) !== startTab), selected: state.activeItemId == null ? value.selected : itemKey(state.activeItemId) }));
    } catch (failure) {
      setStartError(failure instanceof Error ? failure.message : String(failure));
    } finally { setOpening(false); }
  };
  // The Start page becomes a Terminal page with the next free number.
  const openTerminal = (startTab: string) => setStore(value => ({ ...value, starts: value.starts.filter(n => startKey(n) !== startTab), terms: [...value.terms, value.next], next: value.next + 1, selected: termKey(value.next) }));
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
  const onLocal = onStart || (selected?.startsWith('terminal-') ?? false);

  return <section className="live-canvas" aria-label="Canvas">
    <div className="canvas-strip">
      <div className="canvas-tabs" role="tablist" aria-label="Вкладки Canvas" onKeyDown={onStrip}>
        {items.map(item => tab(itemKey(item.id), item.title, <ItemIcon icon={item.icon} />))}
        {store.terms.map((n, index) => tab(termKey(n), index === 0 ? 'Terminal' : `Terminal ${index + 1}`, <SquareTerminal size={14} aria-hidden="true" />))}
        {store.starts.map(n => tab(startKey(n), 'Start', <Compass size={14} aria-hidden="true" />))}
        <button type="button" className="canvas-add-tab" aria-label="Новая вкладка" title="Новая вкладка" onClick={addStart}><Plus size={16} aria-hidden="true" /></button>
      </div>
      <div className="canvas-window-actions">
        <IconButton label={expanded ? 'Вернуть ширину Canvas' : 'Развернуть Canvas'} onClick={onExpand}>{expanded ? <Minimize size={16} /> : <Maximize size={16} />}</IconButton>
        <IconButton label="Свернуть Canvas" onClick={onClose}><PanelRightClose size={16} /></IconButton>
      </div>
    </div>
    <div className="canvas-body">
      {onStart && selected && <CanvasStartPage key={selected} onFiles={() => void openFiles(selected)} onTerminal={() => openTerminal(selected)} busy={opening} error={startError} />}
      {store.terms.map(n => <CanvasTerminal key={`${agentId}:${n}`} agentId={agentId} theme={theme} active={selected === termKey(n)} />)}
      {!onLocal && !ready && !error && <div className="canvas-loading" role="status">Загружаем Canvas…</div>}
      {error && <div className="canvas-load-error" role="alert">Не удалось загрузить Canvas. <button onClick={retry}>Повторить</button> <a href={shellUrl(agentId)} target="_blank" rel="noreferrer">Открыть отдельно</a></div>}
      <iframe ref={frame} title="Canvas Hyper" src={src} onLoad={load} aria-hidden={onLocal || undefined}
        className={`canvas-frame${ready ? ' ready' : ''}${onLocal || (ready && !selectedItem) ? ' behind' : ''}`} />
    </div>
  </section>;
}
