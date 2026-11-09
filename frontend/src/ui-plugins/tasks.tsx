import { useEffect, useRef, useState } from 'react';
import { ApiError, Button, Dialog, Panel, Stack, TextField, requestJson, type ExtensionViewProps, type UiExtension } from '@hyper/ui';

type Task = { id: string; description: string; status: 'todo' | 'running' | 'done'; agentId: string | null; workspaceMode: 'default' | 'isolated'; workspaceDir: string | null; createdAt: number; updatedAt: number };
const labels = { todo: 'Open', running: 'In progress', done: 'Closed' };
const taskUrl = (id?: string) => '/?view=extension:tasks/overview' + (id ? '&task=' + encodeURIComponent(id) : '');
function message(error: unknown) {
  if (error instanceof ApiError && error.status === 401) return 'Sign in to view tasks, then reload this page.';
  if (error instanceof ApiError && error.status === 403) return 'Access denied or request token expired. Tasks require owner access; refresh before retrying.';
  return error instanceof Error ? error.message : 'Tasks are unavailable.';
}

/** Native owner-only task workspace. Reads never start agents or change task status. */
export function TasksPage({ context }: ExtensionViewProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<string | null>(() => new URL(location.href).searchParams.get('task'));
  const [detail, setDetail] = useState<Task | null>(null);
  const [closed, setClosed] = useState(() => new URL(location.href).searchParams.get('taskView') === 'closed');
  const [query, setQuery] = useState(() => new URL(location.href).searchParams.get('q') || '');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [description, setDescription] = useState('');
  const [workspaceMode, setWorkspaceMode] = useState<'default' | 'isolated'>('default');
  useEffect(() => {
    const onPop = () => setSelected(new URL(location.href).searchParams.get('task'));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setToken(''); setDetail(null);
    const load = async () => {
      try {
        if (selected) {
          const data = await requestJson<{ task: Task; csrfToken: string }>('/tasks/' + encodeURIComponent(selected), { signal: controller.signal });
          if (!controller.signal.aborted) { setDetail(data.task); setToken(data.csrfToken); }
        } else {
          const data = await requestJson<{ tasks: Task[]; csrfToken: string }>('/tasks', { signal: controller.signal });
          if (!controller.signal.aborted) { setTasks(data.tasks); setToken(data.csrfToken); }
        }
      } catch (cause) { if (!controller.signal.aborted) setError(message(cause)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [selected, revision]);
  const navigate = (id: string | null) => { history.pushState(null, '', taskUrl(id ?? undefined)); setSelected(id); setNotice(''); };
  const mutate = async (path: string, body: object, success: string, create = false) => {
    if (busyRef.current || context.readOnly || !token) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const data = await requestJson<{ task: Task }>(path, { method: 'POST', body, csrfToken: token });
      if (create) { setCreating(false); setDescription(''); navigate(data.task.id); }
      else setDetail(data.task);
      setNotice(success);
    } catch (cause) { setError(message(cause)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const disabled = context.readOnly || busy || loading || !token;
  const matching = tasks.filter(task => task.description.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const visible = matching.filter(task => (task.status === 'done') === closed);
  return <Stack gap={4} style={{ padding: 'var(--space-4)', maxWidth: 1000, margin: '0 auto' }} aria-busy={loading || busy}>
    <Panel title="Tasks" actions={<Stack direction="horizontal" wrap><Button disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh</Button><Button disabled={disabled} onClick={() => setCreating(true)}>New task</Button></Stack>}>
      <p>One focused agent chat for every task. Completion is always marked explicitly.</p>
      {context.readOnly && <p>Read-only view. Task actions are unavailable.</p>}
      {loading && <p role="status">Loading tasks…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </Panel>
    {selected ? <>
      <Button disabled={busy} onClick={() => navigate(null)}>Back to tasks</Button>
      {!loading && detail && <>
        <Panel title={detail.description.split(/\r?\n/).find(line => line.trim()) || 'Task'}>
          <p>{labels[detail.status]} · #{detail.id.slice(0, 8)}</p>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{detail.description}</p>
          <p>Created {new Date(Number(detail.createdAt)).toLocaleString()} · Updated {new Date(Number(detail.updatedAt)).toLocaleString()}</p>
        </Panel>
        <Panel title="Agent and workspace">
          <p>{detail.workspaceMode === 'isolated' ? 'Isolated workspace' : 'Shared workspace'}</p>
          <p style={{ overflowWrap: 'anywhere' }}><code>{detail.workspaceDir || (detail.workspaceMode === 'isolated' ? `~/.hyper/tasks/${detail.id}` : '~/.hyper/tasks')}</code></p>
          {detail.agentId ? <a href={'/agent/' + encodeURIComponent(detail.agentId)}>Open attached chat {detail.agentId}</a> : <><p>The directory is created when the agent starts.</p><Button disabled={disabled} onClick={() => void mutate(`/tasks/${encodeURIComponent(detail.id)}/start`, {}, 'Agent started. Open the attached chat to review progress.')}>Start agent</Button></>}
        </Panel>
        <Panel title="Status"><Stack direction="horizontal" wrap>{(['todo', 'running', 'done'] as const).map(status => <Button key={status} aria-pressed={detail.status === status} disabled={disabled || detail.status === status} onClick={() => void mutate(`/tasks/${encodeURIComponent(detail.id)}/status`, { status }, 'Status updated.')}>{labels[status]}</Button>)}</Stack></Panel>
      </>}
    </> : <Panel title="Your tasks">
      <Stack gap={3}>
        <TextField label="Search tasks" type="search" value={query} onChange={event => setQuery(event.target.value)} />
        <Stack direction="horizontal"><Button aria-pressed={!closed} onClick={() => setClosed(false)}>Open ({matching.filter(task => task.status !== 'done').length})</Button><Button aria-pressed={closed} onClick={() => setClosed(true)}>Closed ({matching.filter(task => task.status === 'done').length})</Button></Stack>
        {!loading && !error && !visible.length && <p>{query ? 'No matching tasks.' : closed ? 'No closed tasks.' : 'No open tasks. Create a task to start an agent.'}</p>}
        {!loading && !error && visible.map(task => <Panel key={task.id} title={task.description.split(/\r?\n/).find(line => line.trim()) || 'Task'} actions={<Button onClick={() => navigate(task.id)}>View task</Button>}>
          <p style={{ overflowWrap: 'anywhere' }}>{task.description.split(/\r?\n/).slice(1).join(' ').slice(0, 180)}</p>
          <p>{labels[task.status]} · {task.workspaceMode === 'isolated' ? 'Isolated' : 'Shared'} · Updated {new Date(Number(task.updatedAt)).toLocaleString()}</p>
          {task.agentId && <a href={'/agent/' + encodeURIComponent(task.agentId)}>Open attached chat</a>}
        </Panel>)}
      </Stack>
    </Panel>}
    <Dialog open={creating} onOpenChange={open => { if (!busy) setCreating(open); }} title="Create a new task" description="Describe the work. Creating a task does not start its agent.">
      <form onSubmit={event => { event.preventDefault(); if (description.trim()) void mutate('/tasks', { description: description.trim(), workspaceMode }, 'Task created.', true); }}>
        <Stack>
          <label className="hyper-sdk-field">Description<textarea className="hyper-sdk-input" rows={7} required value={description} disabled={busy} onChange={event => setDescription(event.target.value)} /></label>
          <label className="hyper-sdk-field">Workspace<select className="hyper-sdk-input" value={workspaceMode} disabled={busy} onChange={event => setWorkspaceMode(event.target.value === 'isolated' ? 'isolated' : 'default')}><option value="default">Shared · ~/.hyper/tasks</option><option value="isolated">Isolated · one directory per task</option></select></label>
          {error && <p role="alert">{error}</p>}
          <Button type="submit" disabled={disabled || !description.trim()}>{busy ? 'Creating…' : 'Create task'}</Button>
        </Stack>
      </form>
    </Dialog>
  </Stack>;
}

export const tasksExtension: UiExtension = {
  id: 'tasks', apiVersion: 1,
  pages: [{ id: 'overview', title: 'Tasks', component: TasksPage }],
  navigation: [{ page: 'overview', title: 'Tasks' }],
};
