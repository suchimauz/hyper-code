import { expect, test } from 'bun:test';
import accept from './acceptMessage';
import mobile from '../api/$route_mobile_v1_agents_$id_messages_POST';
import submit from '../input/submit';
import planRoute from './$route_$id_plan_POST';

function fixture() {
    const plan = { pausedAt: 123 as number | null, tasks: [{ id: 'fix', title: 'Fix', status: 'active', activeSince: null }] };
    const live = { id: 'a', scratchpad: { plan }, events: [] };
    const state = { tx: false, locked: false, resumed: false, appended: 0, queries: [] as string[], duplicate: false, claimed: true };
    const input = { id: 'i', agentId: 'a', kind: 'choice', title: 'Pick', state: 'submitted' };
    const ctx: any = { state: { agent: { a: live }, input: { kinds: { choice: { submit: async () => ({ summary: 'yes', result: { value: 'yes' } }) } } } }, fns: {
        procs: { db: {
            transaction: async ({ fn }: any) => { state.tx = true; try { return await fn(); } finally { state.tx = false; state.locked = false; } },
            select: async ({ sql }: any) => {
                state.queries.push(sql);
                if (sql.includes('FOR UPDATE')) { expect(state.tx).toBe(true); state.locked = true; }
                if (sql.includes('client_request_id') && state.duplicate) {
                    const fingerprint = new Bun.CryptoHasher('sha256').update(JSON.stringify({ text: 'hello', files: [] })).digest('hex');
                    return [{ idx: 0, payload: { submissionFingerprint: fingerprint } }];
                }
                return [];
            },
            run: async ({ sql }: any) => {
                state.queries.push(sql);
                if (sql.includes("state = 'processing'")) return { rows: state.claimed ? [{ id: 'i' }] : [], changes: 1 };
                if (sql.includes('UPDATE agents')) {
                    expect(state.tx).toBe(true); expect(state.locked).toBe(true);
                    if (sql.includes('stopped_at=NULL')) state.resumed = true;
                }
                if (sql.includes('INSERT INTO messages')) { expect(state.locked).toBe(true); state.appended++; }
                return { rows: [{ idx: 0 }], changes: 1 };
            },
        }, events: { refresh() {} } },
        auth: { actorId: async () => 'person' },
        settings: { getNumber: async () => 0 },
        attachments: { saveUploads: async () => [], commitUploads: async () => {} },
        tools: { runs: () => [] },
        input: { get: async () => input },
        session: {
            load: async () => live,
            scrubUnicode: async ({ text }: any) => text,
            mutateScratchpad: async ({ mutate }: any) => { expect(state.tx).toBe(true); expect(state.locked).toBe(true); mutate(live.scratchpad, 999); },
            updatePlan: async () => { expect(state.locked).toBe(true); return { plan }; },
            appendMessage: async () => { expect(state.tx).toBe(true); expect(state.locked).toBe(true); state.appended++; return { idx: 0 }; },
            appendEvent: async () => ({ idx: 0 }),
            syncAgentState: async () => {},
        },
        agent: { renderEventHtml: async () => '', wakeWorker() {}, wakeWaiters: async () => {} },
    } };
    return { ctx, state, plan };
}
const chatRequest = () => new Request('http://local/agent/a', { method: 'POST', body: 'hello', headers: { 'idempotency-key': 'key' } });
test('new chat turn resumes durable pause and plan inside scheduling transaction', async () => {
    const f = fixture();
    expect((await accept(f.ctx, null, { req: chatRequest(), params: { id: 'a' } })).status).toBe(200);
    expect(f.state.resumed).toBe(true); expect(f.plan.pausedAt).toBeNull(); expect(f.state.appended).toBe(1);
});
test('idempotent chat retry does not resume or schedule', async () => {
    const f = fixture(); f.state.duplicate = true;
    const response = await accept(f.ctx, null, { req: chatRequest(), params: { id: 'a' } });
    expect(await response.json()).toMatchObject({ duplicate: true });
    expect(f.state.resumed).toBe(false); expect(f.plan.pausedAt).toBe(123); expect(f.state.appended).toBe(0);
});
test('mobile human message appends, resumes and schedules under row lock', async () => {
    const f = fixture();
    await mobile(f.ctx, null, { req: new Request('http://local/mobile', { method: 'POST', body: JSON.stringify({ text: 'hello' }), headers: { 'content-type': 'application/json' } }), params: { id: 'a' } });
    expect(f.state.resumed).toBe(true); expect(f.plan.pausedAt).toBeNull(); expect(f.state.appended).toBe(1);
});
for (const cancel of [false, true]) test(`human input ${cancel ? 'cancellation' : 'answer'} resumes under row lock`, async () => {
    const f = fixture(); await submit(f.ctx, null, { id: 'i', actor: 'person', cancel });
    expect(f.state.resumed).toBe(true); expect(f.plan.pausedAt).toBeNull(); expect(f.state.appended).toBe(1);
});
test('replayed input submission cannot resume', async () => {
    const f = fixture(); f.state.claimed = false;
    await submit(f.ctx, null, { id: 'i', actor: 'person' });
    expect(f.state.resumed).toBe(false); expect(f.state.appended).toBe(0);
});
test('agent withdrawal does not resume durable or plan pause', async () => {
    const f = fixture(); await submit(f.ctx, null, { id: 'i', actor: 'agent:a', cancel: true });
    expect(f.state.resumed).toBe(false); expect(f.plan.pausedAt).toBe(123);
    expect(f.state.queries.some(sql => sql.includes('AND stopped_at IS NULL'))).toBe(true);
});
test('explicit UI plan edit resumes pause and queues active task under same lock', async () => {
    const f = fixture(); const form = new FormData();
    for (const [key, value] of Object.entries({ action: 'update', title: 'Plan', task_id: 'fix', task_title: 'Fix', task_instructions: 'Do it' })) form.set(key, value);
    const response = await planRoute(f.ctx, null, { req: new Request('http://local/plan', { method: 'POST', body: form }), params: { id: 'a' } });
    expect(response.status).toBe(204); expect(f.state.resumed).toBe(true); expect(f.plan.pausedAt).toBeNull(); expect(f.state.appended).toBe(1);
});
