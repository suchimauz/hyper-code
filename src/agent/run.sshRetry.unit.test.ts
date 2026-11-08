import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as timers from 'node:timers/promises';
import run from './run';
import streamAnthropic from '../llm/streamAnthropic';
import streamCodex from '../llm/streamCodex';
import parseSSE from '../llm/parseSSE';
import classifyError from '../llm/classifyError';
import retrySchedule from './retrySchedule';
import retryWait from './retryWait';
import retryDecision from '../llm/retryDecision';

// Offline owned-run harness: no network, DB, live agents or real retry delays.
const interrupted = () => Object.assign(new Error('SSH inference interrupted; provider acceptance is uncertain. Resume manually.'), {
    transportFailure: { kind: 'ssh_transport', phase: 'ambiguous', retryable: false },
});
const done = { text: 'done', usage: null, finishReason: 'stop', toolCalls: [] };
const tool = { text: '', usage: null, finishReason: 'tool_calls', toolCalls: [{ id: 'saved-tool', name: 'write', args: { path: 'test' } }] };
function harness(turns: any[]) {
    const rows: any[] = [{ idx: 0, role: 'user', content: 'go' }];
    const errors: string[] = [];
    const snapshots: any[][] = [];
    const delays: number[] = [];
    const agent: any = { id: 'ssh-retry-test', model: 'ssh:test', currentJobId: 'owned', messages: rows.slice(), scratchpad: {}, events: [] };
    let sampled = 0, calls = 0, attempt = 0;
    let pending: any = null;
    const events: any[] = [];
    let now = 1_000_000;
    spyOn(Date, 'now').mockImplementation(() => now);
    let stopped: number | null = null;
    let token = 'owned';
    let duringWait: () => void | Promise<void> = () => {};
    spyOn(timers, 'setTimeout').mockImplementation((async (ms: number, _value: unknown, opts: { signal: AbortSignal }) => {
        delays.push(ms);
        await duringWait();
        now += ms;
        opts.signal.throwIfAborted();
    }) as typeof timers.setTimeout);
    const append = async ({ message }: any) => { const row = { ...message, idx: rows.length }; rows.push(row); return row; };
    const noop = async () => {};
    const ctx: any = { state: { agent: { [agent.id]: agent } }, fns: {
        input: { isWaiting: async () => false },
        settings: { get: async () => ({ jitterRatio: 0 }) },
        planning: { read: async ({agentId}: any) => ({version:1,agentId,mode:'execute',revision:0,scope:'session',advisory:true,runningPolicy:'reject',pending:null,proposal:null}) },
        goal: { delegationScope: async ({ fn }: any) => fn(), runBindingCapture: async () => ({ kind: 'disabled', allowContinuation: false }) },
        session: {
            forAgent: () => null, appendMessage: append,
            appendEvent: async ({ event }: any) => { events.push(event); },
            syncAgentState: async () => { agent.messages = rows.slice(); },
            recordContextUsage: noop, appendAssistantEvent: async () => ({idx: 0}), appendToolCallEvent: noop,
            appendErrorEvent: async ({ error }: any) => { errors.push(error); },
            updateMessageContent: async ({ idx, content }: any) => { rows[idx].content = content; },
        },
        procs: { events: { emit: noop }, db: {
            transaction: async ({ fn }: any) => fn(),
            run: async ({ sql, params }: any) => {
                if (sql.includes('llm_retry_attempt = 0')) { attempt = 0; pending = null; }
                else if (sql.includes('llm_retry_attempt = ?')) { attempt = params[0]; pending = JSON.parse(params[1]); }
                else if (sql.includes('llm_retry_pending = NULL')) pending = null;
                else throw new Error(`Unexpected write: ${sql}`);
            }, select: async ({ sql }: any) => sql.includes('MAX(idx)')
            ? [{ i: Math.max(...rows.filter(r => r.role === 'user' && !r.excluded_from_cursor).map(r => r.idx)) }]
            : [{ stopped_at: stopped, run_state: 'running', run_token: token, llm_retry_attempt: attempt, llm_retry_pending: pending }] } },
        agent: {
            promoteQueuedTurn: noop,
            retrySchedule: (opts: any) => retrySchedule(ctx, null, opts),
            retryWait: (opts: any) => retryWait(ctx, null, opts),
            recordRunLifecycle: async () => {}, statusLineForTurn: async () => '', autoCompactIfNeeded: async () => ({ status: 'not_needed' }),
            stashResult: async ({ output }: any) => ({ content: output }) },
        events: { emitAgentsChanged: noop, refreshAgentMeta: noop },
        markdown: { render: async ({ source }: any) => source },
        llm: {
            resolveEndpoint: async () => ({ provider: 'test' }),
            classifyError: (opts: any) => classifyError(ctx, null, opts),
            retryDecision: (opts: any) => retryDecision(ctx, null, opts),
            stream: async (opts: any) => {
            snapshots.push(structuredClone(agent.messages));
            if (sampled >= turns.length) throw new Error('unexpected extra model request');
            const turn = turns[sampled++];
            if (turn instanceof Error) throw turn;
            return typeof turn === 'function' ? await turn(opts) : turn;
        } },
        tools: { call: async () => { calls++; return { output: 'saved result' }; }, runs: () => [] },
    } };
    return { ctx, agent, rows, errors, snapshots, delays, events,
        get attempt() { return attempt; }, get pending() { return pending; },
        get sampled() { return sampled; }, get calls() { return calls; },
        wait: (fn: typeof duringWait) => { duringWait = fn; },
        stop: (abort: boolean) => { stopped = 1; if (abort) agent.abortController.abort(); },
        replace: () => { token = 'replacement'; },
        execute: () => run(ctx, null, { agent, userText: '', userMessageAlreadyAppended: true }),
    };
}
afterEach(() => mock.restore());

function useRealStream(h: ReturnType<typeof harness>, protocol: 'anthropic' | 'codex', bodies: string[]) {
    const raw = protocol === 'anthropic' ? streamAnthropic : streamCodex;
    let fetches = 0;
    Object.assign(h.ctx.fns.agent, { buildLlmRequest: async () => ({ system: 'test', messages: [] }), wireTools: () => [], cacheRoot: async () => h.agent.id });
    Object.assign(h.ctx.fns.llm, {
        resolveEndpoint: async () => ({ url: 'https://unused.invalid', modelId: 'test', provider: protocol, apiKey: 'fake', kind: 'subscription',
            ssh: { instance: 'unused', provider: protocol === 'codex' ? 'codex' : 'claude-code', account: 'test' } }),
        resolveReasoningEffort: async () => ({ applied: 'high', mode: 'anthropic-adaptive' }),
        toAnthropicMessages: () => [], toCodexInput: () => ({ input: [] }),
        parseSSE: (opts: any) => parseSSE(h.ctx, null, opts),
        classifyError: (opts: any) => classifyError(h.ctx, null, opts),
        accountAuthHealth: async () => [], codexCliVersion: async () => 'test',
    });
    h.ctx.fns.sshAccount = { fetch: async () => new Response(bodies[fetches++]) };
    return { sample: (opts: any) => raw(h.ctx, null, opts), fetches: () => fetches };
}

for (const protocol of ['anthropic', 'codex'] as const) {
    test(`${protocol}: actual truncated SSE tool response is discarded, then fresh sample succeeds`, async () => {
        let wire: ReturnType<typeof useRealStream>;
        const h = harness([(opts: any) => wire.sample(opts), (opts: any) => wire.sample(opts)]);
        const partial = protocol === 'anthropic'
            ? 'event: content_block_start\ndata: {"index":0,"content_block":{"type":"tool_use","id":"partial-tool","name":"write"}}\n\nevent: content_block_delta\ndata: {"index":0,"delta":{"type":"input_json_delta","partial_json":"{}"}}\n\n'
            : 'data: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"partial-tool","name":"write","arguments":"{}"}}\n\n';
        const complete = protocol === 'anthropic'
            ? 'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"done"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'
            : 'data: {"type":"response.output_text.delta","delta":"done"}\n\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n';
        wire = useRealStream(h, protocol, [partial, complete]);
        expect((await h.execute()).text).toBe('done');
        expect(wire.fetches()).toBe(2);
        expect(h.calls).toBe(0);
        expect(h.rows.some(r => r.tool_calls?.length || r.role === 'tool')).toBe(false);
        expect(h.delays).toEqual([1000]);
    });
    test(`${protocol}: actual SSE quota failure is never retried as interrupted inference`, async () => {
        let wire: ReturnType<typeof useRealStream>;
        const h = harness([(opts: any) => wire.sample(opts), done]);
        const body = protocol === 'anthropic'
            ? 'event: error\ndata: {"type":"error","error":{"type":"usage_limit_reached"}}\n\n'
            : 'data: {"type":"response.failed","response":{"error":{"code":"usage_limit_reached"}}}\n\n';
        wire = useRealStream(h, protocol, [body]);
        await expect(h.execute()).rejects.toMatchObject({ failure: { kind: 'usage_limit', retryable: false } });
        expect(wire.fetches()).toBe(1);
        expect(h.sampled).toBe(1);
        expect(h.delays).toEqual([]);
    });
}

describe('bounded SSH inference retry at the agent sampling boundary', () => {
    test('retries after the common initial delay, drops partial prose and returns the complete reply', async () => {
        const h = harness([(opts: any) => { opts.onEvent({ type: 'text_delta', delta: 'partial secret draft' }); throw interrupted(); }, done]);
        expect((await h.execute()).text).toBe('done');
        expect(h.sampled).toBe(2);
        expect(h.delays).toEqual([1000]);
        expect(h.errors).toEqual([]);
        expect(h.events.filter(e => e.type === 'llm_retry')).toHaveLength(1);
        expect(h.attempt).toBe(0);
        expect(h.pending).toBeNull();
        expect(h.rows.filter(r => r.role === 'assistant').map(r => r.content)).toEqual(['done']);
        expect(h.calls).toBe(0);
    });
    test('normal policy exhausts exactly five retries', async () => {
        const last = interrupted();
        const h = harness([...Array.from({ length: 5 }, interrupted), last, done]);
        await expect(h.execute()).rejects.toBe(last);
        expect(h.sampled).toBe(6);
        expect(h.delays).toEqual([1000, 2000, 4000, 8000, 16000]);
        expect(h.errors).toEqual([]);
        expect(h.calls).toBe(0);
    });
    test('completed mutating tool and its saved result are not replayed', async () => {
        const h = harness([tool, interrupted(), done]);
        await h.execute();
        expect(h.calls).toBe(1);
        expect(h.sampled).toBe(3);
        expect(h.snapshots[2].filter(r => r.role === 'tool')).toMatchObject([{ tool_call_id: 'saved-tool', content: 'saved result' }]);
        expect(h.rows.filter(r => r.role === 'tool')).toHaveLength(1);
    });
    test('successful tool cycles reset the durable retry attempt', async () => {
        const h = harness([interrupted(), tool, interrupted(), done]);
        expect((await h.execute()).text).toBe('done');
        expect(h.calls).toBe(1);
        expect(h.sampled).toBe(4);
        expect(h.delays).toEqual([1000, 1000]);
        expect(h.events.filter(e => e.type === 'llm_retry').map(e => e.retry)).toEqual([1, 1]);
        expect(h.attempt).toBe(0);
    });
    for (const [label, error] of [
        ['unclassified text', new Error(interrupted().message)],
        ['permanent access', Object.assign(new Error('denied'), { transportFailure: { kind: 'ssh_transport', phase: 'permanent', retryable: false } })],
        ['quota', Object.assign(new Error('quota'), { failure: { kind: 'usage_limit', code: 'QUOTA', retryable: false } })],
        ['auth', Object.assign(new Error('auth'), { failure: { kind: 'auth', code: 'AUTH', retryable: false } })],
    ] as const) test(`does not treat ${label} as retryable inference loss`, async () => {
        const h = harness([error, done]);
        await expect(h.execute()).rejects.toBe(error);
        expect(h.sampled).toBe(1);
        expect(h.delays).toEqual([]);
    });
    for (const abort of [true, false]) test(`Stop during backoff prevents the retry (local abort=${abort})`, async () => {
        const h = harness([interrupted(), done]);
        h.wait(() => h.stop(abort));
        await expect(h.execute()).rejects.toMatchObject({ name: 'AbortError' });
        expect(h.sampled).toBe(1);
    });
    test('a replaced durable run token prevents the retry', async () => {
        const h = harness([interrupted(), done]);
        h.wait(() => h.replace());
        await expect(h.execute()).rejects.toMatchObject({ name: 'AbortError' });
        expect(h.sampled).toBe(1);
    });
    test('replacement controller during backoff is not cleared or reused', async () => {
        const h = harness([interrupted(), done]);
        const replacement = new AbortController();
        h.wait(() => { h.agent.abortController = replacement; });
        await expect(h.execute()).rejects.toMatchObject({ name: 'AbortError' });
        expect(h.sampled).toBe(1);
        expect(h.agent.abortController).toBe(replacement);
    });
    for (const error of [
        Object.assign(new Error('before dispatch'), { transportFailure: { kind: 'ssh_transport', phase: 'before_dispatch', retryable: true } }),
        ...['RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'EMPTY_RESPONSE'].map(code => Object.assign(new Error(code), {
            failure: { kind: 'transient', code, retryable: true, provider: 'test', message: code },
        })),
    ]) test(`common policy retries ${error.message}`, async () => {
        const h = harness([error, done]);
        expect((await h.execute()).text).toBe('done');
        expect(h.sampled).toBe(2);
        expect(h.delays).toEqual([1000]);
        expect(h.errors).toEqual([]);
        expect(h.attempt).toBe(0);
    });
});
