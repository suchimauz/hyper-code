import { loadLiveClient, type LiveEvent, type LiveStatus } from './live';

/** One in-flight read per subscriber. SSE invalidates; GET remains authoritative.
 * Hidden tabs do no reads. Reconnect/visibility reconcile snapshots; slow polling
 * catches missed signals, fast polling is reserved for a disconnected transport.
 */
export function liveRefresh(options: {
  name: string;
  matches: (event: LiveEvent) => boolean;
  read: (signal: AbortSignal) => Promise<void>;
  fallbackMs?: number;
  onStatus?: (status: LiveStatus) => void;
}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false, pending = false, attaching = false;
  let lastStart = -Infinity;
  let status: LiveStatus = 'connecting';
  let unsubscribe: (() => void) | undefined;
  let unstatus: (() => void) | undefined;
  const delay = () => status === 'connected' ? 60000 : (options.fallbackMs ?? 2500);
  const visible = () => !document.hidden;
  function schedule(ms: number) {
    clearTimeout(timer);
    if (!controller.signal.aborted && visible()) timer = setTimeout(() => { void run(); }, ms);
  }
  async function attach() {
    if (attaching || unsubscribe || controller.signal.aborted) return;
    attaching = true;
    try {
      await loadLiveClient();
      if (controller.signal.aborted) return;
      const live = window.hyperLive!;
      live.refreshTopics?.();
      const changed = (next: LiveStatus) => {
        const previous = status; status = next; options.onStatus?.(next);
        if (next === 'connected' && previous !== next) refresh();
        else if (!busy && !pending) schedule(delay());
      };
      unsubscribe = live.subscribe({ name: options.name, types: ['refresh', 'agent.updated', 'agents.changed'],
        onEvent: event => { if (options.matches(event)) refresh(); }, resync: () => refresh() });
      // Older servers without health reporting keep the safe fallback polling.
      status = live.getStatus?.() ?? 'disconnected'; options.onStatus?.(status);
      unstatus = live.onStatus?.(changed);
      if (!busy && !pending) schedule(delay());
    } catch {
      status = 'disconnected'; options.onStatus?.(status);
    } finally { attaching = false; }
  }
  async function run() {
    if (controller.signal.aborted || !visible()) return;
    if (busy) { pending = true; return; }
    busy = true; pending = false; lastStart = Date.now(); clearTimeout(timer);
    void attach();
    try { await options.read(controller.signal); }
    finally {
      busy = false;
      if (!controller.signal.aborted) schedule(pending ? Math.max(100, 250 - (Date.now() - lastStart)) : delay());
    }
  }
  function refresh() {
    if (controller.signal.aborted || !visible()) return;
    if (busy) { pending = true; return; }
    // Fixed window rather than debounce: continuous token events cannot starve a read.
    if (pending) return;
    pending = true;
    schedule(Math.max(100, 250 - (Date.now() - lastStart)));
  }
  const visibility = () => { if (visible()) { pending = false; refresh(); } else { clearTimeout(timer); pending = false; } };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('online', refresh);
  void attach(); void run();
  return { refresh, dispose: () => {
    controller.abort(); clearTimeout(timer); unsubscribe?.(); unstatus?.();
    document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', refresh);
  } };
}
