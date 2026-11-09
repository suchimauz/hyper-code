import { useCallback, useEffect, useId, useState } from 'react';
import { ChevronRight, Clock, Play, Plus, Search, Trash2, X } from 'lucide-react';
import { addCronTask, cronSchedule, filterCronTasks, validInterval, getCronRuns, getCronTasks, relativeTime, runCronAction, type CronAction, type CronFilter, type CronRun, type CronTask } from '../../lib/cronTasks';
import './automation-tasks.css';

const FILTERS: { id: CronFilter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'enabled', label: 'Enabled' }, { id: 'inactive', label: 'Inactive' }];
const stamp = (at: number | null) => at == null ? '—' : new Date(at).toLocaleString('ru', { dateStyle: 'medium', timeStyle: 'medium' });
const duration = (run: CronRun) => run.startedAt == null || run.finishedAt == null ? null : `${((run.finishedAt - run.startedAt) / 1000).toFixed(1)}s`;
/** Short results stay on one line; only long JSON is expanded for reading. */
const pretty = (text: string | null) => { if (text == null || text.length <= 160) return text; try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } };

/** Expanded detail of one task: definition and the latest runs, loaded on open and with each refresh. */
function TaskDetails({ task, revision }: { task: CronTask; revision: number }) {
  const [runs, setRuns] = useState<CronRun[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    getCronRuns(task.name, controller.signal).then(next => { setRuns(next); setError(''); }, err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err)); });
    return () => controller.abort();
  }, [task.name, revision]);
  const args = JSON.stringify(task.args ?? {}, null, 2);
  return <div className="automation-details">
    <dl className="automation-facts">
      <dt>Name</dt><dd>{task.name}</dd>
      <dt>Function</dt><dd><code>{task.fn}</code></dd>
      <dt>Schedule</dt><dd>{cronSchedule(task)}</dd>
      <dt>Status</dt><dd>{task.enabled ? 'Enabled' : 'Disabled'} · {task.state}</dd>
      <dt>Next run</dt><dd>{task.enabled ? stamp(task.nextRunAt) : '—'}</dd>
      <dt>Source</dt><dd>{task.source}{task.sourceFile && <> · <code>{task.sourceFile}</code></>}</dd>
    </dl>
    <div className="automation-block-label">Arguments</div>
    <pre className="automation-code">{args}</pre>
    {task.lastError && <><div className="automation-block-label">Last error</div><pre className="automation-code is-error">{task.lastError}</pre></>}
    <div className="automation-block-label">Recent runs</div>
    {error ? <div className="automation-row-error" role="alert">{error}</div>
      : runs == null ? <div className="automation-muted" role="status">Загружаем…</div>
      : !runs.length ? <div className="automation-muted">Ещё не запускалась.</div>
      : <ul className="automation-runs">{runs.map(run => <li key={run.id}>
          <div className="automation-run-head"><span className={`automation-dot is-${run.status === 'running' ? 'running' : run.status === 'error' ? 'error' : 'on'}`} aria-hidden="true" /><span>{run.status}</span><span className="automation-muted">{stamp(run.startedAt)}</span>{duration(run) && <span className="automation-muted">{duration(run)}</span>}</div>
          {(run.error || run.result) && <pre className={`automation-code ${run.error ? 'is-error' : ''}`}>{run.error ?? pretty(run.result)}</pre>}
        </li>)}</ul>}
  </div>;
}

function TaskRow({ task, now, revision, pending, onAct }: { task: CronTask; now: number; revision: number; pending: boolean; onAct: (task: CronTask, action: CronAction) => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <li className={`automation-row ${task.enabled ? '' : 'is-inactive'} ${open ? 'is-open' : ''}`}>
    <div className="automation-row-line">
      <button className="automation-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <ChevronRight size={14} strokeWidth={1.5} className="automation-chevron" aria-hidden="true" />
        <span className={`automation-dot is-${task.state === 'running' ? 'running' : task.lastError ? 'error' : task.enabled ? 'on' : 'off'}`} aria-hidden="true" />
        <span className="automation-main">
          <span className="automation-name" title={task.name}>{task.name}</span>
          <span className="automation-meta"><code>{task.fn}</code><span>{cronSchedule(task)}</span>{task.enabled && task.nextRunAt != null && <span title={stamp(task.nextRunAt)}>next {relativeTime(task.nextRunAt, now)}</span>}{task.lastFinishedAt != null && <span title={stamp(task.lastFinishedAt)}>{task.lastStatus ?? 'ran'} {relativeTime(task.lastFinishedAt, now)}</span>}</span>
          {task.lastError && !open && <span className="automation-row-error" title={task.lastError}>{task.lastError.split('\n')[0]}</span>}
        </span>
      </button>
      <div className="automation-actions">
        <button className="automation-icon" aria-label={`Run ${task.name} now`} title="Run now" disabled={pending || task.state !== 'idle'} onClick={() => onAct(task, 'run')}><Play size={14} strokeWidth={1.5} /></button>
        <button className="automation-icon" aria-label={`Remove ${task.name}`} title={task.source === 'declared' ? 'Disable (declared in file)' : 'Remove'} disabled={pending} onClick={() => onAct(task, 'remove')}><Trash2 size={14} strokeWidth={1.5} /></button>
        <button className="automation-switch" role="switch" aria-checked={task.enabled} aria-label={`${task.enabled ? 'Disable' : 'Enable'} ${task.name}`} disabled={pending} onClick={() => onAct(task, task.enabled ? 'disable' : 'enable')}><span /></button>
      </div>
    </div>
    <div id={id} hidden={!open}>{open && <TaskDetails task={task} revision={revision} />}</div>
  </li>;
}

/** Inline form for an ad-hoc interval task (cron.add). */
function AddTaskForm({ csrf, onDone, onCancel }: { csrf: string; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [fn, setFn] = useState('');
  const [every, setEvery] = useState('5m');
  const [once,setOnce] = useState(false);
  const [args, setArgs] = useState('{}');
  const [now, setNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('Укажите имя задачи');
    if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(fn.trim())) return setError('Функция должна быть вида module.fn');
    if (!validInterval(every)) return setError('Интервал вида 30s, 5m, 1h 30m, 1d');
    let parsed: unknown;
    try { parsed = JSON.parse(args.trim() || '{}'); } catch { return setError('Аргументы — некорректный JSON'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return setError('Аргументы должны быть JSON-объектом');
    setBusy(true); setError('');
    try { await addCronTask({ name: name.trim(), fn: fn.trim(), every: every.trim(), args: parsed as Record<string, unknown>, now, once }, csrf); onDone(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  return <form className="automation-form" aria-label="New cron task" onSubmit={e => void submit(e)}>
    <label><input type="checkbox" checked={once} onChange={e=>setOnce(e.target.checked)} />One-shot task</label>
    <div className="automation-form-grid">
      <label>Name<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="nightly-sync" maxLength={200} /></label>
      <label>Function<input value={fn} onChange={e => setFn(e.target.value)} placeholder="module.fn" spellCheck={false} /></label>
      <label>{once ? 'Run in' : 'Every'}<input value={every} onChange={e => setEvery(e.target.value)} placeholder="5m, 1h 30m, 1d" /></label>
    </div>
    <label className="automation-form-args">Arguments (JSON)<textarea rows={3} value={args} onChange={e => setArgs(e.target.value)} spellCheck={false} /></label>
    <label className="automation-form-check"><input type="checkbox" checked={now} onChange={e => setNow(e.target.checked)} />Run first time immediately</label>
    {error && <div className="automation-error" role="alert">{error}</div>}
    <div className="automation-form-actions">
      <button type="button" className="automation-outline" onClick={onCancel}>Cancel</button>
      <button type="submit" className="automation-new" disabled={busy || !csrf}>{busy ? 'Creating…' : 'Create task'}</button>
    </div>
  </form>;
}

/** Cron Tasks page, as in dsh, over Hyper's real cron tasks. */
export function AutomationTasks() {
  const [adding, setAdding] = useState(false);
  const [tasks, setTasks] = useState<CronTask[] | null>(null);
  const [csrf, setCsrf] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<CronFilter>('all');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => Date.now());
  const [revision, setRevision] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    try { const data = await getCronTasks(signal); setTasks(data.tasks); setCsrf(data.csrfToken); setError(''); setNow(Date.now()); setRevision(r => r + 1); }
    catch (err) { if (!signal?.aborted) setError(err instanceof Error ? err.message : String(err)); }
  }, []);
  useEffect(() => {
    const controller = new AbortController(); void load(controller.signal);
    const timer = setInterval(() => void load(controller.signal), 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [load]);

  const act = async (task: CronTask, action: CronAction) => {
    if (action === 'remove' && !confirm(task.source === 'declared' ? `Отключить задачу «${task.name}»? Она объявлена в файле и будет только выключена.` : `Удалить задачу «${task.name}»?`)) return;
    setPending(p => ({ ...p, [task.name]: true }));
    try { await runCronAction(task.name, action, csrf); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setPending(p => ({ ...p, [task.name]: false })); }
  };

  const visible = tasks ? filterCronTasks(tasks, filter, query) : [];
  return <section className="automation-page" aria-label="Cron Tasks">
    <div className="automation-pane">
      <header className="automation-header">
        <h1>Cron Tasks</h1>
        {!adding && <button className="automation-new" onClick={() => setAdding(true)}><Plus size={13} strokeWidth={1.5} />Add task</button>}
      </header>
      {adding && <AddTaskForm csrf={csrf} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); void load(); }} />}
      <div className="automation-filters" role="group" aria-label="Фильтр задач">
        {FILTERS.map(item => <button key={item.id} className="automation-filter" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
      </div>
      <label className="automation-search"><Search size={14} strokeWidth={1.5} aria-hidden="true" /><input type="search" aria-label="Search tasks" placeholder="Search cron tasks" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={12} /></button>}</label>
      {error && <div className="automation-error" role="alert">{error}</div>}
      {tasks == null ? !error && <div className="automation-empty" role="status">Загружаем задачи…</div>
        : !visible.length ? <div className="automation-empty"><Clock size={24} strokeWidth={1.5} className="automation-empty-glyph" aria-hidden="true" /><h2>{tasks.length ? 'No matching tasks.' : 'No cron tasks yet.'}</h2>{!tasks.length && !adding && <button className="automation-outline" onClick={() => setAdding(true)}>Add cron task</button>}</div>
        : <ul className="automation-list">{visible.map(task => <TaskRow key={task.name} task={task} now={now} revision={revision} pending={!!pending[task.name]} onAct={(t, a) => void act(t, a)} />)}</ul>}
    </div>
  </section>;
}
