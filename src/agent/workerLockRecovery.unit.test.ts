import { test, expect } from 'bun:test';
import worker from './workerLoop';

// Outside test mode the worker takes the single-worker advisory lock on a reserved connection.
// Orphan recovery must run once on acquisition, before the first claim, not on every recheck.
test('orphaned runs are recovered once when the worker lock is acquired, before any claim', async () => {
    const order: string[] = [];
    let passes = 0;
    const noop = async () => {};
    const ctx: any = { state: { agent: {} }, fns: {} };
    const reserved = {
        unsafe: async (sql: string) => sql.includes('pg_try_advisory_lock') ? [{ ok: true }] : [{}],
        release: () => {},
    };
    ctx.fns = {
        input: { expireDue: async () => 0 },
        procs: {
            env: { mode: () => 'prod' },
            log: { warn: () => {}, info: () => {} },
            db: {
                conn: async () => ({ reserve: async () => reserved }),
                run: async () => ({ changes: 1, rows: [] }),
                select: async ({ sql }: any) => {
                    if (sql.includes("run_state       = 'running'")) { order.push('claim'); return []; }
                    if (sql.startsWith('SELECT LEAST')) {
                        if (++passes >= 2) ctx.state.workerLoopRunning = false;
                        ctx.state.workerWakePending = true;
                        return [{ next: Date.now() }];
                    }
                    return [];
                },
            },
        },
        settings: { getNumber: async () => 0 },
        webPush: { recallStaleError: noop },
        agent: {
            instanceId: () => 'me',
            recoverOrphanedRuns: async ({ owner }: any) => { order.push('recover:' + owner); return []; },
            recoverOrphanedCompactions: noop, deliverWakes: noop, pollWatches: noop, pollTriggers: noop,
            wakeWorker: () => { ctx.state.workerWakePending = true; }, run: noop,
        },
        session: { syncAgentState: noop },
    };
    await worker(ctx, null, {});
    expect(passes).toBe(2);
    expect(order[0]).toBe('recover:me');
    expect(order.filter(x => x.startsWith('recover')).length).toBe(1);
    expect(order).toContain('claim');
});
