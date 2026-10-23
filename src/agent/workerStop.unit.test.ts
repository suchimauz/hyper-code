import { test, expect } from 'bun:test';
import worker from './workerLoop';

async function fixture(mode: 'paused' | 'revoked') {
    const sqls: string[] = [];
    let runs = 0, claimed = false, token = '';
    const ctx: any = { state: { agent: { a: { id: 'a' } } }, fns: {} };
    const noop = async () => {};
    ctx.fns = {
        procs: { env: { mode: () => 'test' }, log: { warn: () => {} }, db: {
            run: async () => ({ changes: 1, rows: [] }),
            select: async ({ sql, params }: any) => {
                sqls.push(sql);
                if (sql.startsWith('WITH stale')) return [];
                if (sql.includes('RETURNING id') && sql.includes("run_state       = 'running'")) {
                    expect(sql).toContain('AND stopped_at IS NULL');
                    if (mode === 'paused' || claimed) return [];
                    claimed = true; token = params[2]; return [{ id: 'a' }];
                }
                if (sql.startsWith('SELECT COALESCE(MAX')) return [{ max_idx: 2 }];
                if (sql.startsWith('SELECT run_token, run_state, stopped_at')) return [{ run_token: null, run_state: 'idle', stopped_at: 100 }];
                if (sql.startsWith('SELECT LEAST')) {
                    expect(sql).toContain('stopped_at IS NULL');
                    ctx.state.workerLoopRunning = false;
                    ctx.state.workerWakePending = true;
                    return [{ next: Date.now() }];
                }
                return [];
            },
        } },
        settings: { getNumber: async () => 0 },
        agent: { recoverOrphanedCompactions: noop, deliverWakes: noop, pollWatches: noop, pollTriggers: noop, wakeWorker: () => { ctx.state.workerWakePending = true; }, run: async () => { runs++; } },
        session: { syncAgentState: noop },
    };
    await worker(ctx, null, {});
    return { runs, sqls, token, agent: ctx.state.agent.a };
}

test('paused queued work is excluded from worker claims and wake deadlines', async () => {
    const f = await fixture('paused');
    expect(f.runs).toBe(0);
    expect(f.sqls.some(sql => sql.includes('AND stopped_at IS NULL'))).toBe(true);
});
test('Stop winning during agent/frontier loading prevents runOne from replacing controllers', async () => {
    const f = await fixture('revoked');
    expect(f.token).not.toBe('');
    expect(f.runs).toBe(0);
    expect(f.agent.currentJobId).toBeUndefined();
    expect(f.agent.isStreaming).toBeUndefined();
});
