import type { ChatEvent } from '../../lib/hyper';

export const isCommandEvent = (event: ChatEvent) => event.type === 'command_invocation' || event.type === 'command_result';

/** Pair only explicit operation identities, before turn grouping/pagination rendering.
 * Keep the invocation's index so an arriving result preserves disclosure state.
 * An orphan result is useful history and remains visible on truncated pages.
 */
export function coalesceCommands(events: ChatEvent[]): ChatEvent[] {
  const invocations = new Map<string, ChatEvent>();
  const results = new Map<string, ChatEvent>();
  for (const event of events) {
    if (!event.operationId) continue;
    if (event.type === 'command_invocation') invocations.set(event.operationId, event);
    if (event.type === 'command_result') results.set(event.operationId, event);
  }
  return events.flatMap(event => {
    // Never infer ownership from text or adjacency: historical mode changes survive.
    if (event.type === 'planning_mode' && event.operationId && (invocations.has(event.operationId) || results.has(event.operationId))) return [];
    if (!event.operationId) return [event];
    if (event.type === 'command_result' && invocations.has(event.operationId)) return [];
    const result = event.type === 'command_invocation' ? results.get(event.operationId) : undefined;
    return [result ? { ...event, ...result, idx: event.idx, ts: event.ts } : event];
  });
}

/** Metadata is the authority; plain slash-looking prose is never highlighted. */
export function commandMessage(event: ChatEvent): { prefix: string; token: string; suffix: string } | null {
  if (!event.command || typeof event.command !== 'object' || typeof event.command.name !== 'string' || typeof event.command.text !== 'string') return null;
  const text = event.command.text;
  const token = `/${event.command.name}`;
  const start = text.length - text.trimStart().length;
  if (!text.startsWith(token, start) || (text.length > start + token.length && !/\s/.test(text[start + token.length]))) return null;
  return { prefix: text.slice(0, start), token, suffix: text.slice(start + token.length) };
}
