import { describe, expect, test } from 'bun:test';

// Exercise the actual runOne implementation without loading runtime functions,
// opening a database connection, starting workers, or contacting SSH.
const workerSource = await Bun.file(new URL('./workerLoop.ts', import.meta.url)).text();
const runOne = new Function(new Bun.Transpiler({ loader: 'ts' }).transformSync(
    workerSource.slice(0, workerSource.indexOf('// ONE worker per database.')) + '\nreturn runOne;'
))();

function harness(error: any, options: { retries?: number; fenced?: boolean; stopped?: boolean; scheduled?: boolean; terminal?: boolean } = {}) {
    const notices: any[] = [], updates: any[] = [], events: any[] = [];
    const child: any = { id: 'child', parentId: 'parent', scratchpad: {}, abortController: new AbortController() };
    const ctx: any = { state: { agent: { child }, agentRunRetries: { child: options.retries ?? 0 } }, fns: {
        agent: { run: async () => { if (options.stopped) child.abortController.abort('stopped_by_user'); if (error) throw error; return { consumedUserIdx: 7 }; }, wakeWorker: () => {}, autoCompactIfNeeded: async () => {}, parkOnUsageLimit: async () => { throw Error('SSH must not park on quota'); } },
        session: { appendErrorEvent: async (event: any) => { events.push(event); }, syncAgentState: async () => {}, deliverInbound: async (notice: any) => { if (!notices.some(n => n.delivery.key === notice.delivery.key)) notices.push(notice); } },
        webPush: { recordFailure: async () => {} },
        procs: { log: { warn: () => {} }, db: {
            select: async ({ sql }: any) => sql.includes('MAX(idx)') ? [{ max_idx: 3 }] : options.terminal === false || options.scheduled ? [] : [{ id: 'child' }],
            run: async (query: any) => { updates.push(query); return { changes: options.fenced ? 0 : 1, rows: [{ next_run_at: options.scheduled ? 123 : query.params[5] }] }; },
        } },
    } };
    return { ctx, child, notices, updates, events, run: () => runOne(ctx, 'child', 'token') };
}
function ssh(phase: string, retryable: boolean, extra = {}) {
    return Object.assign(new Error('network connection closed 503 timed out'), { transportFailure: { kind: 'ssh_transport', phase, retryable }, ...extra });
}

describe('SSH worker recovery (isolated)', () => {
    test('before-dispatch allows exactly one 10s retry in token-fenced finalization', async () => {
        const h = harness(ssh('before_dispatch', true));
        const before = Date.now(); await h.run();
        expect(h.updates).toHaveLength(1);
        expect(h.updates[0].sql).toContain('WHERE id = ? AND run_token = ?');
        expect(h.updates[0].sql).toContain('COALESCE(next_run_at, ?)');
        expect(h.updates[0].params[5]).toBeGreaterThanOrEqual(before + 10_000);
        expect(h.updates[0].params[0]).toBe(0); // cursor checkpoint preserved
        expect(h.ctx.state.agentRunRetries.child).toBe(1);
        expect(h.notices).toHaveLength(0);
        expect(h.events.some(e => e.error.includes('one safe retry'))).toBe(true);
        await h.run();
        expect(h.updates[1].params[5]).toBeNull();
        expect(h.notices).toHaveLength(1);
        expect(h.notices[0].delivery.key).toBe('ssh-failure:child:token');
        await h.run(); // durable inbound key deduplicates repeat delivery
        expect(h.notices).toHaveLength(1);
    });
    for (const phase of ['ambiguous', 'permanent']) {
        test(`${phase} overrides HTTP retryable and transient error text`, async () => {
            const h = harness(ssh(phase, true, { failure: { kind: 'usage_limit', retryable: true } }));
            await h.run();
            expect(h.updates[0].params[5]).toBeNull();
            expect(h.notices).toHaveLength(1);
            expect(h.notices[0].delivery.event.event).toBe('failed');
        });
    }
    test('explicit nonretryable before-dispatch does not retry', async () => {
        const h = harness(ssh('before_dispatch', false)); await h.run();
        expect(h.updates[0].params[5]).toBeNull();
    });
    for (const options of [{ stopped: true }, { fenced: true }, { scheduled: true }, { terminal: false }]) {
        test(`no parent notice on stop, revocation or newer work: ${JSON.stringify(options)}`, async () => {
            const h = harness(ssh('ambiguous', false), options); await h.run();
            expect(h.notices).toHaveLength(0);
        });
    }
    test('revoked token cannot consume retry budget', async () => {
        const h = harness(ssh('before_dispatch', true), { fenced: true }); await h.run();
        expect(h.ctx.state.agentRunRetries.child).toBe(0);
    });
    test('successful run advances consumed frontier and clears budget; never failure notice', async () => {
        const h = harness(null, { retries: 1 }); await h.run();
        expect(h.updates[0].params.slice(0, 2)).toEqual([1, 7]);
        expect(h.ctx.state.agentRunRetries.child).toBeUndefined();
        expect(h.notices).toHaveLength(0);
    });
    test('nonSSH regex retry remains bounded without parent SSH notice', async () => {
        const h = harness(new Error('network timed out')); await h.run();
        expect(h.updates[0].params[5]).toBeNumber();
        await h.run(); expect(h.updates[1].params[5]).toBeNull();
        expect(h.notices).toHaveLength(0);
    });
});

test('run clears partial mobileStream on thrown streaming error and preserves the error metadata', async () => {
    const source = await Bun.file(new URL('./run.ts', import.meta.url)).text();
    const start = source.indexOf('        const mobileStream =');
    const end = source.indexOf('        const { text, usage, finishReason', start);
    const isolatedStream = new Function('ctx', 'agent', 'ac', new Bun.Transpiler({ loader: 'ts' }).transformSync('return (async () => { while (true) {\n' + source.slice(start, end) + '\nbreak; } })();'));
    const agent = { id: 'fixture', scratchpad: {}, samplingAbortController: null };
    const error = ssh('ambiguous', false);
    let caught: any;
    try { await isolatedStream({ fns: { procs: { events: { emit: () => {} } }, llm: { stream: async () => { throw error; } } } }, agent, new AbortController()); }
    catch (e) { caught = e; }
    expect(caught).toBe(error);
    expect(agent.scratchpad.mobileStream).toBeUndefined();
});
