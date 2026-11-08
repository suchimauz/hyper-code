import { expect, test } from 'bun:test';
import route from './$route_v1_agents_$id_events_GET';

test('projects measured tool durations and explicit timeouts without inventing an eval deadline', async () => {
    const events = [
        { idx: 0, ts: 1, type: 'tool_call', name: 'tools_eval', args: { code: '1' }, durationMs: 52.84 },
        { idx: 1, ts: 2, type: 'tool_call', name: 'bash', args: { command: 'sleep 10', timeout: 5 }, durationMs: 5001, isError: true },
        { idx: 2, ts: 3, type: 'tool_call', name: 'eval', args: { code: '1' } },
        { idx: 3, ts: 4, type: 'tool_result', name: 'eval', durationMs: 0 },
    ];
    const ctx: any = { state: {}, fns: {
        auth: { author: async () => null }, mentions: { parse: async () => [] },
        procs: { db: { select: async ({ sql }: { sql: string }) => sql.includes('SELECT 1') ? [{}] : [{ run_state: 'running' }] } },
        session: { getMaxEventIdx: async () => 3, getEvents: async () => events },
        tools: { runs: () => [
            { id: 'eval', name: 'tools_eval', subject: 'await task()', startedAt: 1000, timeoutMs: null, aborted: false, tail: '' },
            { id: 'bash', name: 'bash', subject: 'sleep 10', startedAt: 1000, timeoutMs: 5000, aborted: true, tail: '' },
        ] },
    } };
    const response = await route(ctx, null, { req: new Request('http://local/api/v1/agents/fixture/events'), params: { id: 'fixture' } });
    const body = await response.json();
    expect(body.events.map(({ durationMs, timeoutMs }: any) => ({ durationMs, timeoutMs }))).toEqual([
        { durationMs: 52.84, timeoutMs: null }, { durationMs: 5001, timeoutMs: 5000 },
        { durationMs: null, timeoutMs: null }, { durationMs: 0, timeoutMs: null },
    ]);
    expect(body.activeTools).toMatchObject([
        { id: 'eval', startedAt: 1000, timeoutMs: null, state: 'running' },
        { id: 'bash', startedAt: 1000, timeoutMs: 5000, state: 'stopping' },
    ]);
});
