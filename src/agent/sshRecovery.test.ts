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
        events: { emitAgentsChanged: () => {} },
        webPush: { recordFailure: async () => {}, recallStaleError: async () => {} },
        goal: { delegationConsume: async () => ({ status: 'unbound' }), continuationValidateStart: async () => ({ action: 'run', suppressIdxs: [], continuationIdxs: [] }), enabled: async () => false },
        procs: { log: { warn: () => {} }, db: {
            select: async ({ sql }: any) => sql.includes('MAX(idx)') ? [{ max_idx: 3 }] : sql.startsWith('SELECT run_token, run_state, stopped_at') ? [{ run_token: 'token', run_state: 'running', stopped_at: null }] : options.terminal === false || options.scheduled ? [] : [{ id: 'child' }],
            run: async (query: any) => { updates.push(query); return { changes: options.fenced ? 0 : 1, rows: [{ next_run_at: options.scheduled ? 123 : query.params[5] }] }; },
        } },
    } };
    return { ctx, child, notices, updates, events, run: () => runOne(ctx, 'child', 'token') };
}
function ssh(phase: string, retryable: boolean, extra = {}) {
    return Object.assign(new Error('network connection closed 503 timed out'), { transportFailure: { kind: 'ssh_transport', phase, retryable }, ...extra });
}

// Model-request retries live in agent.run (see run.sshRetry.unit.test.ts); the
// worker finalizes once and notifies the parent of a terminal SSH failure.
describe('SSH worker recovery (isolated)', () => {
    for (const [phase, retryable] of [['before_dispatch', true], ['ambiguous', true], ['permanent', false]] as const) {
        test(`${phase} failure is never rescheduled and notifies the parent once`, async () => {
            const h = harness(ssh(phase, retryable, { failure: { kind: 'usage_limit', retryable: true } }));
            await h.run();
            expect(h.updates[0].sql).toContain('WHERE id = ? AND run_token = ?');
            expect(h.updates[0].params[0]).toBe(0); // cursor checkpoint preserved
            expect(h.updates[0].params[5]).toBeNull();
            expect(h.notices).toHaveLength(1);
            expect(h.notices[0].delivery.key).toBe('ssh-failure:child:token');
            expect(h.notices[0].delivery.event.event).toBe('failed');
            await h.run(); // durable inbound key deduplicates repeat delivery
            expect(h.notices).toHaveLength(1);
        });
    }
    for (const options of [{ stopped: true }, { fenced: true }, { scheduled: true }, { terminal: false }]) {
        test(`no parent notice on stop, revocation or newer work: ${JSON.stringify(options)}`, async () => {
            const h = harness(ssh('ambiguous', false), options); await h.run();
            expect(h.notices).toHaveLength(0);
        });
    }
    test('successful run advances consumed frontier; never failure notice', async () => {
        const h = harness(null); await h.run();
        expect(h.updates[0].params.slice(0, 2)).toEqual([1, 7]);
        expect(h.notices).toHaveLength(0);
    });
});
