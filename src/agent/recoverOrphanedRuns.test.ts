import { describe, test, expect } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

async function seedRunning(ctx: any, id: string, owner: string | null, extra: { retries?: number; stopped?: boolean } = {}) {
    const ts = Date.now();
    await ctx.fns.procs.db.run({
        sql: `INSERT INTO agents (id, model, system_prompt, scratchpad, created_at, updated_at, run_state, run_token, run_owner,
                run_started_at, run_heartbeat_at, stale_recovery_count, stopped_at)
              VALUES (?, 'mock:test', '', '{}', ?, ?, 'running', ?, ?, ?, ?, ?, ?)`,
        params: [id, ts, ts, 'tok-' + id, owner, ts, ts, extra.retries ?? 0, extra.stopped ? ts : null],
    });
}

const row = async (ctx: any, id: string) => (await ctx.fns.procs.db.select({
    sql: 'SELECT run_state, run_token, run_owner, next_run_at, last_error, stale_recovery_count FROM agents WHERE id = ?', params: [id],
}) as any[])[0];

describe('agent.recoverOrphanedRuns', () => {
    test('recovers runs of another instance and leaves own and legacy runs alone', async () => {
        const ctx: any = await mkTestCtx();
        const before = Date.now();
        await seedRunning(ctx, 'dead', 'old-instance');
        await seedRunning(ctx, 'mine', 'me');
        await seedRunning(ctx, 'legacy', null);

        const out = await ctx.fns.agent.recoverOrphanedRuns({ owner: 'me' });
        expect(out).toEqual([{ id: 'dead', previousOwner: 'old-instance', retryScheduled: true }]);

        const dead = await row(ctx, 'dead');
        expect(dead.run_state).toBe('idle');
        expect(dead.run_token).toBeNull();
        expect(dead.run_owner).toBeNull();
        expect(dead.stale_recovery_count).toBe(1);
        expect(dead.last_error).toContain('orphaned run recovered');
        // First retry after 5 s, not after the 10-minute lease.
        expect(Number(dead.next_run_at)).toBeGreaterThanOrEqual(before + 5_000);
        expect(Number(dead.next_run_at)).toBeLessThan(Date.now() + 6_000);

        for (const id of ['mine', 'legacy']) {
            const r = await row(ctx, id);
            expect(r.run_state).toBe('running');
            expect(r.run_token).toBe('tok-' + id);
        }
        expect((await row(ctx, 'mine')).run_owner).toBe('me');
    });

    test('retry limit and stopped agents get no automatic retry', async () => {
        const ctx: any = await mkTestCtx();
        await seedRunning(ctx, 'tired', 'old', { retries: 3 });
        await seedRunning(ctx, 'stopped', 'old', { stopped: true });
        const out = await ctx.fns.agent.recoverOrphanedRuns({ owner: 'me' });
        expect(out.map((r: any) => [r.id, r.retryScheduled]).sort()).toEqual([['stopped', false], ['tired', false]]);
        const tired = await row(ctx, 'tired');
        expect(tired.run_state).toBe('idle');
        expect(tired.next_run_at).toBeNull();
        expect(tired.last_error).toContain('automatic retry limit reached');
        expect((await row(ctx, 'stopped')).next_run_at).toBeNull();
    });

    test('clearing the run token always clears the owner', async () => {
        const ctx: any = await mkTestCtx();
        await seedRunning(ctx, 'x', 'someone');
        await ctx.fns.procs.db.run({ sql: "UPDATE agents SET run_state = 'idle', run_token = NULL WHERE id = 'x'" });
        expect((await row(ctx, 'x')).run_owner).toBeNull();
    });

    test('instance id is stable within a process context', async () => {
        const ctx: any = await mkTestCtx();
        const a = ctx.fns.agent.instanceId({});
        expect(a).toMatch(/^[0-9a-f-]{36}$/);
        expect(ctx.fns.agent.instanceId({})).toBe(a);
    });
});
