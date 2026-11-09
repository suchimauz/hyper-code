import { useCallback, useEffect, useState } from 'react';
import { requestJson, subscribeLive } from '../../sdk';

type PendingUi = { name: string; source: string; hash: string | null; grants: Record<string, string[]>; error: string | null; reason: 'unapproved' | 'changed' | 'failed' };

/** Plugin browser UIs awaiting human review: exact hash and requested grants, or the build error. */
export function PluginUiReview() {
  const [pending, setPending] = useState<PendingUi[]>([]);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    try { const data = await requestJson<{ pending?: PendingUi[]; csrfToken?: string }>('/plugins/ui/manifest'); setPending(data.pending ?? []); setToken(data.csrfToken ?? ''); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }, []);
  useEffect(() => { void load(); return subscribeLive({ name: 'plugin-ui-review', types: ['plugins.changed'], onEvent: () => void load(), resync: () => void load(), onError: () => setError('Live updates unavailable; refresh the page.') }); }, [load]);
  const decide = async (item: PendingUi, revoke: boolean) => {
    if (!item.hash) return;
    setBusy(item.name);
    try { await requestJson('/plugins/ui/approve', { method: 'POST', body: { name: item.name, hash: item.hash, revoke }, csrfToken: token }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(''); }
  };
  if (!pending.length && !error) return null;
  return <section className="plugins-section plugins-ui-review" aria-label="Plugin interfaces awaiting review">
    <h3>Plugin interfaces <span>{pending.length}</span></h3>
    {error && <p className="plugins-error" role="alert">{error}</p>}
    <ul className="plugins-list">{pending.map(item => <li key={item.name} className="plugins-card">
      <div><strong>{item.name}</strong> <small>{item.source} · {item.reason === 'failed' ? 'build failed' : item.reason === 'changed' ? 'changed since approval' : 'not approved'}</small>
        {item.error ? <pre className="plugins-error">{item.error}</pre> : <p className="plugins-muted">Bundle {item.hash} requests {Object.entries(item.grants).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ') || 'no surfaces'}. Plugin UI runs as trusted same-origin code.</p>}
      </div>
      {!item.error && item.hash && token && <div className="plugins-tools">
        <button className="plugins-add is-single" disabled={busy === item.name} onClick={() => void decide(item, false)}>Approve</button>
        {item.reason === 'changed' && <button className="plugins-add is-single" disabled={busy === item.name} onClick={() => void decide(item, true)}>Revoke</button>}
      </div>}
    </li>)}</ul>
  </section>;
}
