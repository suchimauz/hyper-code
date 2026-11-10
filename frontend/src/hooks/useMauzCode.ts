import { useCallback, useEffect, useRef, useState } from 'react';
import { getAgents, getEvents, mergeTail, settleRetries, type ChatEvent, type EventPage, type MauzCodeAgent } from '../lib/mauzcode';
import { liveRefresh } from '../lib/liveRefresh';
import { useReadReceipt } from './useReadReceipt';
import { reconcileStream } from '../lib/streamHandoff';
import { useChatOutline } from './useChatOutline';
const mergeRuns = (older: EventPage['runs'], newer: EventPage['runs']) => [...new Map([...(older ?? []), ...(newer ?? [])].map(run => [run.id, run])).values()].sort((a, b) => a.startIdx - b.startIdx);

export function useMauzCode() {
  const [agents, setAgents] = useState<MauzCodeAgent[]>([]);
  const [selected, setSelected] = useState(() => new URL(location.href).searchParams.get('newSession') === '1' ? '' : new URL(location.href).searchParams.get('agent') || '');
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [page, setPage] = useState<EventPage | null>(null);
  const [error, setError] = useState('');
  const [liveError, setLiveError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderBefore, setOlderBefore] = useState<number | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const current = useRef(selected); current.current = selected;
  const generation = useRef(0);
  const select = useCallback((id: string) => {
    current.current = id; setSelected(id); const url = new URL(location.href);
    if (id) { url.searchParams.delete('newSession'); url.searchParams.set('agent', id); url.searchParams.delete('new'); }
    else { url.searchParams.delete('agent'); url.searchParams.set('new', '1'); }
    history.replaceState(null, '', url);
  }, []);
  useEffect(() => {
    const live = liveRefresh({ name: 'react-agent-list', fallbackMs: 10000,
      matches: event => !event.topic || event.topic === 'agents',
      read: async signal => {
        try {
          const result = await getAgents(signal);
          if (signal.aborted) return;
          setAgents(result.agents);
          if (!current.current) setLoading(false);
        } catch (err) { if (!signal.aborted) { setError(err instanceof Error ? err.message : String(err)); setLoading(false); } }
      },
    });
    return live.dispose;
  }, []);
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    const token = ++generation.current;
    if (!selected) {
      window.mauzcodeLive?.refreshTopics?.();
      refreshRef.current = () => {};
      setEvents([]); setPage(null); setLoading(false); setError(''); setHasOlder(false); setOlderBefore(null); setLoadingOlder(false);
      return;
    }
    let first = true;
    setEvents([]); setPage(null); setError(''); setLoading(true); setHasOlder(false); setOlderBefore(null); setLoadingOlder(false);
    const live = liveRefresh({ name: 'react-chat',
      matches: event => !event.topic || event.topic === `agent:${selected}` || event.topic === `agent:${selected}:stream` || (event.type === 'agents.changed' && event.agentId === selected),
      onStatus: status => setLiveError(status === 'disconnected' ? 'Связь с живыми обновлениями потеряна. Используется временный опрос.' : ''),
      read: async signal => {
        try {
          const result = await getEvents(selected, signal);
          if (signal.aborted || generation.current !== token || current.current !== selected) return;
          const initial = first;
          setEvents(old => initial ? settleRetries(result.events) : mergeTail(old, result));
          setPage(old => ({ ...result, partial: reconcileStream(initial ? null : old, result), runs: initial ? result.runs : mergeRuns(old?.runs, result.runs) })); setError('');
          if (first) { setOlderBefore(result.olderBefore); setHasOlder(result.hasOlder); first = false; }
        } catch (err) { if (!signal.aborted) setError(err instanceof Error ? err.message : String(err)); }
        finally { if (!signal.aborted) setLoading(false); }
      },
    });
    refreshRef.current = live.refresh;
    return live.dispose;
  }, [selected]);
  useReadReceipt(selected, page);
  const loadOlder = async () => {
    if (olderBefore == null || loadingOlder) return;
    const id = selected; const token = generation.current; setLoadingOlder(true);
    try {
      const result = await getEvents(id, undefined, olderBefore);
      if (token !== generation.current || current.current !== id) return;
      setEvents(old => settleRetries([...new Map([...result.events, ...old].map(event => [event.idx, event])).values()].sort((a, b) => a.idx - b.idx)));
      setPage(old => old ? { ...old, runs: mergeRuns(result.runs, old.runs) } : old);
      setOlderBefore(result.olderBefore); setHasOlder(result.hasOlder);
    } catch (err) { if (token === generation.current) setError(err instanceof Error ? err.message : String(err)); }
    finally { if (token === generation.current) setLoadingOlder(false); }
  };
  const { outline, loadThrough } = useChatOutline(selected, events, (earlier, runs) => {
    if (!earlier.length) return;
    setEvents(old => settleRetries([...new Map([...earlier, ...old].map(event => [event.idx, event])).values()].sort((a, b) => a.idx - b.idx)));
    setPage(old => old ? { ...old, runs: mergeRuns(runs, old.runs) } : old);
    const first = Math.min(...earlier.map(event => event.idx));
    setOlderBefore(first); setHasOlder(first > 0);
  });
  return { agents, selected, select, events, page, loading, error, liveError, hasOlder, loadingOlder, loadOlder, outline, loadThrough, refresh: () => refreshRef.current() };
}
