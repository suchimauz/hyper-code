import { useEffect, useState } from 'react';
import { Button, Panel, requestJson, type UiExtension } from '@hyper/ui';

type Instance = { id: string; name: string; url: string | null; ownerEmail: string | null; users: number | null; agents: number | null; running: number | null; version: string | null; lastSeenAt: number | null };
type Overview = { connected: boolean; issuer?: string | null; instances: Instance[] };

/** Read-only directory: no deployment or configuration operations are exposed. */
function InstancesOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void requestJson<Overview>('/controlPlane/overview', { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setData(value);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load instances');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  return <Panel title="Hyper instances">
    <p>Instances registered in the control plane{data?.issuer ? ` ${data.issuer}` : ''}.</p>
    <Button disabled={loading} onClick={() => setRefresh(value => value + 1)}>{loading ? 'Loading…' : 'Refresh'}</Button>
    {error && <p role="alert">{error}</p>}
    <div aria-live="polite" aria-busy={loading}>
      {data && !data.connected && <p>This Hyper is not connected to a Hyper Control Plane. Ask the instance owner to configure its connection.</p>}
      {data?.connected && data.instances.length === 0 && <p>No instances visible. The control plane may be unreachable or no instances are registered.</p>}
      {data && data.instances.length > 0 && <div style={{ overflowX: 'auto' }}><table>
        <caption>Registered Hyper instances</caption>
        <thead><tr><th scope="col">Hyper</th><th scope="col">Owner</th><th scope="col">Size</th><th scope="col">Version</th><th scope="col">Last seen</th></tr></thead>
        <tbody>{data.instances.map(item => <tr key={item.id}>
          <th scope="row">{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a> : item.name}<div>{item.url}</div></th>
          <td>{item.ownerEmail ?? '—'}</td>
          <td>{item.users ?? '—'} people · {item.agents ?? '—'} agents{item.running != null ? ` · ${item.running} running` : ''}</td>
          <td>{item.version ?? '—'}</td>
          <td>{item.lastSeenAt == null ? 'Never' : <><span>{Date.now() - item.lastSeenAt < 15 * 60_000 ? 'Recent heartbeat' : 'Stale heartbeat'}</span><br /><time dateTime={new Date(item.lastSeenAt).toISOString()}>{new Date(item.lastSeenAt).toLocaleString()}</time></>}</td>
        </tr>)}</tbody>
      </table></div>}
    </div>
  </Panel>;
}

export const instancesExtension: UiExtension = {
  id: 'instances', apiVersion: 1,
  pages: [{ id: 'overview', title: 'Hyper instances', component: InstancesOverview }],
  navigation: [{ page: 'overview', title: 'Hyper instances' }],
};
