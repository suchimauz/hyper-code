import { useState } from 'react';
import type { ChatEvent } from '../../lib/mauzcode';
import { requestJson } from '../../sdk/api';

/** Durable waiting receipt. Cancels only its exact run on an explicit click. */
export function ToolBusyRow({ event, agentId }: { event: ChatEvent; agentId: string }) {
  const [state, setState] = useState<'idle' | 'pending' | 'stopped'>('idle');
  const [error, setError] = useState('');
  const stopped = event.type === 'tool_aborted' || state === 'stopped';
  async function abort() {
    if (!event.runId || state !== 'idle') return;
    setState('pending'); setError('');
    try {
      await requestJson(`/agent/${encodeURIComponent(agentId)}/tool/${encodeURIComponent(event.runId)}/abort`, { method: 'POST' });
      setState('stopped');
    } catch (cause) {
      setState('idle'); setError(cause instanceof Error ? cause.message : 'Не удалось остановить вызов');
    }
  }
  return <article className="transcript-notice" data-event-idx={event.idx}>
    <strong>{stopped ? 'Вызов остановлен' : 'Сообщение ожидает обработки'}</strong>
    <div>{event.name || 'Инструмент'}{event.elapsedSec != null ? ` · ${event.elapsedSec} с` : ''}{event.timeoutMs ? ` · лимит ${Math.round(event.timeoutMs / 1000)} с` : ''}</div>
    {event.subject && <pre>{event.subject}</pre>}
    {!stopped && <p>Сообщение получено; агент прочитает его после завершения вызова.</p>}
    {!stopped && event.runId && <button type="button" className="load-older" disabled={state === 'pending'} onClick={() => { void abort(); }} title="Остановить только этот вызов — агент продолжит работу и прочитает сообщение">{state === 'pending' ? 'Остановка…' : `Остановить ${event.name || 'инструмент'}`}</button>}
    {state === 'stopped' && <p role="status">Запрос остановки принят</p>}
    {error && <p role="alert">{error}</p>}
  </article>;
}
