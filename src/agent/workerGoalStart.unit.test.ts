import { test, expect } from 'bun:test';
import worker from './workerLoop';

async function scenario(action: 'run'|'skip'|'defer'|'disabled', opts: { human?: boolean; newerHuman?: boolean; stale?: boolean; synthetic?: boolean } = {}) {
    let claimed = false, token = '', models = 0, wakes = 0, cursor = 0;
    const queries: string[] = [];
    const updates: any[] = [];
    let runOpts: any;
    const a: any = { id: 'a' };
    const ctx: any = { state: { agent: { a } }, fns: {} };
    const noop = async () => {};
    const finish = () => { ctx.state.workerLoopRunning = false; ctx.state.workerWakePending = true; };
    ctx.fns = {
        procs: { env: { mode: () => 'test' }, log: { warn: noop }, db: {
            select: async ({ sql, params }: any) => {
                queries.push(sql);
                if (sql.startsWith('WITH stale')) return [];
                if (sql.includes('RETURNING id') && sql.includes("run_state       = 'running'")) {
                    if (claimed) return []; claimed = true; token = params[2]; return [{ id: 'a' }];
                }
                if (sql.startsWith('SELECT COALESCE(MAX')) return [{ max_idx: 2 }];
                if (sql.startsWith('SELECT run_token, run_state, stopped_at')) return [{ run_token: token, run_state: 'running', stopped_at: null }];
                if (sql.startsWith('SELECT m.idx, m.message_type')) return [...(opts.synthetic === false ? [] : [{ idx: 2, message_type: 'goal_continuation' }]), ...(opts.human ? [{ idx: 1, message_type: null }] : [])];
                if (sql.startsWith('SELECT LEAST')) { finish(); return [{ next: Date.now() }]; }
                return [];
            },
            run: async ({ sql, params }: any) => {
                if (sql.includes('RETURNING next_run_at')) {
                    updates.push({ sql, params });
                    if (opts.stale) return { changes: 0, rows: [] };
                    if (params[0] === 1) cursor = 2;
                    return { changes: 1, rows: [{ next_run_at: opts.newerHuman ? 999 : null }] };
                }
                return { changes: 1, rows: [] };
            },
        } },
        settings: { getNumber: async () => 0 }, events: { emitAgentsChanged: noop },
        goal: { delegationConsume: async () => ({ status: 'absent' }),
            enabled: async () => false,
            continuationValidateStart: async (args: any) => {
                expect(args).toEqual({ agentId: 'a', runToken: token, frontierIdx: 2 });
                return { action, humanPending: !!opts.human, continuationIdxs: action === 'disabled' ? [] : [2], suppressIdxs: opts.human ? [2] : [] };
            },
        },
        session: { syncAgentState: noop, appendErrorEvent: noop }, webPush: { recordFailure: noop },
        agent: {
            recoverOrphanedCompactions: noop, deliverWakes: noop, pollWatches: noop, pollTriggers: noop, autoCompactIfNeeded: noop,
            wakeWorker: () => { wakes++; ctx.state.workerWakePending = true; },
            run: async (args: any) => { models++; runOpts = args; return {}; },
        },
    };
    await worker(ctx, null, {});
    for (let i = 0; i < 60; i++) await Promise.resolve();
    // workerPass always emits one completion wake independent of scheduling.
    return { models, wakes: wakes - 1, cursor, queries, updates, runOpts };
}

test('defer parks without model, cursor advance or synthetic wake spin', async () => {
    const r = await scenario('defer');
    expect(r.models).toBe(0); expect(r.cursor).toBe(0); expect(r.wakes).toBe(0); expect(r.updates).toHaveLength(1);
    expect(r.updates[0].params[0]).toBe(0);
});
test('defer preserves a newer human wake using atomic scheduling predicate', async () => {
    const r = await scenario('defer', { newerHuman: true });
    expect(r.cursor).toBe(0); expect(r.models).toBe(0); expect(r.wakes).toBe(1);
    expect(r.updates[0].sql).toContain('COALESCE(next_run_at, ?)');
    expect(r.updates[0].sql).toContain("m.message_type IS DISTINCT FROM 'goal_continuation'");
    expect(r.updates[0].sql).toContain('m.idx > ?');
    expect(r.updates[0].params[3]).toBe(2);
});
test('skip retires only all synthetic frontier under token and ordinary-row guard', async () => {
    const r = await scenario('skip');
    expect(r.models).toBe(0); expect(r.cursor).toBe(2);
    expect(r.updates[0].sql).toContain('CASE WHEN ? = 1 AND NOT EXISTS');
    expect(r.updates[0].sql).toContain("WHERE id = ? AND run_state = 'running' AND run_token = ?");
});
test('stale token cannot retire cursor or wake', async () => {
    const r = await scenario('skip', { stale: true, newerHuman: true });
    expect(r.models).toBe(0); expect(r.cursor).toBe(0); expect(r.wakes).toBe(0);
});
test('human pending runs ordinary chat with request-local omission', async () => {
    const r = await scenario('run', { human: true });
    expect(r.models).toBe(1); expect(r.runOpts.omitGoalContinuationIdxs).toEqual([2]);
});
test('disabled synthetic-only never reaches model and does not query goal tables', async () => {
    const r = await scenario('disabled');
    expect(r.models).toBe(0); expect(r.cursor).toBe(2); expect(r.wakes).toBe(0);
    expect(r.queries.join('\n')).not.toMatch(/(?:FROM|JOIN) (?:agent_goals|goal_)/);
});
test('disabled mixed input preserves ordinary chat and omits synthetic continuation', async () => {
    const r = await scenario('disabled', { human: true });
    expect(r.models).toBe(1); expect(r.runOpts.omitGoalContinuationIdxs).toEqual([2]);
    expect(r.queries.join('\n')).not.toMatch(/(?:FROM|JOIN) (?:agent_goals|goal_)/);
});

test('disabled ordinary-only chat proceeds with empty omission list', async () => {
    const r = await scenario('disabled', { human: true, synthetic: false });
    expect(r.models).toBe(1); expect(r.runOpts.omitGoalContinuationIdxs).toEqual([]);
});
test('skip preserves a newer human beyond frozen frontier', async () => {
    const r = await scenario('skip', { newerHuman: true });
    expect(r.models).toBe(0); expect(r.cursor).toBe(2); expect(r.wakes).toBe(1);
    expect(r.updates[0].params[3]).toBe(2);
});
