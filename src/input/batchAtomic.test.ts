// Acceptance tests: real isolated Postgres selected by _testDb (.env.test.local).
// Registry overrides inject failures AFTER real writes; persistence is never mocked.
import { describe, expect, test, setDefaultTimeout } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

// Boot/migrate can exceed Bun's 5s default on a shared CI/database host.
setDefaultTimeout(30_000);

const SECRET = 'batch-private-value-not-for-transcript';
const items = () => [
    { key: 'choice', kind: 'choice', title: 'Choose', spec: { options: ['a', 'b'] } },
    { key: 'grid', kind: 'grid', title: 'Row', spec: { rows: [{ id: 'r1', name: 'First' }], columns: [{ key: 'name', label: 'Name' }] } },
    { key: 'confirm', kind: 'confirm', title: 'Confirm', spec: {} },
    { key: 'secret', kind: 'secret', title: 'Credential', spec: { saveAs: 'secret://batch-test/token' } },
    { key: 'plugin', kind: 'acceptance-plugin', title: 'Plugin', spec: { label: 'Note' } },
];
const values: Record<string, any> = { choice: { pick: 'b' }, grid: { pick: 'r1' }, confirm: { decision: 'no' }, secret: { value: SECRET }, plugin: { text: 'plugin answer' } };
async function setup() {
    const ctx: any = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 21).toString('base64') } });
    const agent = await ctx.fns.agent.start({ model: 'test:model', systemPrompt: '' });
    await ctx.fns.session.save({ agent });
    ctx.state.input.kinds['acceptance-plugin'] = { name: 'acceptance-plugin', batch: {
        version: 1, normalizeSpec: ({ spec }: any) => spec, projectSpec: ({ spec }: any) => spec,
        projectDraft: ({ values }: any) => values,
        validate: ({ values }: any) => typeof values.text === 'string' && values.text ? { ok: true, values, result: { text: values.text }, summary: 'Note saved' } : { ok: false, error: { code: 'required', message: 'Note required' } },
    } };
    const request = (members = items(), extra: any = {}) => ctx.fns.input.request({ agentId: agent.id, kind: 'batch', title: 'Acceptance batch', spec: { items: members }, waitForAnswer: true, ...extra });
    return { ctx, agent, request };
}
async function fill(ctx: any, id: string) {
    let snapshot = await ctx.fns.input.batchSnapshot({ id, drafts: true });
    for (const item of snapshot.items) snapshot = await ctx.fns.input.batchDraft({ id, key: item.key, revision: snapshot.revision, values: values[item.key], ...(item.kind === 'secret' ? { secret: true } : {}) });
    return snapshot;
}
const terminalMessages = async (ctx: any, id: string) => (await ctx.fns.session.getMessages({ id })).filter((m: any) => m.message_type === 'input');
const secretRows = (ctx: any) => ctx.fns.procs.db.select({ sql: "SELECT * FROM local_secrets WHERE namespace='batch-test' ORDER BY name" });
const stateRow = async (ctx: any, id: string) => (await ctx.fns.procs.db.select({ sql: 'SELECT * FROM input_batch_state WHERE input_id=?', params: [id] }))[0];
const submit = (ctx: any, id: string, revision: number, requestId = 'acceptance_attempt') => ctx.fns.input.batchAction({ id, action: 'submit', revision, requestId, actor: 'test-owner' });
async function assertPrivate(ctx: any, agent: any, id: string) {
    const publicData = [await ctx.fns.input.get({ id }), await ctx.fns.input.batchSnapshot({ id, drafts: true }), await ctx.fns.session.getMessages({ id: agent.id }), await ctx.fns.session.getEvents({ id: agent.id }), agent.messages, agent.events];
    expect(JSON.stringify(publicData)).not.toContain(SECRET);
}

describe('atomic Batch / isolated Postgres', () => {
    test('mixed durable drafts create one parent, no answers, no secret and no transcript delivery', async () => {
        const { ctx, agent, request } = await setup(); const { id } = await request();
        const snap = await fill(ctx, id);
        expect(snap.items.every((i: any) => i.filled)).toBe(true);
        expect(snap.items.find((i: any) => i.kind === 'secret').draft).toBeUndefined();
        expect((await ctx.fns.procs.db.select({ sql: 'SELECT id FROM inputs WHERE agent_id=?', params: [agent.id] }))).toHaveLength(1);
        expect((await ctx.fns.input.get({ id })).result).toBeNull();
        expect(await secretRows(ctx)).toHaveLength(0);
        expect(await terminalMessages(ctx, agent.id)).toHaveLength(0);
        expect((await ctx.fns.session.getEvents({ id: agent.id })).filter((e: any) => e.type === 'input' && e.inputId === id)).toHaveLength(1);
        const listSnapshot = await ctx.fns.input.batchSnapshot({ id });
        expect(listSnapshot.items.every((item: any) => item.draft === undefined)).toBe(true);
        expect((await stateRow(ctx, id)).draft_enc).toBeTruthy();
        expect(JSON.stringify(await stateRow(ctx, id))).not.toContain(SECRET);
        expect(await ctx.fns.input.isWaiting({ agentId: agent.id })).toBe(true);
        await assertPrivate(ctx, agent, id);
    });
    test('success commits all five answers and a secret exactly once including concurrent retries', async () => {
        const { ctx, agent, request } = await setup(); const { id } = await request(); const snap = await fill(ctx, id);
        const results = await Promise.all([submit(ctx, id, snap.revision), submit(ctx, id, snap.revision)]);
        expect(results.every(r => r.state === 'submitted')).toBe(true);
        await submit(ctx, id, snap.revision);
        const row = await ctx.fns.input.get({ id });
        expect(row.result.answers).toHaveLength(5);
        expect(row.result.answers.find((a: any) => a.key === 'confirm').result.confirmed).toBe(false);
        expect(row.result.answers.find((a: any) => a.key === 'secret').result).toEqual({ ref: 'secret://batch-test/token' });
        expect(await ctx.fns.secrets.get({ ref: 'secret://batch-test/token' })).toBe(SECRET);
        expect(Number((await secretRows(ctx))[0].version)).toBe(1);
        expect(await terminalMessages(ctx, agent.id)).toHaveLength(1);
        expect((await stateRow(ctx, id)).draft_enc).toBeNull();
        await ctx.fns.input.batchAction({ id, action: 'recover' });
        expect(Number((await secretRows(ctx))[0].version)).toBe(1);
        expect(await terminalMessages(ctx, agent.id)).toHaveLength(1);
        await assertPrivate(ctx, agent, id);
    });
    for (const fault of ['secret', 'message']) test(`fault AFTER real ${fault} write rolls back secret/version, transcript and live success`, async () => {
        const { ctx, agent, request } = await setup();
        await ctx.fns.secrets.putLocal({ namespace: 'batch-test', name: 'token', value: 'old-value' });
        const old = await secretRows(ctx); const { id } = await request(); const snap = await fill(ctx, id);
        const registry = fault === 'secret' ? ctx.state.registry.secrets : ctx.state.registry.session;
        const name = fault === 'secret' ? 'putLocal' : 'appendMessage'; const original = registry[name]; let injected = false;
        registry[name] = async (c: any, s: any, o: any) => { const out = await original(c, s, o); if (!injected) { injected = true; throw Error('FAULT ' + SECRET); } return out; };
        const publications: string[] = []; const refresh = ctx.state.registry.procs.events.refresh;
        ctx.state.registry.procs.events.refresh = (...args: any[]) => { publications.push(JSON.stringify(agent.messages)); return refresh(...args); };
        const result = await submit(ctx, id, snap.revision);
        expect(injected).toBe(true); expect(result.state).toBe('cancelled');
        expect(await secretRows(ctx)).toEqual(old);
        expect(await ctx.fns.secrets.get({ ref: 'secret://batch-test/token' })).toBe('old-value');
        expect((await stateRow(ctx, id)).draft_enc).toBeNull();
        const messages = await terminalMessages(ctx, agent.id); expect(messages).toHaveLength(1);
        expect(messages[0].content).toContain('cancelled'); expect(messages[0].content).not.toContain('"answers"');
        expect(JSON.stringify(publications)).not.toContain('state=\\"submitted');
        await assertPrivate(ctx, agent, id);
    });
    for (const action of ['cancel', 'expire']) test(`${action} clears every draft and delivers no partial answer`, async () => {
        const { ctx, agent, request } = await setup(); const { id } = await request(); const snap = await fill(ctx, id);
        if (action === 'expire') await ctx.fns.procs.db.run({ sql: "UPDATE inputs SET spec=jsonb_set(spec,'{_expiresAt}',?::jsonb) WHERE id=?", params: [String(Date.now() - 1), id] });
        await ctx.fns.input.batchAction({ id, action, revision: snap.revision });
        expect((await stateRow(ctx, id)).draft_enc).toBeNull(); expect(await secretRows(ctx)).toHaveLength(0);
        const messages = await terminalMessages(ctx, agent.id); expect(messages).toHaveLength(1); expect(messages[0].content).not.toContain('plugin answer');
        await assertPrivate(ctx, agent, id);
    });
    test('stale revision and two tabs cannot overwrite an accepted draft', async () => {
        const { ctx, request } = await setup(); const { id } = await request(); const snap = await ctx.fns.input.batchSnapshot({ id });
        const saves = await Promise.allSettled(['a', 'b'].map(pick => ctx.fns.input.batchDraft({ id, key: 'choice', revision: snap.revision, values: { pick } })));
        expect(saves.filter(s => s.status === 'fulfilled')).toHaveLength(1);
        await expect(submit(ctx, id, snap.revision)).rejects.toThrow();
        expect((await ctx.fns.input.get({ id })).state).toBe('open');
    });
    test('JSONB spec key reorder preserves codec fingerprints', async () => {
        const { ctx, request } = await setup(); const { id } = await request(); const snap = await fill(ctx, id);
        await ctx.fns.procs.db.run({ sql: "UPDATE inputs SET spec=spec::text::jsonb WHERE id=?", params: [id] });
        expect((await submit(ctx, id, snap.revision)).state).toBe('submitted');
    });
    test('unsafe kinds, nested batches, duplicate saveAs and arbitrary grid sources reject before insertion', async () => {
        const { ctx, agent, request } = await setup();
        for (const kind of ['missing-kind', 'batch', 'planning-review', 'redmine-approval']) await expect(request([{ key: 'bad', kind, title: 'Bad', spec: {} }] as any)).rejects.toThrow();
        await expect(request([{ ...items()[3], key: 's1' }, { ...items()[3], key: 's2' }] as any)).rejects.toThrow();
        await expect(request([{ key: 'g', kind: 'grid', title: 'Unsafe', spec: { source: { fn: 'secrets.list' } } }] as any)).rejects.toThrow();
        expect(await ctx.fns.procs.db.select({ sql: 'SELECT id FROM inputs WHERE agent_id=?', params: [agent.id] })).toHaveLength(0);
    });
    test('crash recovery cancels accepted processing without repeating secret writes', async () => {
        const { ctx, agent, request } = await setup(); const { id } = await request(); await fill(ctx, id);
        await ctx.fns.procs.db.run({ sql: "UPDATE inputs SET state='processing' WHERE id=?", params: [id] });
        await ctx.fns.procs.db.run({ sql: 'UPDATE input_batch_state SET attempt_id=?,accepted_at=? WHERE input_id=?', params: ['crashed_attempt', Date.now() - 10000, id] });
        let writes = 0; const original = ctx.state.registry.secrets.putLocal;
        ctx.state.registry.secrets.putLocal = async (...args: any[]) => { writes++; return original(...args); };
        await ctx.fns.input.batchAction({ id, action: 'recover' }); await ctx.fns.input.batchAction({ id, action: 'recover' });
        expect(writes).toBe(0); expect((await ctx.fns.input.get({ id })).state).toBe('cancelled');
        expect((await stateRow(ctx, id)).draft_enc).toBeNull(); expect(await terminalMessages(ctx, agent.id)).toHaveLength(1);
    });
    test('recovery skips a live finalizer holding the session lock', async () => {
        const { ctx, agent, request } = await setup(); const { id } = await request(); await fill(ctx, id);
        await ctx.fns.procs.db.run({ sql: "UPDATE inputs SET state='processing' WHERE id=?", params: [id] });
        await ctx.fns.procs.db.run({ sql: 'UPDATE input_batch_state SET attempt_id=? WHERE input_id=?', params: ['active_attempt', id] });
        let ready!: () => void; let release!: () => void;
        const entered = new Promise<void>(r => { ready = r; }); const gate = new Promise<void>(r => { release = r; });
        // A second real pool models a different worker; each test context intentionally has max:1.
        const peer = await mkTestCtx({ db: ctx.env.DATABASE_URL });
        const holder = peer.fns.procs.db.withSessionLock({ key: 'input-batch:' + id, fn: async () => { ready(); await gate; } });
        await entered;
        try {
            await ctx.fns.input.batchAction({ id, action: 'recover' });
            expect((await ctx.fns.input.get({ id })).state).toBe('processing');
            expect((await stateRow(ctx, id)).draft_enc).toBeTruthy();
            expect(await terminalMessages(ctx, agent.id)).toHaveLength(0);
        } finally { release(); await holder; }
        await ctx.fns.input.batchAction({ id, action: 'recover' });
        expect((await ctx.fns.input.get({ id })).state).toBe('cancelled');
    });
    test('dedicated HTTP rejects unauthenticated, non-owner, CSRF and cross-origin writes without mutations', async () => {
        const { ctx, agent, request } = await setup(); const { id } = await request();
        const http = ctx.state.registry.input.batchHttp;
        const owner = { user: { id: 'owner', role: 'owner' } };
        const before = await stateRow(ctx, id);
        for (const mode of ['anonymous', 'non-owner', 'csrf', 'origin']) {
            ctx.state.registry.auth.verifyCsrf = async () => mode !== 'csrf';
            const req = new Request('http://local/input/batch/' + id + '/draft', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 'test', ...(mode === 'origin' ? { origin: 'http://evil.invalid' } : {}) }, body: JSON.stringify({ revision: 0, key: 'choice', values: { pick: 'a' } }) });
            const session = mode === 'anonymous' ? null : mode === 'non-owner' ? { user: { id: 'other', role: 'member' } } : owner;
            expect((await http(ctx, session, { req, params: { id }, operation: 'draft' })).status).toBe(403);
        }
        expect(await stateRow(ctx, id)).toEqual(before);
        expect(await terminalMessages(ctx, agent.id)).toHaveLength(0);
    });
    test('legacy submit and ordinary draft transport cannot complete or expose secret members', async () => {
        const { ctx, request } = await setup(); const { id } = await request();
        expect(await ctx.fns.input.submit({ id, values: { value: SECRET } })).toMatchObject({ state: 'open', error: expect.any(String) });
        await expect(ctx.fns.input.batchDraft({ id, key: 'secret', revision: 0, values: { value: SECRET } })).rejects.toThrow();
        expect((await ctx.fns.input.get({ id })).state).toBe('open');
        expect((await stateRow(ctx, id)).draft_enc).toBeNull();
    });
    test('missing final answer rolls back earlier secret and cancels without partial result', async () => {
        const { ctx, agent, request } = await setup(); const { id } = await request();
        let snap = await ctx.fns.input.batchSnapshot({ id });
        for (const key of ['choice', 'grid', 'confirm', 'secret']) snap = await ctx.fns.input.batchDraft({ id, key, revision: snap.revision, values: values[key], ...(key === 'secret' ? { secret: true } : {}) });
        expect((await submit(ctx, id, snap.revision)).state).toBe('cancelled');
        expect(await secretRows(ctx)).toHaveLength(0);
        expect((await stateRow(ctx, id)).draft_enc).toBeNull();
        expect(await terminalMessages(ctx, agent.id)).toHaveLength(1);
        await assertPrivate(ctx, agent, id);
    });
    test('plugin unload after drafts cancels safely without persisting earlier secrets', async () => {
        const { ctx, agent, request } = await setup(); const { id } = await request(); const snap = await fill(ctx, id);
        delete ctx.state.input.kinds['acceptance-plugin'];
        expect((await submit(ctx, id, snap.revision)).state).toBe('cancelled');
        expect(await secretRows(ctx)).toHaveLength(0);
        expect((await stateRow(ctx, id)).draft_enc).toBeNull();
        expect(await terminalMessages(ctx, agent.id)).toHaveLength(1);
    });
});
