import { expect, test } from 'bun:test';
import route from './$route_v1_agents_$id_events_GET';

test('transcript message identities survive projection; UI notices stay unlinked', async () => {
    const events = [
        { idx: 0, ts: 1, type: 'user', text: 'input', messageIdx: 0 },
        { idx: 1, ts: 2, type: 'assistant', text: 'checking', messageIdx: 1 },
        { idx: 2, ts: 3, type: 'tool_call', name: 'read', messageIdx: 1 },
        { idx: 3, ts: 4, type: 'user', text: 'UI notice' },
    ];
    const ctx: any = { state: { agent: {} }, fns: {
        procs: { db: { select: async ({ sql }: { sql: string }) => sql.includes('FROM agent_runs') ? [{ id: 'r1', start_idx: '1', end_idx: '3', started_at: '100', ended_at: '900', status: 'completed', answer_idx: '1', has_interleaved_input: true }] : sql.includes('SELECT 1') ? [{}] : [{ run_state: 'idle', next_run_at: null }] } },
        session: { getMaxEventIdx: async () => 3, getEvents: async () => events },
    } };
    const response = await route(ctx, null, { req: new Request('http://localhost/api/v1/agents/fixture/events'), params: { id: 'fixture' } });
    const body = await response.json();
    expect(body.events.map((event: { messageIdx: number | null }) => event.messageIdx)).toEqual([0, 1, 1, null]);
    expect(body.runs).toEqual([{ id: 'r1', startIdx: 1, endIdx: 3, startedAt: 100, endedAt: 900, status: 'completed', answerIdx: 1, hasInterleavedInput: true }]);
});

test('projects peer provenance with stable authors without turning peers and service notices into human input', async () => {
    const incoming = { from: 'peer', title: 'Peer', body: 'Status update', hop: 1 };
    const outgoing = { to: 'peer', title: 'Peer', body: 'Please inspect', status: 'sent', messageIdx: 9 };
    const events = [
        { idx: 0, ts: 1, type: 'user', text: 'Human input', messageIdx: 0 },
        { idx: 1, ts: 2, type: 'user', text: 'Peer envelope', messageIdx: 1, actor: 'agent:peer', agentMessage: incoming },
        { idx: 2, ts: 3, type: 'agent_message_outgoing', outgoingAgentMessage: outgoing },
        { idx: 3, ts: 4, type: 'user', text: 'Service update', messageIdx: 3 },
    ];
    const ctx: any = { state: { agent: {} }, fns: {
        procs: { db: { select: async ({ sql }: { sql: string }) => sql.includes('FROM agent_runs') ? [] : sql.includes('FROM messages') ? [{ idx: 0 }] : sql.includes('SELECT 1') ? [{}] : [{ run_state: 'idle', next_run_at: null }] } },
        auth: { author: async ({ userId }: { userId: string }) => ({ kind: 'agent', agentId: userId.slice(6), label: 'Peer', hue: 211 }) },
        session: { getMaxEventIdx: async () => 3, getEvents: async () => events },
    } };
    const response = await route(ctx, null, { req: new Request('http://localhost/events'), params: { id: 'fixture' } });
    const body = await response.json();
    expect(body.events.map((event: { navigationEligible: boolean }) => event.navigationEligible)).toEqual([true, false, false, false]);
    expect(body.events[1].agentMessage).toEqual(incoming);
    expect(body.events[2].outgoingAgentMessage.body).toBe('Please inspect');
    expect(body.events[2].peerAuthor).toEqual(body.events[1].author);
    expect(body.events[1].author.hue).toBe(211);
});

