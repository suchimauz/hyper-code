import type { ChatEvent } from '../../lib/mauzcode';
export const isCompaction = (event: ChatEvent) => ['compaction_start', 'compaction_completed', 'compaction_failed'].includes(event.type);
/** Update a lifecycle in place, preserving its chronological position across loaded pages. */
export function coalesceCompactions(events: ChatEvent[]): ChatEvent[] {
  const result: ChatEvent[] = [];
  const positions = new Map<number, number>();
  for (const event of events) {
    if (!isCompaction(event) || event.revision == null) { result.push(event); continue; }
    const position = positions.get(event.revision);
    if (position == null) { positions.set(event.revision, result.length); result.push(event); }
    else { const first = result[position]; result[position] = { ...first, ...event, idx: first.idx, ts: first.ts }; }
  }
  return result;
}
