import { expect, test } from 'bun:test';
import route from './$route_v1_agents_$id_events_GET';

test('compact lifecycle remains chronological and carries revision and summary, not a user message', async () => {
  const events = [
    { idx: 1, ts: 1, type: 'compaction_start', revision: 2 },
    { idx: 2, ts: 2, type: 'compaction_completed', revision: 2, summary: 'Handoff', tokensBefore: 3000, tokensAfter: 500, keptMessages: 4 },
    { idx: 3, ts: 3, type: 'compaction_failed', revision: 3, error: 'Provider unavailable' },
  ];
  const ctx: any = { state: { agent: {} }, fns: {
    procs: { db: { select: async ({ sql }: { sql: string }) => sql.includes('SELECT 1') ? [{}] : [{ run_state: 'idle', next_run_at: null }] } },
    session: { getMaxEventIdx: async () => 3, getEvents: async () => events },
  } };
  const response = await route(ctx, null, { req: new Request('http://localhost/api/v1/agents/fixture/events'), params: { id: 'fixture' } });
  const body = await response.json();
  expect(body.events.map((event: any) => event.type)).toEqual(events.map(event => event.type));
  expect(body.events[1]).toMatchObject({ revision: 2, summary: 'Handoff', tokensBefore: 3000, tokensAfter: 500, keptMessages: 4, messageIdx: null });
  expect(body.events[2].text).toBe('Provider unavailable');
  expect(body.isRunning).toBe(false);
});
