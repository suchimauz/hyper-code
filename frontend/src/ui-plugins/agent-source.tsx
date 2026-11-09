import { useEffect, useState } from 'react';
import { Panel, requestJson, type UiExtension } from '@hyper/ui';
type Source = { agentId: string; index: number; role: string; content: string };
/** Read-only provenance view; message text is never interpreted as HTML. */
export function AgentSource() {
  const query = new URLSearchParams(window.location.search);
  const id = query.get('sourceAgent') ?? '';
  const index = query.get('sourceIndex') ?? '';
  const [data, setData] = useState<Source | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !/^\d+$/.test(index)) { setError('Invalid source message'); return; }
    void requestJson<Source>(`/agent/${encodeURIComponent(id)}/message/${index}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(setData).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [id, index]);
  return <Panel title="Source message"><a href={`/?agent=${encodeURIComponent(id)}`}>Open source chat</a>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading source…</p> : <><h2>Message {data.index} · {data.role}</h2><pre tabIndex={0} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{data.content}</pre></>}
  </Panel>;
}
export const agentSourceExtension: UiExtension = { id: 'agent-source', apiVersion: 1, pages: [{ id: 'overview', title: 'Source message', component: AgentSource }] };
