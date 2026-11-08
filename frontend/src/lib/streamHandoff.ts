import type { EventPage } from './hyper';
/** Keep the last visible draft only during an explicit server handoff to storage.
 * Stop/error/discard (no handoff) clears it immediately; no text matching or timers. */
export function reconcileStream(previous: EventPage | null, next: EventPage): EventPage['partial'] {
  const draft = previous?.agentId === next.agentId ? previous.partial : null;
  if (next.partial) return next.partial;
  if (!next.streamHandoff || !draft) return null;
  const previousTail = Math.max(-1, ...previous!.events.map(event => event.idx));
  const committed = next.events.some(event => event.idx > previousTail && event.type === 'assistant' && !event.agentMessage && !event.outgoingAgentMessage);
  return committed ? null : draft;
}
