import { useEffect, useRef, useState } from 'react';
import { Button, Panel, Stack, requestJson, type ExtensionViewProps, type UiExtension } from '@mauzcode/ui';

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

export const utilityExtension: UiExtension = { id: 'utilities', apiVersion: 1, pages: [{ id: 'autotext', title: 'Autotext', component: Autotext }], navigation: [{ page: 'autotext', title: 'Autotext' }] };
