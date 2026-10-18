import { expect, test } from 'bun:test';
import archive from './archive';
import unarchive from './unarchive';
import archiveRoute from '../agent/$route_$id_archive_POST';
import restoreRoute from '../agent/$route_$id_unarchive_POST';
import mobileRoute from '../api/$route_mobile_v1_agents_$id_archive_POST';
import archiveCompleted from '../agent/archiveCompleted';

function fixture() {
    const rows = new Map<string, any>([
        ['parent', { id: 'parent', archived_at: null, run_state: 'idle', next_run_at: null, parent_id: null }],
        ['child', { id: 'child', archived_at: null, run_state: 'idle', next_run_at: null, parent_id: 'parent', scratchpad: { delegation: { status: 'ready' } } }],
    ]);
    const live = { activeRunCount: 0, abortController: new AbortController(), workspaceDir: '/fixture', scratchpad: { plan: [1], result: 2 } };
    const calls: string[] = [];
    const counts = { messages: 8, events: 3, plans: 1, results: 1 };
    let fail = false, race = false;
    const ctx: any = { state: { agent: { parent: live } }, fns: { procs: { db: {
        select: async ({ sql, params }: any) => sql.includes('SELECT id, parent_id') ? [rows.get('child')] : (rows.has(params[0]) ? [{ ...rows.get(params[0]) }] : []),
        run: async ({ sql, params }: any) => {
            calls.push('db');
            expect(ctx.state.agent.parent).toBe(live);
            if (fail) throw new Error('fixture database failure');
            const restoring = sql.includes('SET archived_at = NULL');
            const row = rows.get(params[restoring ? 0 : 1]);
            if (race) row.run_state = 'running';
            expect(sql).toContain("run_state = 'idle'");
            expect(sql).toContain('next_run_at IS NULL');
            expect(sql).toContain('wake_at IS NULL');
            if (!row || row.run_state !== 'idle' || row.next_run_at != null) return { changes: 0 };
            row.archived_at = restoring ? null : params[0];
            return { changes: 1 };
        },
    } }, events: { emitAgentsChanged: async () => { calls.push('event'); }, refreshAgentMeta: () => {} }, session: {} } };
    ctx.fns.session.archive = (opts: any) => archive(ctx, null, opts);
    ctx.fns.session.unarchive = (opts: any) => unarchive(ctx, null, opts);
    return { ctx, rows, live, calls, counts, fail: () => { fail = true; }, race: () => { race = true; } };
}

test('archive/restore preserves live state, fixture counts, parent-child boundaries and is idempotent', async () => {
    const f = fixture();
    const before = JSON.stringify(f.counts);
    expect(await archive(f.ctx, null, { id: 'parent' })).toEqual({ ok: true });
    const timestamp = f.rows.get('parent').archived_at;
    expect(f.rows.get('child').archived_at).toBeNull();
    expect(f.ctx.state.agent.parent).toBe(f.live);
    expect(await archive(f.ctx, null, { id: 'parent' })).toEqual({ ok: true });
    expect(f.rows.get('parent').archived_at).toBe(timestamp);
    expect(f.calls).toEqual(['db', 'event']);
    expect(await unarchive(f.ctx, null, { id: 'parent' })).toEqual({ ok: true });
    expect(await unarchive(f.ctx, null, { id: 'parent' })).toEqual({ ok: true });
    expect(f.calls).toEqual(['db', 'event', 'db', 'event']);
    expect(JSON.stringify(f.counts)).toBe(before);
    expect(f.live.workspaceDir).toBe('/fixture');
    expect(f.live.scratchpad).toEqual({ plan: [1], result: 2 });
});

for (const operation of [archive, unarchive]) {
    for (const reason of ['worker', 'direct', 'queued', 'wake']) test(`${operation.name || 'lifecycle'} rejects ${reason} without mutations`, async () => {
        const f = fixture();
        if (operation === unarchive) f.rows.get('parent').archived_at = 123;
        if (reason === 'worker') f.rows.get('parent').run_state = 'running';
        if (reason === 'direct') f.live.activeRunCount = 1;
        if (reason === 'wake') f.rows.get('parent').wake_at = Date.now() - 1;
        if (reason === 'queued') f.rows.get('parent').next_run_at = 1;
        await expect(operation(f.ctx, null, { id: 'parent' })).rejects.toThrow(reason === 'queued' || reason === 'wake' ? /queued/ : /running/);
        expect(f.calls).toEqual([]);
        expect(f.ctx.state.agent.parent).toBe(f.live);
    });
    test('missing ids are honest', async () => {
        const f = fixture();
        expect(await operation(f.ctx, null, { id: 'missing' })).toEqual({ ok: false });
        expect(f.calls).toEqual([]);
    });
}

test('atomic worker race rejects archive without emitting success', async () => {
    const f = fixture(); f.race();
    await expect(archive(f.ctx, null, { id: 'parent' })).rejects.toThrow(/state changed/);
    expect(f.rows.get('parent').archived_at).toBeNull();
    expect(f.calls).toEqual(['db']);
});

for (const route of [archiveRoute, restoreRoute, mobileRoute]) test('HTTP failures preserve cache and report busy/missing/database failures', async () => {
    const f = fixture();
    if (route === restoreRoute) f.rows.get('parent').archived_at = 123;
    const req = new Request('http://fixture/agent/parent/archive', { method: 'POST', headers: { accept: 'application/json' } });
    expect((await route(f.ctx, null, { req, params: { id: 'missing' } })).status).toBe(404);
    f.live.activeRunCount = 1;
    expect((await route(f.ctx, null, { req, params: { id: 'parent' } })).status).toBe(409);
    f.live.activeRunCount = 0; f.fail();
    expect((await route(f.ctx, null, { req, params: { id: 'parent' } })).status).toBe(500);
    expect(f.ctx.state.agent.parent).toBe(f.live);
    expect(f.calls).toEqual(['db']);
});

test('retention skips busy children and does not claim false success', async () => {
    const f = fixture();
    f.ctx.state.agent.child = { activeRunCount: 1 };
    expect(await archiveCompleted(f.ctx, null, { olderThanMs: 0 })).toEqual({ archived: [] });
    f.ctx.state.agent.child.activeRunCount = 0;
    f.rows.get('child').next_run_at = 1;
    expect(await archiveCompleted(f.ctx, null, { olderThanMs: 0 })).toEqual({ archived: [] });
    f.rows.get('child').next_run_at = null;
    expect(await archiveCompleted(f.ctx, null, { olderThanMs: 0 })).toEqual({ archived: ['child'] });
    expect(f.rows.get('parent').archived_at).toBeNull();
});
