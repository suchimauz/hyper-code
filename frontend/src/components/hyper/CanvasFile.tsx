import { useEffect, useState } from 'react';
import { requestJson } from '../../sdk/api';
import type { CanvasItemTab } from './canvasTabs';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export type FileData = { path: string; content?: string; isDir?: boolean; preview?: boolean; previewKind?: 'image' | 'video' | 'audio' | 'pdf' | 'html' | 'markdown' | 'text' | 'download'; size?: number; entries?: { name: string; isDir: boolean }[] };
export type FileTransport = { read: () => Promise<FileData>; save: (content: string, expectedContent: string) => Promise<FileData>; navigate: (path: string) => Promise<void>; documentUrl: string };
/** Native file editor, directory browser and rich previews. Active documents remain sandboxed. */
export function CanvasFile({ agentId, item, refresh, csrfToken, transport }: { agentId: string; item: CanvasItemTab; theme: 'light' | 'dark'; refresh: () => void; csrfToken: string; transport?: FileTransport }) {
  const [data, setData] = useState<FileData | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const endpoint = `/canvas/${encodeURIComponent(agentId)}/item/${item.id}`;
  const path = data?.path ?? String(item.args?.path ?? '');
  const documentUrl = transport?.documentUrl ?? `${endpoint}/document`;
  const dirty = data?.content !== undefined && draft !== data.content;
  const host = String(item.args?.host || 'local');
  const assetPath = (target: string) => `${host !== 'local' ? `/files/remote/${encodeURIComponent(host)}` : '/files/absolute'}${target.split('/').map(encodeURIComponent).join('/')}`;
  const baseUrl = new URL(assetPath(path), window.location.origin);
  const resolveAsset = (value: string) => new URL(value, baseUrl).href;
  // No scripts or same-origin permission. Our base precedes document-supplied bases.
  const htmlPreview = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${window.location.origin}/files/ data: blob:; media-src ${window.location.origin}/files/; style-src ${window.location.origin}/files/ 'unsafe-inline'; font-src ${window.location.origin}/files/; form-action 'none'; base-uri ${window.location.origin}/files/"><base href="${baseUrl.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${draft}`;
  useEffect(() => {
    if (!csrfToken) return;
    let cancelled = false;
    setData(null); setError(''); setPreview(false);
    (transport ? transport.read() : requestJson<FileData>(endpoint, { method: 'POST', csrfToken, body: { fileAction: 'read' } })).then(value => {
      if (!cancelled) { setData(value); setDraft(value.content ?? ''); setPreview(item.args?.mode === 'preview' || (item.args?.mode !== 'source' && ['markdown', 'html'].includes(value.previewKind ?? ''))); }
    }).catch(reason => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, [endpoint, item.args?.path, csrfToken, transport]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const save = async () => {
    setBusy(true); setError('');
    try { const next = await (transport ? transport.save(draft, data?.content ?? '') : requestJson<FileData>(endpoint, { method: 'POST', csrfToken, body: { fileAction: 'save', content: draft, expectedContent: data?.content } })); setData(next); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };
  const navigate = async (target: string) => {
    setBusy(true); setError('');
    try { if (transport) await transport.navigate(target); else { await requestJson(`/canvas/${encodeURIComponent(agentId)}`, { method: 'POST', csrfToken, body: { navigate: { itemId: item.id, file: { path: target, host: item.args?.host } } } }); refresh(); } }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };
  return <section className="canvas-file" aria-label={`Файл ${path}`}>
    <div className="canvas-file-toolbar"><span title={path}>{path}</span>
      {data?.content !== undefined && <><button disabled={busy || !dirty} onClick={() => void save()}>Сохранить{dirty ? ' *' : ''}</button><button disabled={dirty} onClick={() => setPreview(!preview)}>{preview ? 'Текст' : 'Просмотр'}</button></>}
    </div>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Загружаем файл…</p>}
    {data?.isDir && <nav aria-label="Содержимое папки"><button disabled={busy} onClick={() => void navigate(path.replace(/\/+$/, '').replace(/\/[^/]*$/, '') || '/')}>.. / Родительская папка</button>{data.entries?.map(entry => <button key={entry.name} disabled={busy} onClick={() => void navigate(`${path.replace(/\/+$/, '')}/${entry.name}`)}>{entry.isDir ? '▸ ' : ''}{entry.name}</button>)}</nav>}
    {data?.content !== undefined && !preview && <textarea aria-label="Текст файла" spellCheck={false} value={draft} disabled={busy} onChange={event => setDraft(event.target.value)} />}
    {(data?.preview || preview) && <div className="canvas-file-preview" style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
      {data?.previewKind === 'image' ? <img src={documentUrl} alt={path.split('/').pop() ?? path} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        : data?.previewKind === 'audio' ? <audio controls preload="metadata" src={documentUrl} aria-label={`Аудио ${path}`} />
        : data?.previewKind === 'video' ? <video controls preload="metadata" src={documentUrl} aria-label={`Видео ${path}`} style={{ maxWidth: '100%', maxHeight: '100%' }} />
        : data?.previewKind === 'pdf' || data?.previewKind === 'html' ? <iframe className="canvas-frame ready" sandbox="" referrerPolicy="no-referrer" title={`Просмотр ${path}`} src={data.previewKind === 'html' && data.content !== undefined ? undefined : documentUrl} srcDoc={data.previewKind === 'html' && data.content !== undefined ? htmlPreview : undefined} />
        : data?.previewKind === 'markdown' ? <div className="markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: ({ src, ...props }) => <img {...props} src={src ? resolveAsset(src) : undefined} />, a: ({ href, ...props }) => <a {...props} href={href ? resolveAsset(href) : undefined} /> }}>{draft}</Markdown></div>
        : data?.content !== undefined ? <pre style={{ whiteSpace: 'pre-wrap' }}>{draft}</pre>
        : <p>Предпросмотр недоступен для большого или двоичного файла{data?.size !== undefined ? ` (${data.size} байт)` : ''}.</p>}
      <a href={`${documentUrl}${documentUrl.includes('?') ? '&' : '?'}download=1`} download>Скачать файл</a>
    </div>}
  </section>;
}
