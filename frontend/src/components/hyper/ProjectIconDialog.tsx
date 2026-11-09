import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { requestJson } from '../../lib/hyper';
import './workspace-directory-dialog.css';
import './project-icon-dialog.css';

/** Personal project icon editor. Changing a draft never writes; only Save posts. */
export function ProjectIconDialog({ projectId, title, onClose, onSaved }: { projectId: string; title: string; onClose: () => void; onSaved: (icon: string | null) => void }) {
  const [token, setToken] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [mode, setMode] = useState<'emoji' | 'svg' | 'reset'>('emoji');
  const [emoji, setEmoji] = useState('');
  const [background, setBackground] = useState('#7c3aed');
  const [svg, setSvg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setToken(''); setError('');
    void requestJson<{ icon: string | null; csrfToken: string }>(`/ui-lab-api/project-icon?projectId=${encodeURIComponent(projectId)}`, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setCurrent(data.icon); setSvg(data.icon || ''); setToken(data.csrfToken); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Cannot load icon'); });
    return () => controller.abort();
  }, [projectId, retry]);
  async function save() {
    if (lock.current || !token) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const selection = mode === 'reset' ? { reset: true } : mode === 'svg' ? { svg } : { emoji, background };
      const result = await requestJson<{ ok: boolean; icon: string | null }>('/ui-lab-api/project-icon', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify({ projectId, ...selection }) });
      if (!result.ok) throw new Error('Cannot save icon');
      onSaved(result.icon); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Cannot save icon'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !lock.current) onClose(); }}><Dialog.Portal><Dialog.Backdrop className="workspace-directory-backdrop" /><Dialog.Popup className="workspace-directory-dialog project-icon-dialog">
    <Dialog.Title>Project icon — {title}</Dialog.Title>
    <Dialog.Description>Personal logo shown in project navigation. Changes apply only when you save.</Dialog.Description>
    {current && <img width={32} height={32} alt="Current project icon" src={`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(current)))}`} />}
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={busy || !token}><legend>Icon source</legend>
        <label><input type="radio" name="icon-source" checked={mode === 'emoji'} onChange={() => setMode('emoji')} /> Emoji or letters</label>
        <label><input type="radio" name="icon-source" checked={mode === 'svg'} onChange={() => setMode('svg')} /> Custom SVG</label>
        <label><input type="radio" name="icon-source" checked={mode === 'reset'} onChange={() => setMode('reset')} /> Default folder</label>
        {mode === 'emoji' && <><label>Emoji or up to two letters<input value={emoji} maxLength={8} onChange={event => setEmoji(event.target.value)} /></label><label>Background<select value={background} onChange={event => setBackground(event.target.value)}>{['#7c3aed','#db2777','#dc2626','#ea580c','#ca8a04','#16a34a','#0891b2','#2563eb','#334155'].map(color => <option key={color} value={color}>{color}</option>)}</select></label></>}
        {mode === 'svg' && <label>SVG markup (8 KB maximum after sanitization)<textarea rows={7} value={svg} onChange={event => setSvg(event.target.value)} /></label>}
        {mode === 'reset' && <p>Restore the default folder icon on Save.</p>}
      </fieldset>
      {error && <p role="alert">{error} {!token && <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button>}</p>}
      <div className="workspace-dialog-footer"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" disabled={busy || !token || (mode === 'emoji' ? !emoji.trim() : mode === 'svg' ? !svg.trim() : false)}>{busy ? 'Saving…' : 'Save'}</button></div>
    </form>
  </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
