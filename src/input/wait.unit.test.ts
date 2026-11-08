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
    test('choice defaults to blocking, state survives live-agent eviction, processing also blocks', async () => {
        const { ctx, rows, waiting } = fixture();
        await request(ctx, null, { kind: 'choice', title: 'Question', spec: { options: ['a','b'] } });
        expect(await waiting()).toBe(true);
        rows[0].state = 'processing';
        expect(await waiting()).toBe(true);
        rows[0].state = 'submitted';
        expect(await waiting()).toBe(false);
    });
    test('early answer ends current turn but permits next turn', async () => {
        const { ctx, rows, waiting } = fixture();
        const since = Date.now();
        await request(ctx, null, { kind: 'choice', title: 'Question' });
        rows[0].state = 'submitted';
        expect(await waiting(since)).toBe(true);
        expect(await waiting()).toBe(false);
    });
    test('all outstanding gates must resolve; cancellation releases only its own gate', async () => {
        const { ctx, rows, waiting } = fixture();
        await request(ctx, null, { kind: 'choice', title: 'First' });
        await request(ctx, null, { kind: 'choice', title: 'Second' });
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
