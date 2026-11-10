import { useCallback, useEffect, useRef, useState } from 'react';
import { changeQueue, enqueueMessage, getQueue, type QueueItem } from '../lib/queue';

export function useMessageQueue(agentId: string, onAccepted: () => void) {
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [sending, setSending] = useState<QueueItem | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const mounted = useRef(true);
  const locked = useRef(false);
  const reading = useRef<Promise<void> | null>(null);
  const accepted = useRef(onAccepted); accepted.current = onAccepted;
  const refresh = useCallback((signal?: AbortSignal, clearSending = false): Promise<void> => {
    if (reading.current) return reading.current.then(() => refresh(signal, clearSending));
    const current = generation.current;
    const task = (async () => {
      try {
        const result = await getQueue(agentId, signal);
        if (mounted.current && current === generation.current) {
          setWaitingForInput(result.waitingForInput === true);
          setItems((result.items || []).filter(item => item.status === 'pending').sort((a, b) => a.sequence - b.sequence)); setError('');
          if (clearSending) setSending(null);
        }
      } catch (err) { if (mounted.current && !signal?.aborted && current === generation.current) setError(err instanceof Error ? err.message : String(err)); }
    })();
    reading.current = task;
    return task.finally(() => { reading.current = null; });
  }, [agentId]);
  useEffect(() => {
    mounted.current = true; const controller = new AbortController();
    setWaitingForInput(false); setItems([]); setSending(null); setProcessing(null); setError('');
    void refresh(controller.signal);
    const poll = () => { if (!document.hidden && !locked.current && !reading.current) void refresh(controller.signal); };
    const timer = setInterval(poll, 2000);
    document.addEventListener('visibilitychange', poll);
    return () => { mounted.current = false; ++generation.current; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', poll); };
  }, [refresh]);
  const enqueue = async (text: string, requestId: string, files: File[]) => {
    locked.current = true; ++generation.current;
    setSending({ id: requestId, sequence: Infinity, text, version: 0, status: 'pending', createdAt: Date.now(), files: files.map(({ name, size, type }) => ({ name, size, type })) });
    try { await enqueueMessage(agentId, text, requestId, files); if (mounted.current) await refresh(undefined, true); }
    finally { locked.current = false; if (mounted.current) setSending(null); }
  };
  const perform = async (rows: QueueItem[], action: 'edit' | 'remove' | 'steer', text?: string) => {
    if (locked.current) return false;
    locked.current = true; ++generation.current; setProcessing(rows[0]?.id || 'all'); setError('');
    let success = false;
    let failure = '';
    try { for (const item of rows) await changeQueue(agentId, item, action, text); success = true; if (mounted.current) accepted.current(); }
    catch (err) { failure = err instanceof Error ? err.message : String(err); }
    finally { if (mounted.current) { await refresh(); setProcessing(null); if (failure) setError(failure); } locked.current = false; }
    return success;
  };
  return { waitingForInput, items, sending, processing, error, refresh, enqueue, perform };
}
