import { useEffect, useState } from 'react';
import { Button, Panel, TextField, requestJson, type ExtensionViewProps, type UiExtension } from '@hyper/ui';

type Row = Record<string, any>;
type Data = { csrfToken?: string; stats?: Row; types?: Row[]; hits?: Row[]; rows?: Row[]; entity?: Row; history?: Row[]; hasMore?: boolean; tracking?: { enabled: boolean; preview?: Row } };
const link = (id = '') => { const [type, ...slug] = id.split('/'); const q = new URLSearchParams({ view: 'extension:knowledge/overview' }); if (type) q.set('type', type); if (slug.length) q.set('slug', slug.join('/')); return `/?${q}`; };
const text = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '—';
function Source({ url }: { url?: string }) {
  if (!url) return null;
  const legacy = /^hyper:\/\/agent\/([^/]+)\/message\/(\d+)$/.exec(url);
  const href = legacy ? `/agent/${encodeURIComponent(legacy[1])}/message/${legacy[2]}` : url;
  return /^https?:\/\//i.test(href) || /^\/agent\/[^/?#]+\/message\/\d+$/.test(href) ? <a href={href}>{href}</a> : <span>{url}</span>;
}
function Value({ value }: { value: unknown }) { return typeof value === 'string' && /^[A-Za-z][\w-]*\/[\w.@-]+$/.test(value) ? <a href={link(value)}>{value}</a> : <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text(value)}</pre>; }
function Overview({ context }: ExtensionViewProps) {
  const params = new URLSearchParams(window.location.search), type = params.get('type') ?? '', slug = params.get('slug') ?? '';
  const [query, setQuery] = useState(params.get('q') ?? ''), [search, setSearch] = useState(query);
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    const q = new URLSearchParams({ format: 'json' });
    let path = '/knowledge';
    if (search) { q.set('q', search); if (type) q.set('type', type); }
    else if (type) path += `/${encodeURIComponent(type)}${slug ? `/${encodeURIComponent(slug)}` : ''}`;
    if (context.agentId) q.set('agent', context.agentId);
    void requestJson<Data>(`${path}?${q}`, { signal: controller.signal }).then(setData).catch(cause => { if (cause?.name !== 'AbortError') setError(String(cause)); });
    return () => controller.abort();
  }, [type, slug, search, context.agentId, revision]);
  const toggle = async () => {
    if (!context.agentId || context.readOnly || busy) return;
    setBusy(true); setError('');
    try { const body = { enabled: !data?.tracking?.enabled }; await requestJson(`/knowledge/agent/${encodeURIComponent(context.agentId)}/tracking`, { method: 'POST', body, csrfToken: data?.csrfToken }); setRevision(v => v + 1); }
    catch (cause) { setError(String(cause)); } finally { setBusy(false); }
  };
  const entity = data?.entity;
  return <div className="hyper-extension-page"><Panel title="Knowledge">
    <nav aria-label="Knowledge"><a href={link()}>All types</a>{type && <> / <a href={link(type)}>{type}</a></>}{slug && <> / {slug}</>}</nav>
    <form onSubmit={event => { event.preventDefault(); setSearch(query); }}><TextField label="Search entities" value={query} onChange={event => setQuery(event.target.value)} /><Button type="submit">Search</Button></form>
    <Button onClick={() => setRevision(v => v + 1)}>Refresh</Button>
    {error && <p role="alert">{error}</p>}{!data && !error && <p role="status">Loading Knowledge…</p>}
    {data?.stats && <p>{data.stats.entities} entities · {data.stats.relations} relations</p>}
    {data?.tracking && <section aria-label="Entity tracking"><Button disabled={context.readOnly || busy} onClick={toggle}>Track entities: {data.tracking.enabled ? 'On' : 'Off'}</Button><p>Tracking records entities and sourced facts from successful turns in this chat.</p><p>{data.tracking.preview?.status} {data.tracking.preview?.error}</p>{data.tracking.preview?.lastTurn && <details><summary>Last successful turn counters</summary><Value value={data.tracking.preview.lastTurn} /><p>Counts cover the last successful batch, not all observations below.</p></details>}<ul>{(data.tracking.preview?.mentions ?? []).map((mention: Row, i: number) => <li key={i}>{mention.entityId ? <a href={link(mention.entityId)}>{mention.name ?? mention.entityId}</a> : mention.name} {mention.status}<p>{mention.evidence}</p>{mention.candidates?.map((candidate: Row) => <a key={candidate.id} href={link(candidate.id)}>{candidate.title ?? candidate.id} </a>)}{context.agentId && Number.isSafeInteger(mention.sourceMessageIdx) && mention.sourceMessageIdx >= 0 && <Source url={`/agent/${encodeURIComponent(context.agentId)}/message/${mention.sourceMessageIdx}`} />}</li>)}</ul></section>}
    <ul>{data?.types?.map(row => <li key={row.type}><a href={link(row.type)}>{row.type}</a> ({row.count})</li>)}</ul>
    {(data?.hits || data?.rows) && <ul>{(data.hits ?? data.rows ?? []).map(row => <li key={row.id}><a href={link(row.id)}>{row.title ?? row.data?.title ?? row.id}</a><p>{row.summary ?? row.snippet}</p></li>)}{!(data.hits ?? data.rows)?.length && <li>No matching entities.</li>}</ul>}
    {entity && <><h2>{entity.data?.title ?? entity.id}</h2><dl>{Object.entries(entity.data ?? {}).map(([key, value]) => <div key={key}><dt>{key}</dt><dd><Value value={value} /></dd></div>)}</dl>
      <h3>Relations</h3><ul>{entity.relations?.outgoing?.map((row: Row, i: number) => <li key={`o${i}`}>{row.predicate} → <a href={link(row.object)}>{row.object}</a></li>)}{entity.relations?.incoming?.map((row: Row, i: number) => <li key={`i${i}`}><a href={link(row.subject)}>{row.subject}</a> → {row.predicate}</li>)}</ul>
      <h3>Evidence and source messages</h3>{entity.provenance?.map((row: Row, i: number) => <details key={i}><summary>{row.attribute} · {row.status} · {row.source}</summary><Value value={row.value} /><p>{row.evidence}</p><p>Confidence: {row.confidence ?? '—'} · {row.observed_at}</p><Source url={row.url} /></details>)}
      <h3>History</h3><p>Canonical changes recorded since the journal was enabled.</p>{data?.history?.map((row: Row) => <details key={row.id}><summary>{row.attribute} · {row.operation} · {row.changed_at}</summary><p>Before</p><Value value={row.before_value} /><p>After</p><Value value={row.after_value} /><p>{row.evidence}</p>{row.source_agent_id && Number.isSafeInteger(row.source_message_idx) && row.source_message_idx >= 0 && <Source url={`/agent/${encodeURIComponent(row.source_agent_id)}/message/${row.source_message_idx}`} />}</details>)}
    </>}{data?.hasMore && <p>Showing the latest {entity ? 30 : 500} records; additional records are not shown.</p>}
  </Panel></div>;
}
export const knowledgeExtension: UiExtension = { id: 'knowledge', apiVersion: 1, pages: [{ id: 'overview', title: 'Knowledge', component: Overview }], navigation: [{ page: 'overview', title: 'Knowledge' }] };
