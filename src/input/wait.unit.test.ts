import { describe, expect, test } from 'bun:test';
import isWaiting from './isWaiting';
import request from './request';
import get from './get';

// Isolated boundary tests: no full application boot or migration side effects.
function fixture() {
    const rows: any[] = [];
    const ctx: any = { state: { input: { kinds: {
        choice: { prepare: async ({}, { spec }: any) => spec },
        secret: {}, confirm: {}, grid: {},
    } } }, fns: { procs: { db: {
        // This fixture exercises gate semantics; transaction rollback/locking is covered by DB integration tests.
        transaction: async ({ fn }: { fn: () => Promise<unknown> }) => fn(),
        run: async ({ params }: any) => { rows.push({ id: params[0], agent_id: params[1], kind: params[2], state: 'open', spec: JSON.parse(params[5]), created_at: params[6] }); },
        select: async ({ sql, params }: any) => {
            if (sql.includes('SELECT EXISTS')) return [{ waiting: rows.some(r => r.agent_id === params[0] && r.spec._agentWait === true && (['open', 'processing'].includes(r.state) || (params[1] != null && r.created_at >= params[1]))) }];
            if (sql.includes('SELECT *')) return rows.filter(r => r.id === params[0]);
            return [{ i: -1 }];
        },
    } }, agent: { renderEventHtml: async () => '', current: async () => ({ id: 'a' }) }, session: { appendEvent: async () => {} }, webPush: { notifyInput: async () => {} } } };
    return { ctx, rows, waiting: (since?: number) => isWaiting(ctx, null, { agentId: 'a', since }) };
}
describe('durable ordinary input wait', () => {
    test('explicit choice wait blocks, state survives live-agent eviction, processing also blocks', async () => {
        const { ctx, rows, waiting } = fixture();
        await request(ctx, null, { kind: 'choice', title: 'Question', waitForAnswer: true, spec: { options: ['a','b'] } });
        expect(await waiting()).toBe(true);
        rows[0].state = 'processing';
        expect(await waiting()).toBe(true);
        rows[0].state = 'submitted';
        expect(await waiting()).toBe(false);
    });
    test('early answer ends current turn but permits next turn', async () => {
        const { ctx, rows, waiting } = fixture();
        const since = Date.now();
        await request(ctx, null, { kind: 'choice', title: 'Question', waitForAnswer: true });
        rows[0].state = 'submitted';
        expect(await waiting(since)).toBe(true);
        expect(await waiting()).toBe(false);
    });
    test('all outstanding gates must resolve; cancellation releases only its own gate', async () => {
        const { ctx, rows, waiting } = fixture();
        await request(ctx, null, { kind: 'choice', title: 'First', waitForAnswer: true });
        await request(ctx, null, { kind: 'choice', title: 'Second', waitForAnswer: true });
        rows[0].state = 'cancelled';
        expect(await waiting()).toBe(true);
        rows[1].state = 'submitted';
        expect(await waiting()).toBe(false);
    });
    test('caller cannot forge marker; opt-out and special kinds remain nonblocking; marker is not projected', async () => {
        const { ctx, rows, waiting } = fixture();
        await request(ctx, null, { kind: 'secret', title: 'Secret', spec: { _agentWait: true } });
        await request(ctx, null, { kind: 'choice', title: 'Notice', waitForAnswer: false, spec: { _agentWait: true } });
        expect(await waiting()).toBe(false);
        const input = await request(ctx, null, { kind: 'confirm', title: 'Confirm', waitForAnswer: true });
        expect(await waiting()).toBe(true);
        expect((await get(ctx, null, { id: input.id }))?.spec._agentWait).toBeUndefined();
        expect(rows[2].spec._agentWait).toBe(true);
    });
});

test('waiting is explicit for every kind; deadlines validated and cannot be forged', async()=>{
 const {ctx,rows,waiting}=fixture();
 await request(ctx,null,{kind:'choice',title:'Nonblocking'});
 expect(await waiting()).toBe(false);
 await request(ctx,null,{kind:'secret',title:'Wait',waitForAnswer:true,expiresAt:Date.now()+60000,spec:{_expiresAt:1}});
 expect(await waiting()).toBe(true);
 expect(rows[1].spec._expiresAt).toBeGreaterThan(Date.now());
 await expect(request(ctx,null,{kind:'secret',title:'Bad',expiresAt:Date.now()-1})).rejects.toThrow('future');
 await expect(request(ctx,null,{kind:'secret',title:'Bad',expiresAt:Infinity})).rejects.toThrow('future');
});

describe('trusted kind deadline', () => {
    test('runs after prepare, uses authoritative deadline without explicit expiry, and preserves explicit waits', async () => {
        const { ctx, rows, waiting } = fixture();
        const deadline = Date.now() + 60_000;
        ctx.state.input.kinds.choice.prepare = async (_ctx: unknown, { spec }: any) => {
            expect(spec._expiresAt).toBeUndefined();
            return { ...spec, prepared: true, _expiresAt: deadline + 60_000 };
        };
        ctx.state.input.kinds.choice.deadline = async (_ctx: unknown, { spec }: any) => {
            expect(spec.prepared).toBe(true);
            expect(spec._expiresAt).toBeUndefined();
            return deadline;
        };
        await request(ctx, null, { kind: 'choice', title: 'Protected', spec: { _expiresAt: 1 } });
        expect(rows[0].spec._expiresAt).toBe(deadline);
        expect(await waiting()).toBe(false);
        await request(ctx, null, { kind: 'choice', title: 'Protected wait', waitForAnswer: true });
        expect(await waiting()).toBe(true);
    });
    test('explicit expiry can shorten but never extend trusted expiry', async () => {
        const { ctx, rows } = fixture();
        const deadline = Date.now() + 60_000;
        ctx.state.input.kinds.confirm.deadline = () => deadline;
        for (const expiresAt of [deadline - 10_000, deadline, deadline + 10_000]) {
            await request(ctx, null, { kind: 'confirm', title: 'Protected', expiresAt });
            expect(rows.at(-1).spec._expiresAt).toBe(Math.min(deadline, expiresAt));
        }
    });
    test('undefined imposes no constraint and spec mutation cannot forge framework fields', async () => {
        const { ctx, rows } = fixture();
        ctx.state.input.kinds.grid.deadline = (_ctx: unknown, { spec }: any) => {
            spec._expiresAt = 1;
            spec._agentWait = true;
            spec._choiceBatchId = 'forged';
            return undefined;
        };
        await request(ctx, null, { kind: 'grid', title: 'No constraint' });
        expect(rows[0].spec).toEqual({});
        const expiresAt = Date.now() + 60_000;
        await request(ctx, null, { kind: 'grid', title: 'Explicit', expiresAt });
        expect(rows[1].spec._expiresAt).toBe(expiresAt);
    });
    test('rejects invalid or elapsed hook values before inserting an input', async () => {
        const { ctx, rows } = fixture();
        for (const deadline of [NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, Date.now() - 1, 0, Date.now() + 60_000.5, null, '9999999999999']) {
            ctx.state.input.kinds.confirm.deadline = async () => deadline;
            await expect(request(ctx, null, { kind: 'confirm', title: 'Invalid' })).rejects.toThrow('kind deadline must be a future');
        }
        expect(rows).toHaveLength(0);
    });
    test('propagates authoritative lookup failures without creating an input', async () => {
        const { ctx, rows } = fixture();
        ctx.state.input.kinds.confirm.deadline = async () => { throw new Error('draft unavailable'); };
        await expect(request(ctx, null, { kind: 'confirm', title: 'Missing' })).rejects.toThrow('draft unavailable');
        expect(rows).toHaveLength(0);
    });
});
