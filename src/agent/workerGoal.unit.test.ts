import { test, expect } from 'bun:test';
import worker from './workerLoop';

async function scenario(mode: string) {
    const order: string[] = [];
    let claimed = false, token = '', admitted = false, committed = false;
    const a: any = { id: 'a' };
    const ctx: any = { state: { agent: { a } }, fns: {} };
    const noop = async () => {};
    const finish = () => { ctx.state.workerLoopRunning = false; ctx.state.workerWakePending = true; };
    const binding = { goalId: 'captured-goal', revision: 7, allowContinuation: true };
    ctx.fns = {
        procs: { env: { mode: () => 'test' }, log: { warn: noop }, db: {
            select: async ({ sql, params }: any) => {
                if (sql.startsWith('WITH stale')) return [];
                if (sql.includes('RETURNING id') && sql.includes("run_state       = 'running'")) {
                    if (claimed) return []; claimed = true; token = params[2]; return [{ id: 'a' }];
                }
                if (sql.startsWith('SELECT COALESCE(MAX')) return [{ max_idx: 2 }];
                if (sql.startsWith('SELECT run_token, run_state, stopped_at')) return [{ run_token: token, run_state: 'running', stopped_at: null }];
                if (sql.startsWith('SELECT LEAST')) { finish(); return [{ next: Date.now() }]; }
                return [];
            },
            run: async ({ sql, params }: any) => {
                if (sql.includes('RETURNING next_run_at')) {
                    order.push('finalize');
                    expect(params[1]).toBe(2);
                    expect(sql).toContain("m.excluded_from_cursor = 0");
                    if (mode === 'sql-error') throw new Error('finalize failed');
                    if (mode === 'stale') return { changes: 0, rows: [] };
                    return { changes: 1, rows: [{ next_run_at: admitted ? 123 : null }] };
                }
                return { changes: 1, rows: [] };
            },
            transaction: async ({ fn }: any) => {
                order.push('begin');
                try { const result = await fn(); committed = admitted; order.push('commit'); return result; }
                catch (error) { admitted = false; order.push('rollback'); throw error; }
            },
        } },
        settings: { getNumber: async () => 0 },
        events: { emitAgentsChanged: noop },
        goal: { delegationConsume: async () => ({ status: 'absent' }),
            continuationValidateStart: async () => ({ action: "run", humanPending: true, suppressIdxs: [], continuationIdxs: [] }),
            enabled: async () => { order.push('gate'); return mode !== 'disabled'; },
            continuationAdmit: async (opts: any) => {
                order.push('admit');
                expect(opts).toEqual({ agentId: 'a', expectedGoalId: 'captured-goal', expectedRevision: 7, runToken: token, consumedIdx: 2 });
                if (mode === 'helper-error') throw new Error('admission failed');
                admitted = mode !== 'denied'; return { admitted, reason: admitted ? 'admitted' : 'pending_input' };
            },
        },
        session: { syncAgentState: noop, appendErrorEvent: noop },
        webPush: { notifyError: noop, recordFailure: noop },
        agent: {
            recoverOrphanedCompactions: noop, deliverWakes: noop, pollWatches: noop, pollTriggers: noop,
            autoCompactIfNeeded: noop, wakeWorker: () => { ctx.state.workerWakePending = true; },
            run: async () => {
                if (mode === 'run-error' || mode === 'retry') throw new Error(mode === 'retry' ? 'network failed' : 'failed');
                if (mode === 'abort') { a.abortController = new AbortController(); a.abortController.abort(); }
                if (mode === 'no-binding') return {};
                return { consumedUserIdx: 2, goalContinuation: mode === 'invalid' ? { ...binding, revision: 0 } : binding };
            },
        },
    };
    await worker(ctx, null, {});
    // runOne is launched concurrently; let its finite mock promise chain settle.
    for (let i = 0; i < 30; i++) await Promise.resolve();
    return { order, committed };
}
for (const mode of ['disabled', 'no-binding', 'invalid', 'abort', 'run-error', 'retry']) {
    test(`goal worker does not admit: ${mode}`, async () => {
        const result = await scenario(mode);
        expect(result.order).not.toContain('begin');
        expect(result.order).not.toContain('admit');
        expect(result.order).toContain('finalize');
    });
}
test('goal worker admits before finalize in one committed transaction', async () => {
    expect(await scenario('valid')).toEqual({ order: ['gate', 'begin', 'admit', 'finalize', 'commit'], committed: true });
});
test('stale token rolls back admission rather than committing it', async () => {
    expect(await scenario('stale')).toEqual({ order: ['gate', 'begin', 'admit', 'finalize', 'rollback'], committed: false });
});
for (const mode of ['sql-error', 'helper-error']) test(`goal worker rolls back ${mode}`, async () => {
    const result = await scenario(mode);
    expect(result.order.at(-1)).toBe('rollback');
    expect(result.committed).toBe(false);
});
test('helper denial preserves ordinary finalization without a continuation', async () => {
    expect(await scenario('denied')).toEqual({ order: ['gate', 'begin', 'admit', 'finalize', 'commit'], committed: false });
});
