import { describe, expect, test } from 'bun:test';
import run from './run';

function harness(turns: any[]) {
    const rows: any[] = [{ idx: 0, role: 'user', content: 'go' }];
    const errors: string[] = [];
    const agent: any = { id: 'guard-test', model: 'mock:test', messages: rows.slice(), scratchpad: {}, events: [] };
    let sampled = 0;
    let calls = 0;
    let stops = 0;
    const append = async ({ message }: any) => { const row = { ...message, idx: rows.length }; rows.push(row); return row; };
    const noop = async () => {};
    const ctx: any = { state: { agent: { [agent.id]: agent } }, fns: {
        session: {
            forAgent: () => null, appendMessage: append,
            syncAgentState: async () => { agent.messages = rows.slice(); },
            recordContextUsage: noop, appendAssistantEvent: noop, appendToolCallEvent: noop,
            appendErrorEvent: async ({ error }: any) => { errors.push(error); },
            updateMessageContent: async ({ idx, content }: any) => { rows[idx].content = content; },
        },
        procs: { events: { emit: noop }, db: { select: async ({ sql }: any) => sql.includes('MAX(idx)') ? [{ i: 0 }] : [{ stopped_at: null }] } },
        agent: { statusLineForTurn: async () => '', autoCompactIfNeeded: async () => ({ status: 'not_needed' }),
            stop: async () => { stops++; }, stashResult: async ({ output }: any) => ({ content: output }) },
        events: { emitAgentsChanged: noop, refreshAgentMeta: noop },
        markdown: { render: async ({ source }: any) => source },
        llm: { stream: async () => { if (sampled >= turns.length) throw new Error('unexpected extra model request'); return turns[sampled++]; } },
        tools: { call: async () => { calls++; return { output: 'ok' }; }, runs: () => [] },
    } };
    return { ctx, agent, rows, errors, get sampled() { return sampled; }, get calls() { return calls; }, get stops() { return stops; } };
}
const bad = (finishReason = 'tool_calls', mixed = false) => ({ text: '', usage: null, finishReason, toolCalls: [
    ...(mixed ? [{ id: 'valid', name: 'read', args: { path: 'a.ts' } }] : []),
    { id: 'bad', name: 'read', args: { __unparsed: '{' } },
] });
const done = { text: 'done', usage: null, finishReason: 'stop', toolCalls: [] };
const execute = (h: ReturnType<typeof harness>) => run(h.ctx, null, { agent: h.agent, userText: '', userMessageAlreadyAppended: true });

describe('malformed argument guard without external services', () => {
    for (const reason of ['length', 'tool_calls', 'stop']) test(`rejects entire mixed batch: ${reason}`, async () => {
        const h = harness([bad(reason, true), done]);
        await execute(h);
        expect(h.calls).toBe(0);
        expect(h.sampled).toBe(2);
        expect(h.rows.some(r => r.tool_calls?.length || r.role === 'tool')).toBe(false);
        const feedback = h.rows.find(r => r.excluded_from_cursor);
        expect(feedback.content.includes('token limit')).toBe(reason === 'length');
        expect(feedback.content).toContain('NOTHING');
    });
    test('stops at three consecutive malformed replies without stopping agents', async () => {
        const h = harness([bad(), bad('length'), bad('stop')]);
        const result = await execute(h);
        expect(h.sampled).toBe(3);
        expect(h.calls).toBe(0);
        expect(h.stops).toBe(0);
        expect(result.text).toContain('check the model gateway');
        expect(h.rows.at(-1).content).toBe(result.text);
    });
    test('valid tool response resets the retry counter', async () => {
        const valid = { text: '', usage: null, finishReason: 'tool_calls', toolCalls: [{ id: 'ok', name: 'read', args: { path: 'a.ts' } }] };
        const h = harness([bad(), bad(), valid, bad(), bad(), done]);
        const result = await execute(h);
        expect(result.text).toBe('done');
        expect(h.sampled).toBe(6);
        expect(h.calls).toBe(1);
    });
});
