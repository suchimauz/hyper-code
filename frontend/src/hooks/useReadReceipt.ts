import { useEffect, useRef } from 'react';
import { markChatRead, type EventPage } from '../lib/mauzcode';

/** Acknowledge only a committed snapshot of the selected, visible chat.
 * Bound the receipt by its event timestamp so a newer response arriving during
 * the POST is not accidentally marked read. Partial token updates need no POST.
 */
export function useReadReceipt(id: string, page: EventPage | null) {
  const opened = useRef({ id: '', throughTs: 0 });
  if (opened.current.id !== id) opened.current = { id, throughTs: 0 };
  if (page?.agentId === id && !opened.current.throughTs) {
    opened.current.throughTs = Math.max(0, ...page.events.map(event => event.ts));
  }
  // Opening acknowledges the loaded tail, even if its last reply is outside
  // the 80-event window. Afterwards only notification-bearing events advance
  // unread state; tool/token progress must not cause navigation GETs.
  const throughTs = page?.agentId === id ? Math.max(opened.current.throughTs, ...page.events.filter(event => event.type === 'assistant' || event.type === 'error').map(event => event.ts)) : 0;
  useEffect(() => {
    if (!id || !throughTs) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false, done = false;
    async function mark() {
      if (document.hidden || busy || done || controller.signal.aborted) return;
      busy = true;
      try {
        const result = await markChatRead(id, throughTs, controller.signal);
        if (controller.signal.aborted) return;
        if (!result.ok) throw new Error('Read receipt was not acknowledged');
        done = true;
        window.dispatchEvent(new CustomEvent('mauzcode-ui:read', { detail: { id, seenAt: result.seenAt } }));
      } catch {
        // Non-critical: keep the unread badge and retry, never claim success offline.
        if (!controller.signal.aborted) timer = setTimeout(() => { void mark(); }, 5000);
      } finally { busy = false; }
    }
    const visible = () => { if (!document.hidden) { clearTimeout(timer); void mark(); } };
    // Let React commit the loaded transcript before acknowledging it.
    timer = setTimeout(() => { void mark(); }, 100);
    document.addEventListener('visibilitychange', visible);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [id, throughTs]);
}
