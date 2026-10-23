import { expect, test } from 'bun:test';
import deliver from './deliverTriggerPrompt';
import process from './processTrigger';
import poll from './pollTriggers';

function fixture(stopped: number | null = null) {
    const target = { id: 'owner', stopped_at: stopped, archived_at: null };
    const trigger = { id: 'tr', agent_id: 'owner', kind: 'watch', mode: 'once', config: {}, prompt: 'ready', next_at: 1, last_ready: false };
    const state = { claimed: true, released: false, messages: 0, predicates: 0, finalized: 0, scheduled: 0, transaction: false, queries: [] as string[] };
    const ctx: any = { state: { agent: {} }, fns: {
        procs: { db: {
            transaction: async ({ fn }: any) => { state.transaction = true; try { return await fn(); } finally { state.transaction = false; } },
            select: async ({ sql }: any) => {
                state.queries.push(sql);
                if (sql.includes('WITH due')) return [];
                if (sql.includes('FROM agents')) return [target];
                if (sql.includes('SELECT id FROM agent_triggers')) return state.claimed ? [{ id: 'tr' }] : [];
                return [trigger];
            },
            run: async ({ sql }: any) => {
                if (sql.includes("status='active',claim_token=NULL")) { state.released = true; state.claimed = false; }
                if (sql.includes('SET status=?')) state.finalized++;
                if (sql.includes('UPDATE agents')) state.scheduled++;
                return { changes: 1 };
            },
        } },
        resultStore: { prepare: async () => ({ truncated: false }) },
        session: {
            appendMessage: async () => { expect(state.transaction).toBe(true); state.messages++; return { idx: 1 }; },
            appendEvent: async () => { expect(state.transaction).toBe(true); },
        },
        events: { refreshAgentMeta() {} },
        agent: { wakeWorker() {}, watchPredicate: async () => { state.predicates++; return { ready: true }; } },
    } };
    ctx.fns.agent.deliverTriggerPrompt = (opts: any) => deliver(ctx, null, opts);
    return { ctx, target, trigger, state };
}
const opts = { triggerId: 'tr', claimToken: 'claim', prompt: 'ready', now: 2 };

test('stopped delivery preserves claim schedule without transcript or scheduling', async () => {
    const f = fixture(1);
    expect(await deliver(f.ctx, null, opts)).toBe(false);
    expect(f.state).toMatchObject({ released: true, messages: 0, scheduled: 0 });
    expect(f.trigger).toMatchObject({ next_at: 1, last_ready: false });
});
test('delivery serializes recipient and claim checks before inserts', async () => {
    const f = fixture();
    expect(await deliver(f.ctx, null, opts)).toBe(true);
    expect(f.state.queries[1]).toContain('FROM agents WHERE id=? FOR UPDATE');
    expect(f.state.queries[2]).toContain('claim_token=? FOR UPDATE');
    expect(f.state).toMatchObject({ messages: 1, scheduled: 1 });
});
test('cancelled claim cannot append a prompt', async () => {
    const f = fixture(); f.state.claimed = false;
    expect(await deliver(f.ctx, null, opts)).toBe(false);
    expect(f.state.messages).toBe(0);
});
test('preclaimed stopped watch does not evaluate predicate', async () => {
    const f = fixture(1);
    expect(await process(f.ctx, null, opts)).toEqual({ outcome: 'paused' });
    expect(f.state).toMatchObject({ released: true, predicates: 0, finalized: 0, messages: 0 });
});
test('Stop during predicate releases once watch pending without prompt', async () => {
    const f = fixture();
    f.ctx.fns.agent.watchPredicate = async () => { f.target.stopped_at = 1; return { ready: true }; };
    await process(f.ctx, null, opts);
    expect(f.state).toMatchObject({ released: true, finalized: 0, messages: 0, scheduled: 0 });
    expect(f.trigger.next_at).toBe(1);
});
test('Stop during false predicate preserves readiness and next evaluation', async () => {
    const f = fixture();
    f.ctx.fns.agent.watchPredicate = async () => { f.target.stopped_at = 1; return { ready: false }; };
    expect(await process(f.ctx, null, opts)).toEqual({ outcome: 'paused' });
    expect(f.state).toMatchObject({ released: true, finalized: 0 });
});
test('poll excludes stopped and archived recipients without consuming schedules', async () => {
    const f = fixture(); await poll(f.ctx, null, { now: 2 });
    expect(f.state.queries[0]).toContain('a.stopped_at IS NULL');
    expect(f.state.queries[0]).toContain('a.archived_at IS NULL');
});
