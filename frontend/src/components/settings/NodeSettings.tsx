import { useState } from 'react';
import { requestJson } from '../../lib/mauzcode';
import { Button } from '../ui/Button';

type Node = { name: string; url: string; enabled: boolean; modelCount: number };
type Client = { id: string; name: string; providers: string[]; requests: number; tokenHint: string };
/** Owner-only node management; credentials stay in local form state and are cleared after use. */
export function NodeSettings({ nodes, clients, csrfToken, reload }: { nodes: Node[]; clients: Client[]; csrfToken: string; reload: () => Promise<void> }) {
  const [name, setName] = useState(''); const [url, setUrl] = useState(''); const [token, setToken] = useState('');
  const [clientName, setClientName] = useState(''); const [providers, setProviders] = useState('');
  const [pending, setPending] = useState<{ action: 'client-issue'; name: string; providers: string[] } | { action: 'client-revoke'; id: string; name: string } | null>(null);
  const [issued, setIssued] = useState<{ token: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  async function run(action: object) {
    if (busy) return;
    setBusy(true); setError(''); setMessage(''); setIssued(null);
    try {
      const result = await requestJson<{ token?: string; url?: string }>('/llms/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(action) });
      setPending(null); setToken('');
      if (result.token && result.url) setIssued({ token: result.token, url: result.url });
      await reload(); setMessage('Node settings updated.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update node settings.'); }
    finally { setBusy(false); setToken(''); }
  }
  return <details><summary>MauzCode nodes and sharing ({nodes.length})</summary>
    <div aria-busy={busy}>
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      <ul className="llm-rows">{nodes.map(node => <li key={node.name}><strong>{node.name}</strong> · {node.enabled ? 'Enabled' : 'Disabled'} · {node.modelCount} models
        <Button disabled={busy} onClick={() => { setName(node.name); setUrl(node.url); setToken(''); }}>Edit {node.name}</Button>
        <Button disabled={busy} onClick={() => void run({ action: 'node-refresh', name: node.name })}>Refresh {node.name}</Button>
      </li>)}</ul>
      <form onSubmit={e => { e.preventDefault(); void run({ action: 'node-save', name, url, token }); }}><fieldset disabled={busy}><legend>Add or update a node</legend>
        <label className="settings-field"><span>Name</span><input required pattern="[a-zA-Z][a-zA-Z0-9_.-]{0,31}" value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="settings-field"><span>Node URL (ending in /node/v1)</span><input required type="url" value={url} onChange={e => setUrl(e.target.value)} /></label>
        <label className="settings-field"><span>Token (blank keeps the stored token)</span><input type="password" autoComplete="new-password" value={token} onChange={e => setToken(e.target.value)} /></label>
        <Button type="submit">Save node</Button>
      </fieldset></form>
      <h4>Shared with</h4>
      <ul className="llm-rows">{clients.map(client => <li key={client.id}><strong>{client.name}</strong> · {client.providers.join(', ') || 'All shareable providers'} · {client.requests} requests
        <Button disabled={busy} onClick={() => { setIssued(null); setPending({ action: 'client-revoke', id: client.id, name: client.name }); }}>Revoke {client.name}</Button>
      </li>)}</ul>
      {!clients.length && <p className="settings-footnote">No active client tokens.</p>}
      <form onSubmit={e => { e.preventDefault(); setIssued(null); setPending({ action: 'client-issue', name: clientName, providers: providers.split(',').map(p => p.trim()).filter(Boolean) }); }}><fieldset disabled={busy}><legend>Issue a client token</legend>
        <label className="settings-field"><span>Client name</span><input required maxLength={64} value={clientName} onChange={e => setClientName(e.target.value)} /></label>
        <label className="settings-field"><span>Providers (comma-separated; blank shares all eligible providers)</span><input value={providers} onChange={e => setProviders(e.target.value)} /></label>
        <Button type="submit">Review token</Button>
      </fieldset></form>
      {pending && <section aria-label="Confirm sharing change"><p>{pending.action === 'client-issue' ? `Issue a token for ${pending.name}? Grants access to ${pending.providers.join(', ') || 'all shareable providers'}.` : `Revoke ${pending.name}? This client will no longer be able to relay through this MauzCode.`}</p>
        <Button disabled={busy} onClick={() => void run({ ...pending, confirmed: true })}>Confirm {pending.action === 'client-issue' ? 'issue token' : 'revoke'}</Button>
        <Button disabled={busy} onClick={() => setPending(null)}>Cancel</Button>
      </section>}
      {issued && <section aria-label="New client token"><p>Copy now. This token will not be shown again.</p><label className="settings-field"><span>URL</span><input readOnly value={issued.url} /></label><label className="settings-field"><span>Token</span><input readOnly type="password" value={issued.token} onFocus={e => e.target.select()} /></label><Button onClick={() => setIssued(null)}>Dismiss token</Button></section>}
    </div>
  </details>;
}
