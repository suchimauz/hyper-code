import { useCallback, useEffect, useState } from 'react';
import { requestJson } from '../../lib/hyper';
import { Button } from '../ui/Button';

type State = {
  models: string[]; disabledModels: string[]; instances: string[];
  plans: Record<string, string>; tier: 'standard' | 'priority'; csrfToken: string;
  nodes: { name: string; enabled: boolean; modelCount: number; catalogAt: number | null; usageAt: number | null }[];
};
const providers = { 'zai-coding': 'Z.ai', 'minimax-coding': 'MiniMax', opencode: 'OpenCode' };

/** Native controls for non-account LLM settings; all writes use the owner/CSRF JSON boundary. */
export function LlmPolicySettings() {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    const next = await requestJson<State>('/llms/settings', { signal });
    setData(next);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load model settings.'); });
    return () => controller.abort();
  }, [load]);
  async function save(action: object) {
    if (!data || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await requestJson('/llms/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken }, body: JSON.stringify(action) });
      await load(); setMessage('Settings saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save settings.'); }
    finally { setBusy(false); }
  }
  return <section className="llm-group" aria-label="Model and routing settings" aria-busy={busy}>
    <header className="llm-group-head"><h3>Model and routing settings</h3><Button disabled={busy} onClick={() => { setError(''); void load().catch(e => setError(String(e))); }}>Refresh</Button></header>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!data ? <p className="settings-footnote">Loading model settings…</p> : <>
      <fieldset disabled={busy}>
        <legend>Coding-plan traffic</legend>
        <p className="settings-footnote">Choose Local or a trusted SSH instance. This does not start login or change credentials.</p>
        {Object.entries(providers).map(([provider, label]) => <label key={provider} className="settings-field">
          <span>{label} instance</span>
          <select value={data.plans[provider] || ''} onChange={e => void save({ action: 'instance', provider, instance: e.target.value })}>
            <option value="">Local</option>
            {data.plans[provider] && !data.instances.includes(data.plans[provider]!) && <option value={data.plans[provider]} disabled>{data.plans[provider]} (unavailable)</option>}
            {data.instances.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </label>)}
        <label className="settings-field"><span>MiniMax admission tier</span><select value={data.tier} onChange={e => void save({ action: 'tier', tier: e.target.value })}><option value="standard">Standard</option><option value="priority">Priority</option></select></label>
        <p className="settings-footnote">Standard queues normally; priority is admitted first. Output budgets are selected by the provider.</p>
      </fieldset>
      <details>
        <summary>Model availability ({data.models.length})</summary>
        <p className="settings-footnote">Disable an exact route for inference without changing existing chat model selections.</p>
        <label className="settings-field"><span>Filter model routes</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <ul className="llm-rows">{data.models.filter(m => m.toLowerCase().includes(query.toLowerCase())).map(model => <li key={model}>
          <label><input type="checkbox" disabled={busy} checked={!data.disabledModels.includes(model)} onChange={e => void save({ action: 'model', model, disabled: !e.target.checked })} /> <span style={{ overflowWrap: 'anywhere' }}>{model}</span></label>
        </li>)}</ul>
        {!data.models.length && <p className="settings-footnote">No models available.</p>}
      </details>
      <details><summary>Hyper nodes ({data.nodes.length})</summary>
        <p className="settings-footnote">Cached node catalogue status. Credentials are never displayed here.</p>
        <ul className="llm-rows">{data.nodes.map(node => <li key={node.name}><strong>{node.name}</strong> · {node.enabled ? 'Enabled' : 'Disabled'} · {node.modelCount} models{node.catalogAt && <> · Catalogue {new Date(node.catalogAt).toLocaleString()}</>}</li>)}</ul>
        {!data.nodes.length && <p className="settings-footnote">No nodes configured.</p>}
      </details>
    </>}
  </section>;
}
