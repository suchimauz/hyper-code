import { expect, test } from 'bun:test';
import deliver from './deliverTriggerPrompt';
import process from './processTrigger';
import poll from './pollTriggers';

function fixture(stopped: number | null = null) {
    const target = { id: 'owner', stopped_at: stopped, archived_at: null };
    const trigger = { id: 'tr', agent_id: 'owner', kind: 'watch', mode: 'once', config: {} as Record<string, string> | string, timezone: null as string | null, timeout_at: null as number | null, prompt: 'ready', next_at: 1, last_ready: false };
    const state = { claimed: true, released: false, messages: 0, predicates: 0, finalized: 0, scheduled: 0, transaction: false, queries: [] as string[], events: [] as Record<string, unknown>[] };
    const ctx: any = { state: { agent: {} }, fns: {
        procs: { db: {
            transaction: async ({ fn }: any) => { state.transaction = true; try { return await fn(); } finally { state.transaction = false; } },
            select: async ({ sql }: any) => {
                state.queries.push(sql);
                if (sql.includes('WITH due')) return [];
                if (sql.includes('FROM agents')) return [target];
                if (sql.includes('FROM agent_triggers') && sql.includes('FOR UPDATE')) return state.claimed ? [trigger] : [];
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
            appendEvent: async ({ event }: any) => { expect(state.transaction).toBe(true); state.events.push(event); },
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

test('watch delivery snapshots identity and actual delivered timeout prompt', async () => {
    const f = fixture();
    await deliver(f.ctx, null, { ...opts, prompt: 'watch timed out' });
    expect(f.state.events).toEqual([{ type: 'wake_up', reason: 'watch timed out', messageIdx: 1, triggerId: 'tr', triggerKind: 'watch', watchId: 'tr' }]);
});
for (const serialized of [false, true]) {
    test(`cron snapshots survive trigger changes (serialized=${serialized})`, async () => {
        const f = fixture();
        f.trigger.kind = 'cron';
        const config = { expression: '0 9 * * 1-5' };
        f.trigger.config = serialized ? JSON.stringify(config) : config;
        f.trigger.timezone = 'Europe/Lisbon';
        await deliver(f.ctx, null, opts);
        config.expression = '* * * * *';
        f.trigger.timezone = 'UTC';
        expect(f.state.events).toEqual([{ type: 'wake_up', reason: 'ready', messageIdx: 1, triggerId: 'tr', triggerKind: 'cron', cronExpression: '0 9 * * 1-5', timezone: 'Europe/Lisbon' }]);
    });
}
for (const kind of ['at', 'cron', 'future-kind']) {
    test(`${kind} delivery does not invent missing schedule metadata`, async () => {
        const f = fixture();
        f.trigger.kind = kind;
        await deliver(f.ctx, null, opts);
        expect(f.state.events).toEqual([{ type: 'wake_up', reason: 'ready', messageIdx: 1, triggerId: 'tr', triggerKind: kind }]);
    });
}


for (const mode of ['once', 'edge']) {
    test(`watch ${mode} ready outcome reaches persisted snapshot`, async () => {
        const f = fixture();
        f.trigger.mode = mode;
        expect(await process(f.ctx, null, opts)).toEqual({ outcome: 'fired' });
        expect(f.state.events[0]).toMatchObject({ triggerKind: 'watch', watchStatus: 'ready', watchId: 'tr' });
    });
}
test('watch timeout outcome reaches snapshot without predicate evaluation', async () => {
    const f = fixture();
    f.trigger.timeout_at = 2;
    f.trigger.config = { onTimeoutPrompt: 'expired' };
    expect(await process(f.ctx, null, opts)).toEqual({ outcome: 'timed_out' });
    expect(f.state.events[0]).toMatchObject({ watchStatus: 'timeout', reason: 'expired' });
    expect(f.state.predicates).toBe(0);
});
test('manual watch delivery never infers timeout status from prompt', async () => {
    const f = fixture();
    await deliver(f.ctx, null, { ...opts, prompt: 'timed out' });
    expect(f.state.events[0]).not.toHaveProperty('watchStatus');
});
test('non-watch delivery cannot acquire watch status', async () => {
    const f = fixture();
    f.trigger.kind = 'at';
    await deliver(f.ctx, null, { ...opts, watchStatus: 'timeout' });
    expect(f.state.events[0]).not.toHaveProperty('watchStatus');
});
test('watch timeout without timeout prompt emits no wake event', async () => {
    const f = fixture();
    f.trigger.timeout_at = 2;
    expect(await process(f.ctx, null, opts)).toEqual({ outcome: 'timed_out' });
    expect(f.state.events).toEqual([]);
});
test('watch UI event keeps only a stored predicate reference and its bounded preview', async () => {
    const f = fixture();
    const resultRef = {version:1 as const,id:'stored-id',ownerAgentId:'owner',bytes:1024,sha256:'hash',kind:'predicate'};
    await deliver(f.ctx, null, {...opts,resultRef,resultPreview:'<bounded preview>'});
    expect(f.state.events[0]).toMatchObject({resultRef,resultPreview:'<bounded preview>'});
    expect(f.state.messages).toBe(1);
    const missing = fixture();
    await deliver(missing.ctx, null, {...opts,resultPreview:'not durably stored'});
    expect(missing.state.events[0]).not.toHaveProperty('resultRef');
    expect(missing.state.events[0]).not.toHaveProperty('resultPreview');
});
