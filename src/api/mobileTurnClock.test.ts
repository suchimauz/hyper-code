import { expect, test } from 'bun:test';
import route from './$route_v1_agents_$id_events_GET';

test('turn start comes from durable claim, never from latest activity or a queued wake', async () => {
    for (const [run_state, run_started_at, next_run_at, expected] of [
        ['running', '1000', null, 1000],
        ['claimed', 1000, null, 1000],
        ['idle', 1000, 9000, null],
        ['idle', 1000, null, null],
        ['running', null, null, null],
        ['running', 'bad', null, null],
    ] as const) {
        const ctx: any = { state: { agent: { fixture: { scratchpad: { mobileStream: { startedAt: 8000, text: 'partial', thinkingStartedAt: 8500 } } } } }, fns: {
            procs: { db: { select: async ({ sql }: { sql: string }) => sql.includes('SELECT 1') ? [{}] : [{ run_state, run_started_at, next_run_at }] } },
            session: { getMaxEventIdx: async () => 0, getEvents: async () => [] },
        } };
        const response = await route(ctx, null, { req: new Request('http://localhost/api/v1/agents/fixture/events'), params: { id: 'fixture' } });
        expect((await response.json()).turnStartedAt).toBe(expected);
    }
});
