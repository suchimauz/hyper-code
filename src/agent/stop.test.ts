import { describe, test, expect } from 'bun:test';
import stop from './stop';

function fixture({ plan = false, loadedPlan = plan } = {}) {
    const ac = new AbortController(), sampling = new AbortController();
    const calls: string[] = [];
    const scratchpad: any = plan ? { plan: { tasks: [{ id: 'x', status: 'active', activeSince: Date.now() - 1000, elapsedMs: 50 }] } } : {};
    const agent: any = { id: 'a1', abortController: ac, samplingAbortController: sampling, currentJobId: 'old', isStreaming: true, scratchpad: loadedPlan ? structuredClone(scratchpad) : {} };
    const row: any = { scratchpad: JSON.stringify(scratchpad), next_run_at: 123, run_state: 'running', run_token: 'old', stopped_at: null };
    let active = false;
    let locked = false;
    const retryEvents: any[] = [];
    let beforeCommit: (() => void) | undefined;
    const ctx: any = { fns: {
        goal: { runStopPrepare: async () => ({ kind: 'absent' }), runStopApply: async () => {}, lifecyclePause: async () => ({ paused: false, reason: 'disabled' }) },
        procs: { db: {
            transaction: async ({ fn }: any) => { active = true; locked = false; try { const out = await fn(); beforeCommit?.(); return out; } finally { active = false; } },
            select: async ({ sql }: any) => { expect(active).toBe(true); expect(sql).toContain('FOR UPDATE'); expect(sql).toContain('llm_retry_pending'); locked = true; return [row]; },
            run: async ({ sql, params }: any) => {
                calls.push(sql); expect(ac.signal.aborted).toBe(true); expect(sampling.signal.aborted).toBe(true);
                if (sql.startsWith('SET LOCAL')) return { changes: 0 };
                expect(sql).toContain('llm_retry_pending = NULL'); expect(sql).toContain('llm_retry_attempt = 0');
                row.llm_retry_pending = null; row.llm_retry_attempt = 0;
                row.stopped_at = params[0]; row.scratchpad = params[1]; row.run_state = 'idle'; row.run_token = null;
                if (sql.includes('next_run_at = NULL')) row.next_run_at = null;
                return { changes: 1 };
            },
        } },
        tools: { runs: ({ agentId }: any) => { expect(agentId).toBe('a1'); return [{ id: 'tool-1' }]; }, abortRun: ({ id }: any) => { expect(ac.signal.aborted).toBe(true); calls.push('abort:' + id); } },
        session: { appendEvent: async ({ id, event }: any) => { expect(active).toBe(true); expect(locked).toBe(true); expect(id).toBe(agent.id); expect(row.llm_retry_pending).not.toBeNull(); retryEvents.push(event); }, appendErrorEvent: ({ error }: any) => { calls.push(error); }, syncAgentState: async () => {} },
        events: { refreshAgentMeta: () => {} },
    } };
    return { ctx, agent, row, ac, sampling, calls, retryEvents, replace: (fn: () => void) => { beforeCommit = fn; } };
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
    for (const clearQueue of [true, false]) test(`Stop cancels pending retry under lock and resets attempts (clearQueue=${clearQueue})`, async () => {
        const f = fixture();
        f.row.llm_retry_pending = { retryId: 'retry-1', retry: 3, mode: 'auto', until: Date.now() + 1000 };
        f.row.llm_retry_attempt = 3;
        await stop(f.ctx, null, { agent: f.agent, clearQueue });
        expect(f.retryEvents).toEqual([{ type: 'llm_retry_cancelled', retryId: 'retry-1', retry: 3 }]);
        expect(f.row.llm_retry_pending).toBeNull(); expect(f.row.llm_retry_attempt).toBe(0);
        await stop(f.ctx, null, { agent: f.agent, clearQueue });
        expect(f.retryEvents).toHaveLength(1);
    });
    test('Stop resets attempts without emitting cancellation when no retry is pending', async () => {
        const f = fixture(); f.row.llm_retry_attempt = 2;
        await stop(f.ctx, null, { agent: f.agent });
        expect(f.row.llm_retry_attempt).toBe(0); expect(f.retryEvents).toEqual([]);
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
