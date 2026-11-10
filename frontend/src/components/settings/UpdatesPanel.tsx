import { useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { requestJson } from '../../lib/mauzcode';
import { Button } from '../ui/Button';

type UpdateData = { csrfToken: string; status: { state: string; message: string; current?: string; target?: string; upstream?: string; clean: boolean } };

/** Owner-only self-update of this MauzCode checkout, rendered as the last Settings tab.
 * The POST is never sent until a separate explicit confirmation of the displayed target. */
export function UpdatesPanel() {
  const [data, setData] = useState<UpdateData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh(check = false, signal?: AbortSignal) {
    if (!check) { setError(''); }
    else { setMessage(''); setChecking(true); }
    try {
      const next = await requestJson<UpdateData>(`/update/status${check ? '?check=1' : ''}`, { signal });
      setData(next); setError('');
    } catch (cause) { if (!signal?.aborted) { setError(cause instanceof Error ? cause.message : 'Could not load update status.'); } }
    finally { if (check) setChecking(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    void refresh(false, controller.signal);
    return () => controller.abort();
  }, []);

  async function apply() {
    if (!data) return;
    setConfirm(false); setBusy(true); setError(''); setMessage('');
    try {
      const result = await requestJson<{ message: string }>('/update/apply', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken }, body: JSON.stringify({ confirmed: true, target: data.status.target }) });
      setMessage(result.message);
      await refresh(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not apply the update.'); }
    finally { setBusy(false); }
  }

  const status = data?.status;
  return <section className="settings-panel" aria-label="Updates">
    <header className="settings-panel-header">
      <h2>Updates</h2>
      <p className="settings-note">Owner-only administration. Updating requires a clean checkout and fast-forward history. MauzCode will restart; active work may be interrupted.</p>
    </header>
    {error && <p role="alert" className="settings-feedback is-error">{error}</p>}
    {!data && !error && <p role="status" className="settings-loading">Loading update status…</p>}
    {status && <>
      <p role="status" className={`settings-feedback ${message || status.state === 'available' || status.state === 'current' ? 'is-success' : ''}`}>{message || status.message}</p>
      <dl className="settings-kv">
        <div className="settings-kv-row"><dt>Current</dt><dd><code>{status.current || '—'}</code></dd></div>
        <div className="settings-kv-row"><dt>Target</dt><dd><code>{status.target || '—'}</code></dd></div>
        <div className="settings-kv-row"><dt>Upstream</dt><dd><code>{status.upstream || '—'}</code></dd></div>
        <div className="settings-kv-row"><dt>Working tree</dt><dd>{status.clean ? <span>Clean</span> : <span role="warning" className="settings-kv-flag">Dirty</span>}</dd></div>
      </dl>
    </>}
    <div className="settings-actions">
      <Button disabled={busy || checking || !data} onClick={() => { void refresh(true); }}>{checking ? <><RotateCw size={14} strokeWidth={1.5} className="settings-spinner" aria-hidden="true" />Checking…</> : 'Check upstream'}</Button>
      <Button variant="primary" disabled={busy || checking || status?.state !== 'available'} onClick={() => setConfirm(true)}>Update and restart…</Button>
    </div>
    {confirm && <div role="group" aria-label="Confirm update and restart" className="settings-confirm">
      <p className="settings-note">Apply target {status?.target ?? ''} and restart the server. Active connections will disconnect. No change occurs until you confirm.</p>
      <div className="settings-actions">
        <Button disabled={busy} onClick={() => setConfirm(false)}>Cancel</Button>
        <Button variant="primary" disabled={busy} onClick={() => { void apply(); }}>Confirm update and restart</Button>
      </div>
    </div>}
  </section>;
}
