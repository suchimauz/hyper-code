import { test, expect } from 'bun:test';
import save from './save';
import start from '../agent/start';

function fixture() {
    const caller = { id: 'caller', createdBy: 'stale-owner' };
    const session: any = { kind: 'agent', agent: caller, agentId: caller.id };
    const queries: string[] = [];
    const writes: any[] = [];
    const ctx: any = { state: { agent: { caller } }, fns: {
        procs: { db: {
            select: async ({ params }: any) => { queries.push(params[0]); return [{ created_by: params[0] === 'parent' ? 'parent-owner' : 'durable-owner' }]; },
            run: async (o: any) => { writes.push(o); },
        } },
        auth: { actorId: async () => null },
        agent: { nextId: async () => 'new-agent' },
        session: {}, events: { emitAgentsChanged: () => {} },
    } };
    ctx.fns.session.save = (opts: any) => save(ctx, session, opts);
    return { ctx, session, queries, writes };
}

test('independent agent.start inherits bound worker durable owner on first save', async () => {
    const f = fixture();
    const created = await start(f.ctx, f.session, { model: 'test:model' });
    expect(created.parentId).toBeNull();
    expect(created.createdBy).toBe('durable-owner');
    expect(f.queries).toEqual(['caller']);
    expect(f.writes[0].params[29]).toBe('durable-owner');
});

test('parent and authenticated actor retain precedence', async () => {
    const f = fixture();
    f.ctx.fns.auth.actorId = async () => 'browser-owner';
    const parent = await start(f.ctx, f.session, { model: 'test:model', parentId: 'parent' });
    expect(parent.createdBy).toBe('parent-owner');
    const independent = await start(f.ctx, f.session, { model: 'test:model' });
    expect(independent.createdBy).toBe('browser-owner');
    expect(f.queries).toEqual(['parent']);
});

test('unbound, request-bearing, mismatched and non-worker sessions cannot inherit', async () => {
    for (const mutate of [
        (s: any) => { s.kind = 'http'; },
        (s: any) => { s.req = new Request('http://localhost'); },
        (s: any) => { s.agentId = 'other'; },
        (s: any) => { s.agent = { id: 'caller' }; },
        (s: any) => { delete s.agent; },
    ]) {
        const f = fixture(); mutate(f.session);
        const created = await start(f.ctx, f.session, { model: 'test:model' });
        expect(created.createdBy).toBeNull(); expect(f.queries).toEqual([]);
    }
});

test('missing durable creator stays null; no global owner fallback', async () => {
    const f = fixture(); f.ctx.fns.procs.db.select = async () => [];
    expect((await start(f.ctx, f.session, { model: 'test:model' })).createdBy).toBeNull();
});

test('subsequent saves do not reassign an existing or explicitly absent owner', async () => {
    for (const owner of ['existing-owner', null]) {
        const f = fixture();
        const target: any = { id: 'existing', createdBy: owner };
        await save(f.ctx, f.session, { agent: target });
        expect(target.createdBy).toBe(owner); expect(f.queries).toEqual([]);
        expect(f.writes[0].sql.split('ON CONFLICT')[1]).not.toContain('created_by =');
    }
});
