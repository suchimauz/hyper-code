import { expect, test } from 'bun:test';
import run from './run';

// No shared runtime or DB: deferred hooks place Stop exactly across awaits.
function harness() {
    const rows: any[] = [];
    const agent: any = { id: 'cancel', scratchpad: {}, messages: [] };
    const noop = async () => {};
    let stopped = false;
    let calls = 0;
    const append = async ({ message }: any) => { const row = { ...message, idx: rows.length }; rows.push(row); return row; };
    const ctx: any = { fns: {
        procs: { events: { emit: () => {} }, db: { select: async () => [{ stopped_at: stopped ? 1 : null, i: 0 }] } },
        session: { forAgent: () => null, appendMessage: append,
            appendUserMessage: ({ text }: any) => append({ message: { role: 'user', content: text } }),
            syncAgentState: async () => { agent.messages = rows.slice(); },
            appendToolCallEvent: noop, appendAssistantEvent: noop, recordContextUsage: noop,
            updateMessageContent: async ({ idx, content }: any) => { rows[idx].content = content; } },
        agent: { statusLineForTurn: async () => '', autoCompactIfNeeded: async () => ({ status: 'not_needed' }),
            stashResult: async ({ output }: any) => ({ content: output }) },
        llm: { stream: async () => ({ toolCalls: [{ id: 'a', name: 'one' }, { id: 'b', name: 'two' }] }) },
        tools: { call: async () => { calls++; return { output: 'ok' }; } },
    } };
    return { agent, ctx, rows, calls: () => calls, stop: (abort = true) => { stopped = true; if (abort) agent.abortController.abort(); }, execute: () => run(ctx, null, { agent, userText: 'go' }) };
}

test('abort during first tool prevents the second tool and result persistence', async () => {
    const h = harness();
    let calls = 0;
    h.ctx.fns.tools.call = async () => { calls++; h.stop(); return { output: 'late' }; };
    await expect(h.execute()).rejects.toBeDefined();
    expect(calls).toBe(1);
    expect(h.rows.filter(r => r.role === 'tool').every(r => r.content.includes('interrupted'))).toBe(true);
});

test('durable stop without local abort is observed after an awaited tool', async () => {
    const h = harness();
    let calls = 0;
    h.ctx.fns.tools.call = async () => { calls++; h.stop(false); return { output: 'late' }; };
    await expect(h.execute()).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toBe(1);
});

test('stop during result storage prevents event and next tool dispatch', async () => {
    const h = harness();
    let events = 0;
    h.ctx.fns.agent.stashResult = async () => { h.stop(); return { content: 'late' }; };
    h.ctx.fns.session.appendToolCallEvent = async () => { events++; };
    await expect(h.execute()).rejects.toBeDefined();
    expect(h.calls()).toBe(1);
    expect(events).toBe(0);
});

test('late stream cleanup preserves replacement stream and controllers', async () => {
    const h = harness();
    const replacement = new AbortController();
    const sampling = new AbortController();
    const fragment = { text: 'new stream' };
    h.ctx.fns.llm.stream = async () => {
        h.agent.abortController = replacement;
        h.agent.samplingAbortController = sampling;
        h.agent.scratchpad.mobileStream = fragment;
        h.agent.scratchpad.streamHandoff = 'replacement';
        throw new Error('old stream failed');
    };
    await expect(h.execute()).rejects.toThrow('old stream failed');
    expect(h.agent.abortController).toBe(replacement);
    expect(h.agent.samplingAbortController).toBe(sampling);
    expect(h.agent.scratchpad.mobileStream).toBe(fragment);
    expect(h.agent.scratchpad.streamHandoff).toBe('replacement');
});

test('stop during user append prevents later startup work', async () => {
    const h = harness();
    let synced = 0;
    h.ctx.fns.session.appendUserMessage = async () => { h.stop(); };
    h.ctx.fns.session.syncAgentState = async () => { synced++; };
    await expect(h.execute()).rejects.toBeDefined();
    expect(synced).toBe(0);
});

test('stop after placeholders sync prevents even the first tool dispatch', async () => {
    const h = harness();
    h.ctx.fns.session.syncAgentState = async () => {
        h.agent.messages = h.rows.slice();
        if (h.rows.filter(r => r.role === 'tool').length === 2) h.stop();
    };
    await expect(h.execute()).rejects.toBeDefined();
    expect(h.calls()).toBe(0);
});

test('worker run rejects a replaced durable token before input writes', async () => {
    const h = harness();
    h.agent.currentJobId = 'original';
    h.ctx.fns.procs.db.select = async () => [{ stopped_at: null, run_state: 'running', run_token: 'replacement' }];
    await expect(h.execute()).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.rows).toHaveLength(0);
    expect(h.agent.abortController).toBeNull();
});
