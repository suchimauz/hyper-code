import { useCallback, useEffect, useRef, useState } from 'react';
import { loadLiveClient, type LiveEvent } from '../lib/live';

export type CanvasView = { agentId: string; open: boolean; activeItemId: number | null; rev: string };
type CanvasEvent = LiveEvent & Partial<CanvasView>;

/** Canvas routes sometimes answer errors as text rather than JSON. */
async function canvasRequest<T>(path: string, signal: AbortSignal, body?: object): Promise<T> {
  const response = await fetch(path, {
    signal, credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Canvas: HTTP ${response.status}`);
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Сессия Canvas недоступна. Войдите в Hyper снова.');
  return response.json() as Promise<T>;
}

/** Agent-bound server view. Keep the iframe mounted separately; revisions never reload it.
 * Changes arrive on the app's shared live stream (canvas.changed carries the whole view), so no
 * extra long-poll connection is held; /watch remains only as a fallback without that stream. */
export function useCanvas(agentId: string | null | undefined) {
  const [view, setView] = useState<CanvasView | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, restart] = useState(0);
  const currentId = useRef(agentId); currentId.current = agentId;
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(() => {
    sequence.current++;
    controller.current?.abort();
    restart(n => n + 1);
  }, []);

  useEffect(() => {
    const token = ++sequence.current;
    controller.current?.abort();
    const run = new AbortController(); controller.current = run;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    const valid = () => !run.signal.aborted && sequence.current === token && currentId.current === agentId;
    setBusy(Boolean(agentId));
    if (!agentId) { setView(null); return () => run.abort(); }
    const base = `/canvas/${encodeURIComponent(agentId)}`;
    const fail = (error: unknown, retry: () => void) => {
      if (!valid()) return;
      setBusy(false); setFailure({ id: agentId, message: error instanceof Error ? error.message : String(error) });
      // Retry from state, not watch: a disconnected client may have missed any number of changes.
      timer = setTimeout(() => { if (valid()) retry(); }, 2000);
    };
    const read = async () => {
      const state = await canvasRequest<CanvasView>(`${base}/state`, run.signal);
      if (!valid()) return null;
      setView(state); setBusy(false); setFailure(null);
      return state;
    };
    // Long-poll only until the shared live stream is attached (or for good when it is unavailable).
    const poll = new AbortController();
    const polling = () => valid() && !poll.signal.aborted;
    const pollLoop = async () => {
      try {
        let state = await read();
        while (state && polling()) {
          const change = await canvasRequest<{ rev: string; changed: boolean }>(`${base}/watch?rev=${encodeURIComponent(state.rev)}`, AbortSignal.any([run.signal, poll.signal]));
          if (!polling()) return;
          if (change.changed || change.rev !== state.rev) state = await read();
        }
      } catch (error) { if (!poll.signal.aborted) fail(error, () => void pollLoop()); }
    };
    const resync = () => { void read().catch(error => fail(error, resync)); };
    const attach = async () => {
      let live: typeof window.hyperLive;
      try { await loadLiveClient(); live = window.hyperLive; } catch { live = undefined; }
      if (!valid() || !live) return;
      poll.abort();
      unsubscribe = live.subscribe({
        name: `react-canvas:${agentId}`, types: ['canvas.changed'], resync,
        onEvent: (event: CanvasEvent) => {
          if (!valid() || event.agentId !== agentId) return;
          if (typeof event.open === 'boolean' && typeof event.rev === 'string') {
            setView({ agentId, open: event.open, activeItemId: event.activeItemId ?? null, rev: event.rev }); setFailure(null);
          } else resync();
        },
      });
      resync();
    };
    // State is read at once; the live client usually is already loaded by the chat, then no /watch is held.
    if (window.hyperLive) void attach(); else { void pollLoop(); void attach(); }
    return () => { run.abort(); poll.abort(); unsubscribe?.(); if (timer) clearTimeout(timer); };
  }, [agentId, revision]);

  const setOpen = useCallback(async (open: boolean) => {
    if (!agentId) return;
    const token = ++sequence.current;
    controller.current?.abort();
    const run = new AbortController(); controller.current = run;
    const valid = () => !run.signal.aborted && sequence.current === token && currentId.current === agentId;
    setBusy(true); setFailure(null);
    try {
      const state = await canvasRequest<CanvasView>(`/canvas/${encodeURIComponent(agentId)}`, run.signal, { open });
      if (valid()) setView(state);
    } catch (error) {
      if (valid()) setFailure({ id: agentId, message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (valid()) { setBusy(false); restart(n => n + 1); }
    }
  }, [agentId]);
  // Mutations use their own controller, so unmount must abort that one too.
  useEffect(() => () => { sequence.current++; controller.current?.abort(); }, []);
  const bound = view?.agentId === agentId ? view : null;
  return { view: bound, open: bound?.open ?? false, activeItemId: bound?.activeItemId ?? null, rev: bound?.rev ?? null,
    loading: Boolean(agentId) && busy, error: failure && failure.id === agentId ? failure.message : null, setOpen, refresh };
}
