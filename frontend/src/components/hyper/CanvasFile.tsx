import { useEffect, useState } from 'react';
import { requestJson } from '../../sdk/api';
import type { CanvasItemTab } from './canvasTabs';

type FileData = { path: string; content?: string; isDir?: boolean; preview?: boolean; entries?: { name: string; isDir: boolean }[] };
/** Native text editor and directory browser; binary/rich previews retain their isolated document. */
export function CanvasFile({ agentId, item, theme, refresh }: { agentId: string; item: CanvasItemTab; theme: 'light' | 'dark'; refresh: () => void }) {
  const [data, setData] = useState<FileData | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const endpoint = `/canvas/${encodeURIComponent(agentId)}/item/${item.id}`;
  const path = String(item.args?.path ?? '');
  const dirty = data?.content !== undefined && draft !== data.content;
  useEffect(() => {
    let cancelled = false;
    setData(null); setError(''); setPreview(false);
    requestJson<FileData>(endpoint, { method: 'POST', body: { fileAction: 'read' } }).then(value => {
      if (!cancelled) { setData(value); setDraft(value.content ?? ''); }
    }).catch(reason => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, [endpoint, path]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const save = async () => {
    setBusy(true); setError('');
    try { const next = await requestJson<FileData>(endpoint, { method: 'POST', body: { fileAction: 'save', content: draft, expectedContent: data?.content } }); setData(next); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };
  const navigate = async (target: string) => {
    setBusy(true); setError('');
    try { await requestJson(`/canvas/${encodeURIComponent(agentId)}`, { method: 'POST', body: { navigate: { itemId: item.id, file: { path: target, host: item.args?.host } } } }); refresh(); }
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
    {(data?.preview || preview) && <iframe className="canvas-frame ready" title={`Просмотр ${path}`} src={`/canvas/${encodeURIComponent(agentId)}/item/${item.id}/document?theme=${theme}`} />}
  </section>;
}
