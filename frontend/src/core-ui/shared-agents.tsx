import { useEffect, useState } from 'react';
import { Button, Dialog, Panel, TextField, requestJson, type ExtensionViewProps, type UiExtension } from '@mauzcode/ui';

type Card = { agentId: string; name: string; description: string; capabilities: string[] };
type Data = { csrfToken: string; agents: { id: string; title: string }[]; cards: Card[]; tasks: { id: string; title: string; task: string; status: string; summary: string; result: unknown }[] };
type Action = { kind: 'publish' | 'unpublish' | 'delegate'; body: Record<string, unknown>; title: string; details: string };

function Overview({ context }: ExtensionViewProps) {
  const params = new URLSearchParams(window.location.search);
  const [agentId, setAgentId] = useState(params.get('from') ?? context.agentId ?? '');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, refresh] = useState(0);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [capabilities, setCapabilities] = useState('');
  const [tasks, setTasks] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Action | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void requestJson<Data>('/shared-agents', { signal: controller.signal }).then(value => { setData(value); setError(''); }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [revision]);
  const submit = async () => {
    if (!pending || !data || busy || context.readOnly) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await requestJson(`/shared-agents/${pending.kind}`, { method: 'POST', csrfToken: data.csrfToken, body: { ...pending.body, confirmed: true } });
      setPending(null); setNotice('Готово'); refresh(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const disabled = context.readOnly || busy || !data;
  const cards = data?.cards.filter(card => [card.name, card.description, ...card.capabilities].join(' ').toLowerCase().includes(query.toLowerCase())) ?? [];
  return <main className="settings-page" aria-busy={busy}>
    <h1>Shared Agents</h1>
    <p>Находите опубликованный контекст и поручайте ему конкретные задачи. Исходная переписка здесь не отображается.</p>
    <Button onClick={() => refresh(value => value + 1)} disabled={busy}>Обновить</Button>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">Загрузка…</p>}
    {context.readOnly && <p>Режим только для чтения.</p>}
    {data && <>
      <Panel title="Опубликовать сессию">
        <p>Публикация делает контекст сессии доступным для делегирования. Выберите только ту сессию, которой намерены поделиться.</p>
        <form onSubmit={event => { event.preventDefault(); setPending({ kind: 'publish', title: 'Опубликовать сессию?', details: `${name}\n${description}\n${capabilities}\nСессия: ${agentId}`, body: { agentId, name, description, capabilities: capabilities.split(',').map(value => value.trim()).filter(Boolean) } }); }}>
          <label>Сессия <select value={agentId} onChange={event => setAgentId(event.target.value)} disabled={disabled} required><option value="">Выберите сессию</option>{data.agents.map(a => <option key={a.id} value={a.id}>{a.title || a.id} · {a.id}</option>)}</select></label>
          <TextField label="Название" value={name} onChange={event => setName(event.target.value)} required disabled={disabled} />
          <TextField label="Описание" value={description} onChange={event => setDescription(event.target.value)} required disabled={disabled} />
          <TextField label="Возможности через запятую" value={capabilities} onChange={event => setCapabilities(event.target.value)} disabled={disabled} />
          <Button type="submit" disabled={disabled || !agentId}>Проверить публикацию</Button>
        </form>
      </Panel>
      <Panel title="Каталог">
        <TextField label="Поиск по каталогу" value={query} onChange={event => setQuery(event.target.value)} />
        {!cards.length && <p>Нет подходящих опубликованных сессий.</p>}
        {cards.map(card => <section key={card.agentId} aria-label={card.name}>
          <h3>{card.name} <small>{card.agentId}</small></h3><p>{card.description}</p><p>{card.capabilities.join(' · ')}</p>
          <form onSubmit={event => { event.preventDefault(); setPending({ kind: 'delegate', title: `Поручить задачу: ${card.name}?`, details: tasks[card.agentId] ?? '', body: { agentId: card.agentId, task: tasks[card.agentId], requesterId: context.agentId ?? undefined } }); }}>
            <TextField label={`Задача для ${card.name}`} value={tasks[card.agentId] ?? ''} onChange={event => setTasks(value => ({ ...value, [card.agentId]: event.target.value }))} required disabled={disabled} />
            <Button type="submit" disabled={disabled || !tasks[card.agentId]?.trim()}>Проверить поручение</Button>
          </form>
          <Button disabled={disabled} onClick={() => setPending({ kind: 'unpublish', title: 'Снять публикацию?', details: `${card.name} (${card.agentId}). Сессия и выполненные задачи сохранятся.`, body: { agentId: card.agentId } })}>Снять публикацию</Button>
        </section>)}
      </Panel>
      <Panel title="Последние задачи">
        {!data.tasks.length && <p>Задач пока нет.</p>}
        {data.tasks.map(task => <section key={task.id}><h3><a href={`/?agent=${encodeURIComponent(task.id)}`}>{task.title || task.id}</a></h3><p>{task.task}</p><p>{task.status}</p>{task.summary && <p>{task.summary}</p>}{task.result != null && <details><summary>Результат</summary><pre>{JSON.stringify(task.result, null, 2)}</pre></details>}</section>)}
      </Panel>
    </>}
    <Dialog open={!!pending} onOpenChange={open => { if (!open && !busy) setPending(null); }} title={pending?.title ?? 'Подтверждение'}>
      <p style={{ whiteSpace: 'pre-wrap' }}>{pending?.details}</p>
      <Button disabled={busy} onClick={() => setPending(null)}>Отмена</Button>
      <Button disabled={disabled} onClick={() => void submit()}>{busy ? 'Выполняется…' : 'Подтвердить'}</Button>
    </Dialog>
  </main>;
}

export const sharedAgentsExtension: UiExtension = {
  id: 'shared-agents', apiVersion: 1,
  pages: [{ id: 'overview', title: 'Shared Agents', component: Overview }],
  navigation: [{ page: 'overview', title: 'Shared Agents' }],
};
