import { describe, test, expect } from 'bun:test';
import stop from './stop';

function fixture({ plan = false, loadedPlan = plan } = {}) {
    const ac = new AbortController(), sampling = new AbortController();
    const calls: string[] = [];
    const scratchpad: any = plan ? { plan: { tasks: [{ id: 'x', status: 'active', activeSince: Date.now() - 1000, elapsedMs: 50 }] } } : {};
    const agent: any = { id: 'a1', abortController: ac, samplingAbortController: sampling, currentJobId: 'old', isStreaming: true, scratchpad: loadedPlan ? structuredClone(scratchpad) : {} };
    const row: any = { scratchpad: JSON.stringify(scratchpad), next_run_at: 123, run_state: 'running', run_token: 'old', stopped_at: null };
    let committed = false;
    let beforeCommit: (() => void) | undefined;
    const ctx: any = { fns: {
        procs: { db: {
            transaction: async ({ fn }: any) => { const out = await fn(); committed = true; beforeCommit?.(); return out; },
            select: async ({ sql }: any) => { expect(sql).toContain('FOR UPDATE'); return [row]; },
            run: async ({ sql, params }: any) => {
                calls.push(sql); expect(ac.signal.aborted).toBe(true); expect(sampling.signal.aborted).toBe(true);
                row.stopped_at = params[0]; row.scratchpad = params[1]; row.run_state = 'idle'; row.run_token = null;
                if (sql.includes('next_run_at = NULL')) row.next_run_at = null;
                return { changes: 1 };
            },
        } },
        tools: { runs: ({ agentId }: any) => { expect(agentId).toBe('a1'); return [{ id: 'tool-1' }]; }, abortRun: ({ id }: any) => { expect(ac.signal.aborted).toBe(true); calls.push('abort:' + id); } },
        session: { appendErrorEvent: ({ error }: any) => { calls.push(error); }, syncAgentState: async () => {} },
        events: { refreshAgentMeta: () => {} },
    } };
    return { ctx, agent, row, ac, sampling, calls, replace: (fn: () => void) => { beforeCommit = fn; } };
}

describe('agent.stop durable pause', () => {
    test('default stop clears queue, revokes ownership and cancels registered tools without needing a plan', async () => {
        const f = fixture();
        expect(await stop(f.ctx, null, { agent: f.agent })).toEqual({ ok: true, clearQueue: true });
        expect(f.row.stopped_at).toBeGreaterThan(0);
        expect(f.row.next_run_at).toBeNull(); expect(f.row.run_token).toBeNull();
        expect(f.agent.currentJobId).toBeNull(); expect(f.agent.isStreaming).toBe(false);
        expect(f.calls).toContain('abort:tool-1');
    });
    test('explicit queue retention cannot remove the durable pause', async () => {
        const f = fixture(); await stop(f.ctx, null, { agent: f.agent, clearQueue: false });
        expect(f.row.next_run_at).toBe(123); expect(f.row.stopped_at).toBeGreaterThan(0);
    });
    test('pauses the durable plan even when live scratchpad is stale; repeated stop preserves its timer', async () => {
        const f = fixture({ plan: true, loadedPlan: false });
        await stop(f.ctx, null, { agent: f.agent });
        const plan = JSON.parse(f.row.scratchpad).plan;
        expect(plan.pausedAt).toBe(f.row.stopped_at); expect(plan.tasks[0].activeSince).toBeNull();
        expect(plan.tasks[0].elapsedMs).toBeGreaterThanOrEqual(1050);
        await stop(f.ctx, null, { agent: f.agent });
        expect(JSON.parse(f.row.scratchpad).plan).toEqual(plan);
    });
    test('old stop cleanup does not erase controllers attached by a replacement run', async () => {
        const f = fixture(), newer = new AbortController();
        f.replace(() => { f.agent.abortController = newer; f.agent.samplingAbortController = newer; f.agent.currentJobId = 'new'; });
        await stop(f.ctx, null, { agent: f.agent });
        expect(newer.signal.aborted).toBe(false); expect(f.agent.abortController).toBe(newer);
        expect(f.agent.samplingAbortController).toBe(newer); expect(f.agent.currentJobId).toBe('new');
    });
});
