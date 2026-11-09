import { describe, expect, test } from 'bun:test';
import run from './run';

// Entirely in-memory: no runtime bootstrap, shared DB, or real Knowledge writes.
function harness(turns: any[], scratchpad: any = { knowledgeTrackingEnabled: true }) {
    const rows: any[] = [];
    const launches: any[] = [];
    const agent: any = { id: 'mock', scratchpad, messages: [], events: [] };
    const appendMessage = async ({ message }: any) => { const row = { ...message, idx: rows.length }; rows.push(row); return row; };
    const noop = async () => {};
    const ctx: any = { fns: {
        goal: { delegationScope: async ({ fn }: any) => fn(), runBindingCapture: async () => ({ kind: 'disabled', allowContinuation: false }) },
        session: { forAgent: () => ({}), appendUserMessage: ({ text }: any) => appendMessage({ message: { role: 'user', content: text } }), appendMessage,
            syncAgentState: async () => { agent.messages = rows.map(r => ({ ...r })); }, appendAssistantEvent: async () => ({idx: 0}), appendErrorEvent: noop, appendToolCallEvent: noop,
            updateMessageContent: async ({ idx, content }: any) => { rows[idx].content = content; }, recordContextUsage: noop },
        agent: { recordRunLifecycle: async () => {}, autoCompactIfNeeded: async () => ({ status: 'not_needed' }), statusLineForTurn: async () => '', stashResult: async ({ output }: any) => ({ content: output }), sanitizeHtmlBody: ({ html }: any) => html },
        procs: { events: { emit: () => {} }, db: { select: async () => [{ i: Math.max(-1, ...rows.filter(r => r.role === 'user').map(r => r.idx)) }] } },
        llm: { stream: async () => { const turn = turns.shift(); if (turn instanceof Error) throw turn; return turn ?? { text: 'done' }; } },
        markdown: { render: async ({ source }: any) => source },
        tools: { call: async ({ name }: any) => ({ output: 'tool persisted', ...(name === 'respondHtml' ? { terminal: { type: 'html', html: '<p>final</p>', text: 'final' } } : {}) }) },
        knowledge: { updateSidecar: async (o: any) => { launches.push({ messageIdx: o.messageIdx, rows: rows.map(r => ({ ...r })) }); } },
    } };
    return { ctx, agent, rows, launches, execute: (already = false) => run(ctx, null, { agent, userText: 'question', userMessageAlreadyAppended: already }) };
}

describe('Knowledge completed-turn hook (isolated)', () => {
    test('tool result references accompany preview in persisted messages and events', async () => {
        const h = harness([{ toolCalls: [{ id: 't', name: 'read', args: {} }] }, { text: 'answer' }]);
        const ref = { version: 1, id: 'result-uuid', ownerAgentId: 'mock', bytes: 7000, sha256: 'hash', kind: 'read' };
        const events: any[] = [];
        h.ctx.fns.agent.stashResult = async () => ({ content: 'bounded preview', result_ref: ref });
        h.ctx.fns.session.updateMessageContent = async ({ idx, content, result_ref }: any) => Object.assign(h.rows[idx], { content, result_ref });
        h.ctx.fns.session.appendToolCallEvent = async ({ payload }: any) => events.push(payload);
        await h.execute();
        expect(h.rows.find((r: any) => r.role === 'tool')).toMatchObject({ content: 'bounded preview', result_ref: ref });
        expect(events[0]).toMatchObject({ result: 'bounded preview', result_ref: ref });
    });
    test('direct run extracts once after final prose and completed tool rows', async () => {
        const h = harness([{ text: 'working', toolCalls: [{ id: 't', name: 'read', args: {} }] }, { text: 'answer' }]);
        await h.execute();
        expect(h.launches).toHaveLength(1);
        expect(h.launches[0].messageIdx).toBe(3);
        expect(h.launches[0].rows.map((r: any) => r.content)).toEqual(['question', 'working', 'tool persisted', 'answer']);
    });
    test('worker-style pre-appended input and terminal HTML include all tool results and final assistant', async () => {
        const h = harness([{ toolCalls: [{ id: 't', name: 'respondHtml', args: {} }, { id: 'u', name: 'read', args: {} }] }]);
        h.rows.push({ idx: 0, role: 'user', content: 'queued' });
        const result = await h.execute(true);
        expect(result.terminal).toBe(true);
        expect(h.launches).toHaveLength(1);
        expect(h.launches[0].messageIdx).toBe(4);
        expect(h.launches[0].rows.slice(2).map((r: any) => r.content)).toEqual(['tool persisted', 'tool persisted', 'final']);
    });
    test('cutoff is final append index, not concurrently arriving user index', async () => {
        const h = harness([{ text: 'answer' }]);
        h.ctx.fns.session.appendAssistantEvent = async () => { h.rows.push({ idx: h.rows.length, role: 'user', content: 'next turn' }); return {idx: 0}; };
        await h.execute();
        expect(h.launches[0].messageIdx).toBe(1);
        expect(h.rows.at(-1).idx).toBe(2);
    });
    test('disabled, absent plugin, and observer forks never launch', async () => {
        for (const flags of [{}, { knowledgeTrackingEnabled: false }, { knowledgeTrackingEnabled: true, knowledgeSidecarFor: 'p' }, { knowledgeTrackingEnabled: true, goalSidecarFor: 'p' }]) {
            const h = harness([{ text: 'answer' }], flags); await h.execute(); expect(h.launches).toHaveLength(0);
        }
        const h = harness([{ text: 'answer' }]); delete h.ctx.fns.knowledge;
        await h.execute(); expect(h.launches).toHaveLength(0);
    });
    test('LLM errors, aborted responses and empty responses do not launch', async () => {
        const h = harness([new Error('provider failed')]); await expect(h.execute()).rejects.toThrow('provider failed'); expect(h.launches).toHaveLength(0);
        const empty = harness([{ text: '' }]); await expect(empty.execute()).rejects.toThrow('Model returned an empty response'); expect(empty.launches).toHaveLength(0);
        const aborted = harness([]); aborted.ctx.fns.llm.stream = async () => { aborted.agent.abortController.abort(); return { text: 'partial' }; };
        await expect(aborted.execute()).rejects.toMatchObject({ name: 'AbortError' }); expect(aborted.launches).toHaveLength(0);
    });
    test('extraction is not awaited and sync/async plugin failures do not fail the turn', async () => {
        for (const impl of [() => { throw new Error('sync'); }, async () => { throw new Error('async'); }, () => new Promise(() => {})]) {
            const h = harness([{ text: 'answer' }]); h.ctx.fns.knowledge.updateSidecar = impl;
            expect((await h.execute()).text).toBe('answer'); await Promise.resolve();
        }
    });
});
