import type { ChatEvent } from '../../lib/mauzcode';

export type ProcessEntry = { kind: 'message'; event: ChatEvent } | { kind: 'process'; key: number; events: ChatEvent[] };
export type RunMetadata = { id: string; startIdx: number; endIdx: number | null; startedAt: number; endedAt: number | null; status: 'open' | 'completed' | 'stopped' | 'error'; answerIdx: number | null; hasInterleavedInput: boolean };
export type WorkTurn = { run?: RunMetadata; key: number; input?: ChatEvent; events: ChatEvent[]; answer?: ChatEvent; status: 'completed' | 'stopped' | 'error' | 'open'; latest: boolean; completeStart: boolean };
const isHumanInput = (event: ChatEvent) => event.type === 'user' && event.messageIdx != null && !event.agentMessage && !event.outgoingAgentMessage && event.author?.kind !== 'agent' && event.navigationEligible !== false;
export const isPeer = (event: ChatEvent) => !!(event.agentMessage || event.outgoingAgentMessage || event.author?.kind === 'agent' || event.type === 'agent_message_outgoing');
const isProcess = (event: ChatEvent) => isPeer(event) || ['thinking', 'tool_call', 'tool_result'].includes(event.type);

/** dsh process-groups: contiguous work only; every assistant reply and input flushes it. */
export function processEntries(events: ChatEvent[]): ProcessEntry[] {
  const entries: ProcessEntry[] = [];
  for (const event of events) {
    const tail = entries.at(-1);
    if (isProcess(event)) {
      if (tail?.kind === 'process') tail.events.push(event);
      else entries.push({ kind: 'process', key: event.idx, events: [event] });
    } else entries.push({ kind: 'message', event });
  }
  return entries;
}

/** Prefer durable execution ranges and explicit final-answer identity. Legacy
 * history uses linked human input only; a truncated prefix is never invented
 * as a complete execution, nor are input timestamps used as duration.
 */
export function workTurns(events: ChatEvent[], running: boolean, runs: RunMetadata[] = []): WorkTurn[] {
  if (runs.length) {
    const result: WorkTurn[] = [];
    let legacy: ChatEvent[] = [];
    const flush = (atTail = false) => { if (legacy.length) result.push(...workTurns(legacy, atTail && running)); legacy = []; };
    for (const event of events) {
      const run = runs.find(item => event.idx >= item.startIdx && (item.endIdx == null || event.idx <= item.endIdx));
      if (!run) { legacy.push(event); continue; }
      // Peer delivery can precede the durable start of the run it wakes.
      // Carry only the adjacent peer suffix into that run; keep human input,
      // assistant replies and earlier work on their original side of the boundary.
      let peerStart = legacy.length;
      while (peerStart > 0 && isPeer(legacy[peerStart - 1])) peerStart--;
      const pendingPeers = legacy.splice(peerStart);
      flush();
      let turn = result.at(-1);
      if (turn?.run?.id !== run.id) { turn = { key: run.startIdx, run, events: [], status: run.status, latest: false, completeStart: true }; result.push(turn); }
      turn.events.push(...pendingPeers);
      if (event.idx === run.answerIdx && run.status === 'completed') turn.answer = event;
      else turn.events.push(event);
    }
    flush(true);
    for (const turn of result) turn.latest = !events.some(event => event.idx > (turn.run?.endIdx ?? turn.events.at(-1)?.idx ?? turn.key) && isHumanInput(event));
    return result;
  }
  const turns: WorkTurn[] = [];
  for (const event of events) {
    if (!turns.length || isHumanInput(event)) {
      const input = isHumanInput(event) ? event : undefined;
      turns.push({ key: event.idx, input, events: input ? [] : [event], status: 'open', latest: false, completeStart: !!input });
    } else turns.at(-1)!.events.push(event);
  }
  turns.forEach((turn, index) => {
    turn.latest = index === turns.length - 1;
    // Peer receipts belong inside the same work block, not after its answer.
    const last = turn.events.filter(event => !isPeer(event)).at(-1);
    // Tool failures are recoverable; only terminal event status marks the work.
    const interrupted = last?.type === 'stop';
    const failed = last?.type === 'error';
    const final = last?.type === 'assistant' && last.isFinalReply !== false && (last.isFinalReply === true || !(turn.latest && running));
    turn.status = interrupted ? 'stopped' : failed ? 'error' : final ? 'completed' : 'open';
    // A persisted final reply closes even a paginated prefix. It does not claim
    // a start time or fabricate historical run duration.
    if (final && last?.isFinalReply === true) turn.completeStart = true;
    // Only a settled closing reply is outside whole-work collapse. Commentary
    // followed by tools is never mistaken for an answer (including respondHtml).
    if (turn.status === 'completed' && last?.type === 'assistant') {
      turn.answer = last;
      turn.events = turn.events.filter(event => event !== last);
    }
  });
  return turns;
}
