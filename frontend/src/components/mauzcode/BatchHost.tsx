import { useEffect, useRef, useState } from 'react';
import { getBatch, getBatches, type BatchSnapshot } from '../../lib/batches';
import { liveRefresh } from '../../lib/liveRefresh';
import { BatchCard } from './BatchCard';

/** One atomic parent card. Reconnects read snapshots only; writes belong to explicit card actions. */
export function BatchHost({ agentId, onInputs, onAccepted }: { agentId: string; onInputs: (inputs: BatchSnapshot[]) => void; onAccepted: () => void }) {
  const [current, setCurrent] = useState<BatchSnapshot | null>(null);
  const [error, setError] = useState('');
  const callbacks = useRef({ onInputs, onAccepted }); callbacks.current = { onInputs, onAccepted };
  const refresh = useRef(() => {});
  useEffect(() => {
    setCurrent(null); setError('');
    const live = liveRefresh({ name: `batch-inputs:${agentId}`, fallbackMs: 4000, matches: event => !event.agentId || event.agentId === agentId, read: async signal => {
      try {
        const { inputs } = await getBatches(agentId, signal);
        const pending = inputs.find(input => input.state === 'open' || input.state === 'processing');
        const detail = pending ? await getBatch(pending.id, signal) : null;
        if (signal.aborted) return;
        callbacks.current.onInputs(inputs); setCurrent(detail); setError('');
      } catch { if (!signal.aborted) setError('Не удалось обновить вопросы. Повторим загрузку автоматически.'); }
    } });
    refresh.current = live.refresh;
    return () => { refresh.current = () => {}; live.dispose(); };
  }, [agentId]);
  return <>{error && <p role="status">{error}</p>}{current && <BatchCard key={current.id} initial={current} onSnapshot={next => { setCurrent(next); if (['submitted', 'cancelled', 'expired'].includes(next.state)) callbacks.current.onAccepted(); refresh.current(); }} />}</>;
}
