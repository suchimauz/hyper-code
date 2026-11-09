import { useEffect, useState, type ReactNode } from 'react';
import { Button, Panel, TextField, requestJson, type UiExtension } from '@hyper/ui';

function useRead<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    void requestJson<T>(path, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => controller.abort();
  }, [path, revision]);
  return { data, error, reload: () => setRevision(v => v + 1) };
}
function State({ error, loading, children }: { error: string; loading: boolean; children: ReactNode }) {
  return error ? <p role="alert">{error}</p> : loading ? <p role="status">Loading…</p> : <>{children}</>;
}
function External({ url, children }: { url: string; children: ReactNode }) {
  let safe = false;
  try { safe = ['https:', 'http:'].includes(new URL(url).protocol); } catch { /* Non-URLs render as plain text. */ }
  return safe ? <a href={url} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
}
const query = () => new URLSearchParams(window.location.search);
type Story = { id: number; title: string; url: string | null; rank?: number; points: number; comments: number; author: string };
function HackerNews() {
  const [feed, setFeed] = useState(() => query().get('feed') ?? 'front');
  const { data, error, reload } = useRead<{ feeds: { key: string; label: string; stories: number }[]; stories: Story[] }>(`/hackernews?feed=${encodeURIComponent(feed)}`);
  return <Panel title="Hacker News"><p>Local story mirror. Reading does not sync or import.</p>
    <Button onClick={reload}>Refresh</Button>
    <State error={error} loading={!data}>{data && <>
      <label>Feed <select value={feed} onChange={e => setFeed(e.target.value)}>{data.feeds.map(f => <option key={f.key} value={f.key}>{f.label} ({f.stories})</option>)}</select></label>
      {!data.stories.length && <p>No mirrored stories in this feed.</p>}
      <ol>{data.stories.map(s => <li key={s.id}><article><h3><External url={s.url ?? `https://news.ycombinator.com/item?id=${s.id}`}>{s.title}</External></h3><p>{s.points ?? 0} points · <External url={`https://news.ycombinator.com/item?id=${s.id}`}>{s.comments ?? 0} comments</External> · {s.author}</p></article></li>)}</ol>
    </>}</State></Panel>;
}
type Publication = { key: string; name: string; host: string; posts: number; cursor?: { lastPublishedAt?: string } };
type Post = { id: number; title: string; url: string; published_at: string; audience: string; body_length: number };
function Substack() {
  const [key, setKey] = useState(() => query().get('key') ?? '');
  const { data, error, reload } = useRead<{ publications?: Publication[]; publication?: Publication; posts?: Post[] }>(key ? `/substack/${encodeURIComponent(key)}` : '/substack');
  return <Panel title={data?.publication?.name ?? 'Substack'}><p>Local publication mirror. Original articles open in a new tab.</p>
    {key && <Button onClick={() => setKey('')}>All publications</Button>} <Button onClick={reload}>Refresh</Button>
    <State error={error} loading={!data}>{data && <>
      {data.publications && <><ul>{data.publications.map(p => <li key={p.key}><Button onClick={() => setKey(p.key)}>{p.name}</Button><p>{p.host} · {p.posts} posts · {p.cursor?.lastPublishedAt ?? 'Never synced'}</p></li>)}</ul>{!data.publications.length && <p>No mirrored publications.</p>}</>}
      {data.posts && <><ul>{data.posts.map(p => <li key={p.id}><h3><External url={p.url}>{p.title}</External></h3><p>{p.published_at} · {p.audience} · {p.body_length ?? 0} characters</p></li>)}</ul>{!data.posts.length && <p>No mirrored posts.</p>}</>}
    </>}</State></Panel>;
}
type Mail = { id: string; direction: 'in' | 'out'; subject: string | null; text: string; from: string; to: string[]; verified: boolean; reason: string | null; senderPrincipal: string | null; agentId: string | null; thread: string | null; hop: number; receivedAt: number };
type MailData = { messages?: Mail[]; message?: Mail; thread?: Mail[]; status?: { inbox: string | null; registered: boolean; running: boolean; error: string | null; received: number; sent: number; quarantined: number } };
function Inbox() {
  const [view, setView] = useState(() => query().get('mailView') ?? 'in');
  const [search, setSearch] = useState(() => query().get('q') ?? '');
  const [selected, setSelected] = useState(() => ({ id: query().get('id') ?? '', direction: query().get('direction') ?? 'in' }));
  const { data, error, reload } = useRead<MailData>(selected.id ? `/inbox/${encodeURIComponent(selected.id)}?direction=${encodeURIComponent(selected.direction)}` : `/inbox?view=${encodeURIComponent(view)}`);
  const messages = data?.messages?.filter(m => [m.from, ...m.to, m.subject ?? '', m.text].join(' ').toLowerCase().includes(search.toLowerCase()));
  const m = data?.message;
  return <Panel title="Inbox"><p>Stored mail. Reading does not send messages or mark them read.</p>
    {selected.id && <Button onClick={() => setSelected({ id: '', direction: 'in' })}>Back to mail</Button>} <Button onClick={reload}>Refresh</Button>
    {!selected.id && <><label>Mailbox <select value={view} onChange={e => setView(e.target.value)}><option value="in">Received</option><option value="out">Sent</option><option value="quarantine">Quarantine</option></select></label><TextField label="Search mail" value={search} onChange={e => setSearch(e.target.value)} /></>}
    <State error={error} loading={!data}>
      {data?.status && <p>{data.status.inbox} · {data.status.registered ? 'Registered' : 'Not registered'} · Sync {data.status.running ? 'on' : 'off'} · {data.status.received} received / {data.status.sent} sent / {data.status.quarantined} quarantined {data.status.error && <span role="status">{data.status.error}</span>}</p>}
      {messages && <><ul>{messages.map(mail => <li key={`${mail.id}/${mail.direction}`}><Button onClick={() => setSelected({ id: mail.id, direction: mail.direction })}>{mail.subject || mail.text.split('\n')[0].slice(0, 120) || '(no text)'}</Button><p>{mail.verified ? 'Verified sender' : 'Unverified sender'} · {mail.direction === 'out' ? `To ${mail.to.join(', ')}` : `From ${mail.from}`} · {new Date(mail.receivedAt).toLocaleString()}</p><p>{mail.text.slice(0, 180)}</p>{mail.reason && <p>{mail.reason}</p>}</li>)}</ul>{!messages.length && <p>No matching mail.</p>}</>}
      {m && <section aria-label="Message thread"><h2>{m.subject || 'Message'}</h2><p>{m.verified ? 'Verified sender' : 'Unverified sender'} · Hop {m.hop}</p><dl><dt>From</dt><dd>{m.from}</dd><dt>To</dt><dd>{m.to.join(', ')}</dd><dt>Sender identity</dt><dd>{m.senderPrincipal ?? 'Unknown'}</dd><dt>Thread</dt><dd>{m.thread ?? m.id}</dd>{m.agentId && <><dt>Agent</dt><dd>{m.agentId}</dd></>}{m.reason && <><dt>Quarantine reason</dt><dd>{m.reason}</dd></>}</dl>{[m, ...(data?.thread ?? []).filter(item => item.id !== m.id || item.direction !== m.direction)].sort((a, b) => a.receivedAt - b.receivedAt).map(item => <article key={`${item.id}/${item.direction}`}><h3>{item.from} → {item.to.join(', ')}</h3><p>{new Date(item.receivedAt).toLocaleString()} · {item.verified ? 'Verified' : 'Unverified'}</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit' }}>{item.text}</pre></article>)}</section>}
    </State></Panel>;
}
export const readersExtension: UiExtension = {
  id: 'readers', apiVersion: 1,
  pages: [{ id: 'hackernews', title: 'Hacker News', component: HackerNews }, { id: 'substack', title: 'Substack', component: Substack }, { id: 'inbox', title: 'Inbox', component: Inbox }],
  navigation: [{ page: 'hackernews', title: 'Hacker News' }, { page: 'substack', title: 'Substack' }, { page: 'inbox', title: 'Inbox' }],
};
