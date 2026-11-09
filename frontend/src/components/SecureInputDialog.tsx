import { useEffect, useRef, useState } from 'react';
import './SecureInputDialog.css';

type Prompt = { id: string; title: string; name: string; message: string; kind: 'password' | 'text' | 'otp'; maxlength: number; expiresAt: number };
/** Host-only transient dialog. The value lives in an uncontrolled DOM input, never app state or telemetry. */
export function SecureInputDialog() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const token = useRef('');
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const active = useRef<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  function clear() {
    if (input.current) input.current.value = '';
    active.current = null;
    token.current = '';
    pending.current?.abort(); pending.current = null;
    setPrompt(null); setBusy(false); setError('');
  }
  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch('/secureInput/current', { credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal });
        if (stopped) return;
        if (response.status === 401 || response.status === 403) { clear(); return; }
        if (!response.ok) throw new Error('Unavailable');
        const data = await response.json() as { prompt: Prompt | null; csrfToken?: string };
        if (!stopped) {
          if (token.current && token.current !== data.csrfToken) clear();
          token.current = data.csrfToken ?? '';
          if (data.prompt && data.prompt.expiresAt <= Date.now()) data.prompt = null;
          if (active.current !== (data.prompt?.id ?? null)) {
            pending.current?.abort(); pending.current = null; setBusy(false);
            if (input.current) input.current.value = '';
            active.current = data.prompt?.id ?? null;
            setError(''); setPrompt(data.prompt);
          }
        }
      } catch {
        if (!stopped && active.current) setError('Connection unavailable. Your input has not been sent.');
      } finally { if (!stopped) timer = setTimeout(() => { void refresh(); }, 1500); }
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); pending.current?.abort(); active.current = null; token.current = ''; if (input.current) input.current.value = ''; };
  }, []);
  useEffect(() => {
    const node = dialog.current;
    if (!prompt || !node) return;
    const previous = document.activeElement as HTMLElement | null;
    const field = input.current;
    node.showModal(); field?.focus();
    const expiry = setTimeout(clear, Math.max(0, prompt.expiresAt - Date.now()));
    return () => { if (field) field.value = ''; clearTimeout(expiry); node.close(); previous?.focus(); };
  }, [prompt?.id]);
  async function submit(cancel = false) {
    if (!prompt || busy || pending.current || !token.current) return;
    if (prompt.expiresAt <= Date.now()) { clear(); return; }
    const id = prompt.id;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError('');
    try {
      const response = await fetch('/secureInput/submit', { method: 'POST', signal: controller.signal, credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token.current }, body: JSON.stringify(cancel ? { id, cancel: true } : { id, value: input.current?.value ?? '' }) });
      if (controller.signal.aborted || active.current !== id) return;
      if (response.status === 401 || response.status === 403) { clear(); return; }
      // Never render response text: transport errors must not echo sensitive content.
      if (!response.ok && response.status !== 404) { setError(response.status === 400 ? 'Check the value and its length, then try again.' : 'Unable to send. Reload if your session expired.'); return; }
      if (active.current === id) { if (input.current) input.current.value = ''; active.current = null; setPrompt(null); }
    } catch { if (!controller.signal.aborted && active.current === id) setError('Connection unavailable. Please try again.'); }
    finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }
  if (!prompt) return null;
  return <dialog ref={dialog} aria-labelledby="secure-input-title" aria-describedby="secure-input-description" onCancel={event => { event.preventDefault(); void submit(true); }} className="secure-input-dialog">
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <h2 id="secure-input-title" >{prompt.title}</h2>
      <p id="secure-input-description" >{prompt.message || 'Sent directly to the waiting operation, not to the conversation.'}</p>
      <label  htmlFor="secure-input-value">{prompt.name}</label>
      <input key={prompt.id} ref={input} id="secure-input-value" type={prompt.kind === 'password' ? 'password' : 'text'} inputMode={prompt.kind === 'otp' ? 'numeric' : undefined} autoComplete="off" spellCheck={false} maxLength={prompt.maxlength} required disabled={busy}  />
      {error && <p role="alert" >{error}</p>}
      <div className="secure-input-actions"><button type="button" disabled={busy} onClick={() => { void submit(true); }} >Cancel</button><button type="submit" disabled={busy} >{busy ? 'Sending…' : 'Continue'}</button></div>
    </form>
  </dialog>;
}
