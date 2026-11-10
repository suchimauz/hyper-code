import { useCallback, useEffect, useRef, useState } from 'react';
import { getEvents, requestJson, type ChatEvent, type EventPage } from '../lib/mauzcode';
import type { ChatNavigationItem } from '../components/mauzcode/ChatNavigation';

/** Fetch prompt-only pages; pagination is bounded by a strictly advancing cursor. */
export async function fetchChatOutline(id: string, signal: AbortSignal): Promise<ChatNavigationItem[]> {
  const items: ChatNavigationItem[] = [];
  let after = -1;
  for (;;) {
    const page = await requestJson<{ items: ChatNavigationItem[]; nextAfter: number | null }>(`/api/v1/agents/${encodeURIComponent(id)}/outline?after=${after}`, { signal });
    items.push(...page.items);
    if (page.nextAfter == null) return items;
    if (!Number.isSafeInteger(page.nextAfter) || page.nextAfter <= after) throw new Error('Курсор истории не продвигается');
    after = page.nextAfter;
  }
}
/** Load older event pages until a selected outline anchor is present, without stale-state loops. */
export async function fetchThrough(id: string, idx: number, before: number, signal: AbortSignal, onPage?: (page: EventPage) => void): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  let cursor = before;
  while (cursor > idx) {
    const page = await getEvents(id, signal, cursor);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    onPage?.(page);
    events.push(...page.events);
    if (page.events.some(event => event.idx === idx)) break;
    const next = page.olderBefore;
    if (!page.hasOlder || next == null || next <= idx) break;
    if (next >= cursor) throw new Error('Курсор истории не продвигается');
    cursor = next;
  }
  return events;
}

/** Complete history metadata and replaceable, abortable jump requests for one chat. */
export function useChatOutline(id: string, events: ChatEvent[], prepend: (events: ChatEvent[], runs: NonNullable<EventPage['runs']>) => void) {
  const [outline, setOutline] = useState<ChatNavigationItem[]>([]);
  const jump = useRef<AbortController | null>(null);
  const latest = useRef({ events, prepend }); latest.current = { events, prepend };
  const lastUser = events.filter(event => event.type === 'user' && event.messageIdx != null).at(-1)?.idx;
  useEffect(() => {
    const controller = new AbortController();
    if (!id) { setOutline([]); return; }
    void fetchChatOutline(id, controller.signal).then(items => { if (!controller.signal.aborted) setOutline(items); }).catch(() => { /* Loaded anchors remain usable during offline recovery. */ });
    return () => controller.abort();
  }, [id, lastUser]);
  useEffect(() => { setOutline([]); return () => { jump.current?.abort(); }; }, [id]);
  const loadThrough = useCallback(async (idx: number) => {
    jump.current?.abort(); const controller = new AbortController(); jump.current = controller;
    const first = latest.current.events[0]?.idx;
    if (first == null || idx >= first) return;
    const runs: NonNullable<EventPage['runs']> = [];
    const earlier = await fetchThrough(id, idx, first, controller.signal, page => runs.push(...(page.runs ?? [])));
    if (!controller.signal.aborted) latest.current.prepend(earlier, runs);
  }, [id]);
  return { outline, loadThrough };
}
