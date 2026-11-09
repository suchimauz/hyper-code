import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Panel, Stack, requestJson, type ExtensionViewProps, type UiExtension } from '@hyper/ui';

const models = ['codex:gpt-6-luna', 'claude-code:claude-haiku-4-5', 'codex:gpt-5.6-luna', 'groq:openai/gpt-oss-20b', 'groq:openai/gpt-oss-120b', 'groq:qwen/qwen3.8-27b', 'openrouter:z-ai/glm-5.3-flash'];
function Autotext({ context }: ExtensionViewProps) {
  const [text, setText] = useState(''), [model, setModel] = useState(models[0]), [auto, setAuto] = useState(false), [rewrite, setRewrite] = useState(true);
  const [preview, setPreview] = useState<{ text: string; start: number; end: number } | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null), pending = useRef<AbortController | null>(null);
  function cancel() { pending.current?.abort(); pending.current = null; setBusy(false); setPreview(null); }
  async function suggest() {
    cancel(); if (context.readOnly) return;
    const cursor = editor.current?.selectionStart ?? text.length, before = text.slice(0, cursor), after = text.slice(cursor);
    if (!before.trim()) return;
    const tail = before.split(/(?<=[.!?\n])\s/).pop()?.slice(-300) ?? '';
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError('');
    try {
      const result = await requestJson<{ text: string; replaceChars?: number }>('/autotext/suggest', { method: 'POST', signal: controller.signal, body: { model, before, after, rewrite: rewrite && tail.length >= 2, tail } });
      if (!controller.signal.aborted) setPreview(result.text ? { text: result.text, start: cursor - (result.replaceChars ?? 0), end: cursor } : null);
    } catch (cause) { if (!controller.signal.aborted) setError(String(cause)); }
    finally { if (!controller.signal.aborted) { setBusy(false); pending.current = null; } }
  }
  function accept() { if (preview) { setText(text.slice(0, preview.start) + preview.text + text.slice(preview.end)); setPreview(null); editor.current?.focus(); } }
  useEffect(() => { if (!auto || !text || context.readOnly) return; const timer = setTimeout(() => { void suggest(); }, 3000); return () => clearTimeout(timer); }, [text, model, auto, rewrite, context.readOnly]);
  useEffect(() => () => pending.current?.abort(), []);
  return <Panel title="Autotext lab"><Stack><p>Compare short prose continuations. Drafts stay in this page; requesting a suggestion sends surrounding text to the selected model.</p>
    <label>Model <select value={model} onChange={e => { cancel(); setModel(e.target.value); }}>{models.map(m => <option key={m}>{m}</option>)}</select></label>
    <label><input type="checkbox" checked={auto} onChange={e => { cancel(); setAuto(e.target.checked); }} /> Suggest after 3 seconds</label>
    <label><input type="checkbox" checked={rewrite} onChange={e => { cancel(); setRewrite(e.target.checked); }} /> Fix sentence and continue</label>
    <label>Article draft<textarea ref={editor} value={text} rows={14} maxLength={16000} style={{ width: '100%' }} onChange={e => { cancel(); setText(e.target.value); }} onClick={cancel} onKeyDown={e => { if (e.key === 'Escape') cancel(); else if (e.key === 'Tab' && preview) { e.preventDefault(); accept(); } else if (e.code === 'Space' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void suggest(); } else if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') cancel(); }} /></label>
    <Button disabled={busy || context.readOnly || !text.trim()} onClick={() => void suggest()}>Suggest</Button>
    {busy && <p role="status">Requesting suggestion…</p>}{error && <p role="alert">{error}</p>}
    {preview && <section aria-label="Suggested replacement"><p>{preview.start < preview.end ? 'Replace sentence tail with:' : 'Insert at cursor:'}</p><p style={{ whiteSpace: 'pre-wrap' }}>{preview.text}</p><Button onClick={accept}>Accept (Tab)</Button><Button onClick={cancel}>Dismiss (Esc)</Button></section>}
  </Stack></Panel>;
}

type UpdateData = { csrfToken: string; status: { state: string; message: string; current?: string; target?: string; upstream?: string; clean: boolean } };
function Update({ context }: ExtensionViewProps) {
  const [data, setData] = useState<UpdateData | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), [message, setMessage] = useState('');
  async function refresh(check = false, signal?: AbortSignal) { setError(''); try { setData(await requestJson<UpdateData>('/update/status' + (check ? '?check=1' : ''), { signal })); } catch (cause) { if (!signal?.aborted) setError(String(cause)); } }
  useEffect(() => { const controller = new AbortController(); void refresh(false, controller.signal); return () => controller.abort(); }, []);
  async function apply() { if (!data || context.readOnly) return; setConfirm(false); setBusy(true); setError(''); try { const result = await requestJson<{message:string}>('/update/apply', { method: 'POST', csrfToken: data.csrfToken, body: { confirmed: true, target: data.status.target } }); setMessage(result.message); } catch (cause) { setError(String(cause)); } finally { setBusy(false); } }
  return <Panel title="Hyper update"><Stack><p>Owner-only administration. Updating requires a clean checkout and fast-forward history. Hyper will restart; active work may be interrupted.</p>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {data && <><p role="status">{data.status.message}</p><dl><dt>Current</dt><dd>{data.status.current || '—'}</dd><dt>Target</dt><dd>{data.status.target || '—'}</dd><dt>Upstream</dt><dd>{data.status.upstream || '—'}</dd><dt>Working tree</dt><dd>{data.status.clean ? 'Clean' : 'Dirty'}</dd></dl></>}
    <Button disabled={busy || context.readOnly} onClick={() => void refresh(true)}>Check upstream</Button><Button disabled={busy || context.readOnly || data?.status.state !== 'available'} onClick={() => setConfirm(true)}>Update and restart…</Button>
    <Dialog open={confirm} onOpenChange={setConfirm} title="Update and restart Hyper?"><p>Apply target {data?.status.target} and restart the server. Active connections will disconnect. No change occurs until you confirm.</p><Button onClick={() => setConfirm(false)}>Cancel</Button><Button disabled={busy || context.readOnly} onClick={() => void apply()}>Confirm update and restart</Button></Dialog>
  </Stack></Panel>;
}
export const utilityExtension: UiExtension = { id: 'utilities', apiVersion: 1, pages: [{ id: 'autotext', title: 'Autotext', component: Autotext }, { id: 'update', title: 'Hyper update', component: Update }], navigation: [{ page: 'autotext', title: 'Autotext' }, { page: 'update', title: 'Hyper update' }] };
