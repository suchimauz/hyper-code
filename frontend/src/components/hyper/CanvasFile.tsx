import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { ChevronRight, Code, Download, Eye, File, FileCode, FileImage, FileJson, FileText, Folder, FolderOpen, PanelLeftClose, PanelLeftOpen, RefreshCw, Save, WrapText } from 'lucide-react';
import { requestJson } from '../../sdk/api';
import type { CanvasItemTab } from './canvasTabs';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeEditor } from './CodeEditor';

export type FileEntry = { name: string; isDir: boolean };
export type FileData = { path: string; root?: string; content?: string; isDir?: boolean; preview?: boolean; previewKind?: 'image' | 'video' | 'audio' | 'pdf' | 'html' | 'markdown' | 'text' | 'download'; size?: number; entries?: FileEntry[] };
export type FileTransport = { read: () => Promise<FileData>; save: (content: string, expectedContent: string) => Promise<FileData>; navigate: (path: string) => Promise<void>; documentUrl: string };
type Level = { entries?: FileEntry[]; loading?: boolean; error?: string };

const join = (dir: string, name: string) => `${dir.replace(/\/+$/, '')}/${name}`;
const parentOf = (path: string) => path.replace(/\/+$/, '').replace(/\/[^/]*$/, '') || '/';
const inside = (root: string, path: string) => path === root || path.startsWith(`${root.replace(/\/+$/, '')}/`);
const WIDTH_KEY = 'hyper.canvas.files.width';
const OPEN_KEY = 'hyper.canvas.files.tree';
const WRAP_KEY = 'hyper.canvas.files.wrap';

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (/^(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/.test(ext)) return <FileImage size={15} aria-hidden="true" className="ft-icon ft-image" />;
  if (/^(json|jsonc|ya?ml|toml)$/.test(ext)) return <FileJson size={15} aria-hidden="true" className="ft-icon ft-data" />;
  if (/^(md|markdown|mdx|txt|rst)$/.test(ext)) return <FileText size={15} aria-hidden="true" className="ft-icon ft-doc" />;
  if (/^(m?[jt]sx?|c[jt]s|py|rb|go|rs|java|kt|c|h|cpp|cs|php|sh|clj[sc]?|edn|sql|css|scss|html?|vue|swift|lua)$/.test(ext)) return <FileCode size={15} aria-hidden="true" className="ft-icon ft-code" />;
  return <File size={15} aria-hidden="true" className="ft-icon" />;
}

/** Workspace tree beside a file viewer: dirs listed lazily one level at a time, expansion kept in memory. */
function FileTree({ root, levels, expanded, current, onToggle, onOpen }: { root: string; levels: Record<string, Level>; expanded: Set<string>; current: string; onToggle: (path: string) => void; onOpen: (path: string) => void }) {
  const rows: { path: string; name: string; isDir: boolean; depth: number }[] = [];
  const notes: Record<number, string> = {};
  const walk = (dir: string, depth: number) => {
    const level = levels[dir];
    if (!level || level.loading) { notes[rows.length] = 'Загрузка…'; rows.push({ path: `${dir}#note`, name: '', isDir: false, depth }); return; }
    if (level.error) { notes[rows.length] = level.error; rows.push({ path: `${dir}#note`, name: '', isDir: false, depth }); return; }
    for (const entry of level.entries ?? []) {
      const path = join(dir, entry.name);
      rows.push({ path, name: entry.name, isDir: entry.isDir, depth });
      if (entry.isDir && expanded.has(path)) walk(path, depth + 1);
    }
  };
  walk(root, 0);
  const focusRow = (from: HTMLElement, step: number) => {
    const all = Array.from(from.closest('[role="tree"]')?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []);
    all[Math.max(0, Math.min(all.length - 1, all.indexOf(from) + step))]?.focus();
  };
  const onKey = (event: ReactKeyboardEvent<HTMLElement>, row: { path: string; isDir: boolean }) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); focusRow(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1); }
    else if (event.key === 'ArrowRight' && row.isDir && !expanded.has(row.path)) { event.preventDefault(); onToggle(row.path); }
    else if (event.key === 'ArrowLeft' && row.isDir && expanded.has(row.path)) { event.preventDefault(); onToggle(row.path); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (row.isDir) onToggle(row.path); else onOpen(row.path); }
  };
  return <ul className="ft-tree" role="tree" aria-label="Файлы рабочей папки">
    {rows.map((row, index) => notes[index] !== undefined
      ? <li key={row.path} className="ft-note" style={{ '--depth': row.depth } as CSSProperties}>{notes[index]}</li>
      : <li key={row.path} role="treeitem" tabIndex={row.path === current || (index === 0 && !rows.some(r => r.path === current)) ? 0 : -1}
          aria-expanded={row.isDir ? expanded.has(row.path) : undefined} aria-selected={row.path === current}
          className={`ft-row${row.path === current ? ' ft-current' : ''}${row.name.startsWith('.') ? ' ft-hidden' : ''}`}
          style={{ '--depth': row.depth } as CSSProperties} title={row.path}
          onClick={() => row.isDir ? onToggle(row.path) : onOpen(row.path)} onKeyDown={event => onKey(event, row)}>
          {row.isDir ? <><ChevronRight size={13} aria-hidden="true" className={`ft-chevron${expanded.has(row.path) ? ' ft-open' : ''}`} />{expanded.has(row.path) ? <FolderOpen size={15} aria-hidden="true" className="ft-icon ft-folder" /> : <Folder size={15} aria-hidden="true" className="ft-icon ft-folder" />}</>
            : <><span className="ft-chevron-space" /><FileIcon name={row.name} /></>}
          <span className="ft-name">{row.name}</span>
        </li>)}
  </ul>;
}

/** Native file viewer: workspace tree on the left, CodeMirror editor and rich previews on the right. Active documents remain sandboxed. */
export function CanvasFile({ agentId, item, theme, refresh, csrfToken, transport }: { agentId: string; item: CanvasItemTab; theme: 'light' | 'dark'; refresh: () => void; csrfToken: string; transport?: FileTransport }) {
  const endpoint = `/canvas/${encodeURIComponent(agentId)}/item/${item.id}`;
  const pinned = String(item.args?.path ?? '');
  const host = String(item.args?.host || 'local');
  const [current, setCurrent] = useState(() => typeof item.state?.openPath === 'string' ? item.state.openPath : pinned);
  const [data, setData] = useState<FileData | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [root, setRoot] = useState(typeof item.args?.root === 'string' ? item.args.root : '');
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [treeOpen, setTreeOpen] = useState(() => !transport && localStorage.getItem(OPEN_KEY) !== '0');
  const [width, setWidth] = useState(() => Math.min(480, Math.max(160, Number(localStorage.getItem(WIDTH_KEY)) || 240)));
  const [wrap, setWrap] = useState(() => localStorage.getItem(WRAP_KEY) === '1');
  const toggleWrap = () => setWrap(value => { localStorage.setItem(WRAP_KEY, value ? '0' : '1'); return !value; });
  const cache = useRef(new Map<string, FileData>());
  const loaded = useRef('');
  const tree = !transport && !!root;
  const path = data?.path ?? current;
  const dirty = data?.content !== undefined && draft !== data.content;
  const fileQuery = path && path !== pinned ? `?path=${encodeURIComponent(path)}` : '';
  const documentUrl = transport?.documentUrl ?? `${endpoint}/document${fileQuery}`;
  const assetPath = (target: string) => `${host !== 'local' ? `/files/remote/${encodeURIComponent(host)}` : '/files/absolute'}${target.split('/').map(encodeURIComponent).join('/')}`;
  const baseUrl = new URL(assetPath(path), window.location.origin);
  const resolveAsset = (value: string) => new URL(value, baseUrl).href;
  // No scripts or same-origin permission. Our base precedes document-supplied bases.
  const htmlPreview = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${window.location.origin}/files/ data: blob:; media-src ${window.location.origin}/files/; style-src ${window.location.origin}/files/ 'unsafe-inline'; font-src ${window.location.origin}/files/; form-action 'none'; base-uri ${window.location.origin}/files/"><base href="${baseUrl.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${draft}`;

  const call = useCallback(<T,>(body: Record<string, unknown>) => requestJson<T>(endpoint, { method: 'POST', csrfToken, body }), [endpoint, csrfToken]);
  const show = (value: FileData) => {
    setData(value); setDraft(value.content ?? '');
    setPreview(item.args?.mode === 'preview' || (item.args?.mode !== 'source' && ['markdown', 'html'].includes(value.previewKind ?? '')));
    if (value.root && !root) setRoot(value.root);
    if (value.isDir) setLevels(prev => ({ ...prev, [value.path]: { entries: value.entries } }));
  };
  // Pinned target (or the path the tab last showed) loads once per pin; tree clicks reuse this session's cache.
  useEffect(() => {
    if (!csrfToken) return;
    const key = `${endpoint}|${pinned}|${host}`;
    if (loaded.current === key) return;
    loaded.current = key;
    let cancelled = false;
    const start = typeof item.state?.openPath === 'string' && item.state.openPath ? item.state.openPath : pinned;
    cache.current.clear(); setLevels({}); setExpanded(new Set()); setData(null); setError(''); setCurrent(start);
    const first = transport ? transport.read() : call<FileData>(start && start !== pinned ? { fileAction: 'read', path: start } : { fileAction: 'read' });
    first.catch(reason => start !== pinned && !transport ? call<FileData>({ fileAction: 'read' }) : Promise.reject(reason))
      .then(value => { if (cancelled) return; cache.current.set(value.path, value); setCurrent(value.path); show(value); })
      .catch(reason => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; loaded.current = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, pinned, host, csrfToken, transport]);
  // Expand the ancestors of the open file once the root is known, and list the root itself.
  const list = useCallback(async (dir: string, force = false) => {
    if (!force && levels[dir]?.entries) return;
    setLevels(prev => ({ ...prev, [dir]: { ...prev[dir], loading: !prev[dir]?.entries } }));
    try { const value = await call<FileData>({ fileAction: 'list', path: dir }); setLevels(prev => ({ ...prev, [dir]: { entries: value.entries ?? [] } })); }
    catch (reason) { setLevels(prev => ({ ...prev, [dir]: { error: String(reason) } })); }
  }, [call, levels]);
  useEffect(() => {
    if (!tree || !csrfToken || !treeOpen) return;
    const want: string[] = [root];
    if (inside(root, current)) for (let dir = parentOf(current); dir !== root && inside(root, dir) && dir !== '/'; dir = parentOf(dir)) want.push(dir);
    if (data?.isDir && data.path !== root) want.push(data.path);
    setExpanded(prev => { const next = new Set(prev); want.slice(1).forEach(d => next.add(d)); return next; });
    for (const dir of want) if (!levels[dir]) void list(dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, root, csrfToken, treeOpen, current]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const open = async (target: string) => {
    if (target === path) return;
    if (dirty && !window.confirm('Есть несохранённые изменения. Открыть другой файл без сохранения?')) return;
    setError(''); setCurrent(target);
    const cached = cache.current.get(target);
    if (cached) show(cached);
    else setData(null);
    try {
      const value = await call<FileData>({ fileAction: 'read', path: target });
      cache.current.set(value.path, value); show(value);
      void call({ state: { openPath: value.path } }).catch(() => undefined);
    } catch (reason) { setError(String(reason)); }
  };
  const toggle = (dir: string) => {
    setExpanded(prev => { const next = new Set(prev); if (next.has(dir)) next.delete(dir); else { next.add(dir); void list(dir); } return next; });
  };
  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true); setError('');
    try {
      const next = await (transport ? transport.save(draft, data?.content ?? '') : call<FileData>({ fileAction: 'save', ...(path !== pinned ? { path } : {}), content: draft, expectedContent: data?.content }));
      cache.current.set(next.path, next); setData(next);
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };
  const reload = async () => {
    setError('');
    if (tree) for (const dir of [root, ...expanded]) void list(dir, true);
    try { const value = transport ? await transport.read() : await call<FileData>(path !== pinned ? { fileAction: 'read', path } : { fileAction: 'read' }); cache.current.set(value.path, value); if (!dirty) show(value); }
    catch (reason) { setError(String(reason)); }
  };
  // Without a tree (standalone Files page) directory rows navigate the page itself.
  const navigate = async (target: string) => {
    if (tree) return open(target);
    setBusy(true); setError('');
    try { if (transport) await transport.navigate(target); else { await requestJson(`/canvas/${encodeURIComponent(agentId)}`, { method: 'POST', csrfToken, body: { navigate: { itemId: item.id, file: { path: target, host: item.args?.host } } } }); refresh(); } }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };
  const crumbs = useMemo(() => {
    const base = tree && inside(root, path) ? root : '';
    const rest = (base ? path.slice(base.length) : path).split('/').filter(Boolean);
    const out: { label: string; path: string }[] = base ? [{ label: base.split('/').filter(Boolean).pop() || '/', path: base }] : [];
    let acc = base.replace(/\/+$/, '');
    for (const part of rest) { acc = `${acc}/${part}`; out.push({ label: part, path: acc }); }
    return out;
  }, [path, root, tree]);
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX, startWidth = width;
    const move = (e: PointerEvent) => setWidth(Math.min(480, Math.max(160, startWidth + e.clientX - startX)));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setWidth(w => { localStorage.setItem(WIDTH_KEY, String(w)); return w; }); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const setTree = (value: boolean) => { setTreeOpen(value); localStorage.setItem(OPEN_KEY, value ? '1' : '0'); };
  const name = path.split('/').filter(Boolean).pop() ?? path;

  return <section className="canvas-file" aria-label={`Файл ${path}`}>
    {tree && treeOpen && <aside className="ft-pane" style={{ width }} aria-label="Навигатор файлов">
      <div className="ft-head"><span className="ft-root" title={root}>{root.split('/').filter(Boolean).pop() || '/'}</span>
        <button type="button" className="cf-icon" aria-label="Обновить" title="Обновить" onClick={() => void reload()}><RefreshCw size={14} /></button>
        <button type="button" className="cf-icon" aria-label="Скрыть дерево" title="Скрыть дерево" onClick={() => setTree(false)}><PanelLeftClose size={14} /></button>
      </div>
      <div className="ft-scroll"><FileTree root={root} levels={levels} expanded={expanded} current={path} onToggle={toggle} onOpen={target => void open(target)} /></div>
      <div className="ft-resize" role="separator" aria-orientation="vertical" aria-label="Ширина дерева" aria-valuenow={width} aria-valuemin={160} aria-valuemax={480} tabIndex={0}
        onPointerDown={startResize} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const w = Math.min(480, Math.max(160, width + (event.key === 'ArrowRight' ? 20 : -20))); setWidth(w); localStorage.setItem(WIDTH_KEY, String(w)); } }} />
    </aside>}
    <div className="cf-main">
      <div className="canvas-file-toolbar">
        {tree && !treeOpen && <button type="button" className="cf-icon" aria-label="Показать дерево" title="Показать дерево" onClick={() => setTree(true)}><PanelLeftOpen size={14} /></button>}
        <nav className="cf-crumbs" aria-label="Путь" title={path}>
          {crumbs.map((crumb, index) => <span key={crumb.path} className="cf-crumb">
            {index > 0 && <ChevronRight size={12} aria-hidden="true" className="cf-sep" />}
            {index < crumbs.length - 1 ? <button type="button" onClick={() => void navigate(crumb.path)}>{crumb.label}</button> : <span aria-current="page">{crumb.label}{dirty ? ' •' : ''}</span>}
          </span>)}
        </nav>
        {data?.content !== undefined && ['markdown', 'html'].includes(data.previewKind ?? '') && <button type="button" className="cf-icon" aria-pressed={preview} aria-label={preview ? 'Текст' : 'Просмотр'} title={preview ? 'Показать текст' : 'Показать просмотр'} onClick={() => setPreview(!preview)}>{preview ? <Code size={14} /> : <Eye size={14} />}</button>}
        {data?.content !== undefined && !preview && <button type="button" className="cf-icon" aria-pressed={wrap} aria-label="Перенос строк" title={wrap ? 'Не переносить длинные строки' : 'Переносить длинные строки'} onClick={toggleWrap}><WrapText size={14} /></button>}
        {data?.content !== undefined && <button type="button" className="cf-save" disabled={busy || !dirty} onClick={() => void save()} title="Сохранить (⌘S / Ctrl+S)"><Save size={14} aria-hidden="true" />Сохранить{dirty ? ' *' : ''}</button>}
        {data && !data.isDir && <a className="cf-icon" href={`${documentUrl}${documentUrl.includes('?') ? '&' : '?'}download=1`} download={name} aria-label="Скачать файл" title="Скачать"><Download size={14} /></a>}
      </div>
      {error && <p role="alert" className="cf-error">{error}</p>}
      {!data && !error && <p role="status" className="cf-status">Загружаем файл…</p>}
      {data?.isDir && <nav className="cf-dir" aria-label="Содержимое папки">
        {!tree && <button type="button" disabled={busy} onClick={() => void navigate(parentOf(path))}>.. / Родительская папка</button>}
        {data.entries?.map(entry => <button type="button" key={entry.name} disabled={busy} onClick={() => void navigate(join(path, entry.name))}>{entry.isDir ? <Folder size={15} aria-hidden="true" className="ft-icon ft-folder" /> : <FileIcon name={entry.name} />}<span>{entry.name}</span></button>)}
        {data.entries?.length === 0 && <p className="cf-status">Папка пуста.</p>}
      </nav>}
      {data?.content !== undefined && !preview && <CodeEditor docKey={`${item.id}:${data.path}`} path={data.path} value={data.content} theme={theme} readOnly={busy} wrap={wrap} onChange={setDraft} onSave={() => void save()} />}
      {(data?.preview || (preview && data?.content !== undefined)) && <div className="canvas-file-preview">
        {data?.previewKind === 'image' ? <div className="cf-media"><img src={documentUrl} alt={name} /></div>
          : data?.previewKind === 'audio' ? <div className="cf-media"><audio controls preload="metadata" src={documentUrl} aria-label={`Аудио ${path}`} /></div>
          : data?.previewKind === 'video' ? <div className="cf-media"><video controls preload="metadata" src={documentUrl} aria-label={`Видео ${path}`} /></div>
          : data?.previewKind === 'pdf' || data?.previewKind === 'html' ? <iframe className="canvas-frame ready" sandbox="" referrerPolicy="no-referrer" title={`Просмотр ${path}`} src={data.previewKind === 'html' && data.content !== undefined ? undefined : documentUrl} srcDoc={data.previewKind === 'html' && data.content !== undefined ? htmlPreview : undefined} />
          : data?.previewKind === 'markdown' ? <div className="markdown cf-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: ({ src, ...props }) => <img {...props} src={typeof src === 'string' ? resolveAsset(src) : undefined} />, a: ({ href, ...props }) => <a {...props} href={href ? resolveAsset(href) : undefined} /> }}>{draft}</Markdown></div>
          : data?.content !== undefined ? <pre className="cf-pre">{draft}</pre>
          : <p className="cf-status">Предпросмотр недоступен для большого или двоичного файла{data?.size !== undefined ? ` (${data.size} байт)` : ''}.</p>}
      </div>}
    </div>
  </section>;
}
