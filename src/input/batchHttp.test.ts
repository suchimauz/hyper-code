// Real HTTP dispatch, real cookie-bound CSRF and isolated Postgres (.env.test.local).
// No authority/CSRF/storage mocks: a passing test must exercise the actual route contract.
import { expect, spyOn, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

const ORIGIN = 'http://mauzcode.test';
const SECRET = 'http-batch-private-7f4b-not-public';
async function setup() {
    const ctx: any = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 23).toString('base64') } });
    const owner = await ctx.fns.auth.createUser({ name: 'Batch owner', email: 'owner@batch.test', password: 'test-owner-password', role: 'owner' });
    const member = await ctx.fns.auth.createUser({ name: 'Batch member', email: 'member@batch.test', password: 'test-member-password', role: 'member' });
    const cookieFor = async (user: any) => `${ctx.fns.procs.auth.cookieName({})}=${await ctx.fns.procs.auth.sign({ sub: user.id, name: user.name, days: 1 })}`;
    const cookie = await cookieFor(owner), memberCookie = await cookieFor(member);
    const agent = await ctx.fns.agent.start({ model: 'test:model', systemPrompt: '' });
    await ctx.fns.session.save({ agent });
    const { id } = await ctx.fns.input.request({ agentId: agent.id, kind: 'batch', title: 'HTTP batch', waitForAnswer: true, spec: { items: [
        { key: 'choice', kind: 'choice', title: 'Choose', spec: { options: ['a', 'b'] } },
        { key: 'secret', kind: 'secret', title: 'Credential', spec: { saveAs: 'secret://batch-http/token' } },
        { key: 'grid', kind: 'grid', title: 'Row', spec: { rows: [{ id: 'r1', label: 'First' }], columns: [{ key: 'label', label: 'Label' }] } },
    ] } });
    const path = `/input/batch/${id}`;
    const dispatch = (method: string, suffix = '', body?: any, headers: Record<string, string> = {}) => ctx.fns.procs.http.dispatch({
        method, url: ORIGIN + (suffix.startsWith('/input/') ? suffix : path + suffix),
        headers: { cookie, accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
        ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    });
    const initial = await dispatch('GET'); expect(initial.status).toBe(200);
    const snapshot = await initial.json(); expect(snapshot.csrfToken.length).toBeGreaterThan(20);
    const token = snapshot.csrfToken;
    const post = (suffix: string, body: any, headers: Record<string, string> = {}) => dispatch('POST', suffix, body, { 'x-csrf-token': token, origin: ORIGIN, ...headers });
    const row = async () => (await ctx.fns.procs.db.select({ sql: 'SELECT * FROM input_batch_state WHERE input_id=?', params: [id] }))[0];
    return { ctx, agent, id, dispatch, post, row, token, cookie, memberCookie, snapshot };
}

async function fill(f: Awaited<ReturnType<typeof setup>>) {
    let r = await f.post('/draft', { revision: 0, key: 'choice', values: { pick: 'b' }, currentStep: 1 });
    expect(r.status).toBe(200); let s = await r.json();
    r = await f.post('/secret', { revision: s.revision, key: 'secret', value: SECRET });
    expect(r.status).toBe(200); s = await r.json();
    expect(s).toEqual({ state: 'open', revision: 2, filled: true });
    r = await f.post('/draft', { revision: s.revision, key: 'grid', values: { pick: 'r1' }, currentStep: 2 });
    expect(r.status).toBe(200); return await r.json();
}

test('batch HTTP owner cookie workflow, safe projections, final receipt and replay are real', async () => {
    const f = await setup(); const s = await fill(f);
    expect(s.items.find((i: any) => i.key === 'secret')).toMatchObject({ filled: true });
    expect(s.items.find((i: any) => i.key === 'secret').draft).toBeUndefined();
    expect(s.items[0].draft).toEqual({ pick: ['b'] });
    const listResponse = await f.dispatch('GET', `/input/batches?agentId=${f.agent.id}`);
    expect(listResponse.status).toBe(200); const list = await listResponse.json();
    expect(list.csrfToken).toBe(f.token); expect(list.inputs).toHaveLength(1);
    expect(list.inputs[0].items.every((i: any) => i.draft === undefined)).toBe(true);
    const search = await f.dispatch('GET', '/search?key=grid&q=first');
    expect(await search.json()).toEqual({ rows: [{ value: 'r1', cells: ['First'] }], page: 0 });
    const frame = await f.dispatch('GET', '/field?key=secret'); expect(frame.status).toBe(200);
    const frameHtml = await frame.text();
    const storedDraft = await f.row();
    expect(storedDraft.draft_enc).toBeTruthy(); expect(JSON.stringify(storedDraft)).not.toContain(SECRET);
    for (const value of [s, list, frameHtml, await f.ctx.fns.session.getMessages({ id: f.agent.id }), await f.ctx.fns.session.getEvents({ id: f.agent.id })]) expect(JSON.stringify(value)).not.toContain(SECRET);
    const submitted = await f.post('/submit', { revision: s.revision, requestId: crypto.randomUUID() });
    expect(submitted.status).toBe(200); const receipt = await submitted.json(); expect(receipt.state).toBe('submitted');
    expect(receipt.items.every((i: any) => i.draft === undefined)).toBe(true);
    const before = await f.row(); const messages = await f.ctx.fns.session.getMessages({ id: f.agent.id });
    expect(before.draft_enc).toBeNull();
    for (const value of [receipt, messages, await f.ctx.fns.session.getEvents({ id: f.agent.id }), await f.ctx.fns.input.get({ id: f.id })]) expect(JSON.stringify(value)).not.toContain(SECRET);
    const replay = await f.post('/submit', { revision: s.revision, requestId: crypto.randomUUID() });
    expect(replay.status).toBe(200); expect((await replay.json()).state).toBe('submitted');
    const restored = await f.dispatch('GET'); expect((await restored.json()).state).toBe('submitted');
    expect((await f.dispatch('GET', '/field?key=secret')).status).toBe(404);
    expect((await f.post('/draft', { revision: receipt.revision, key: 'choice', values: { pick: 'a' } })).status).toBe(409);
    expect(await f.row()).toEqual(before); expect(await f.ctx.fns.session.getMessages({ id: f.agent.id })).toEqual(messages);
}, 60000);

test('all dedicated endpoints reject anonymous/member/cross-origin access and writes require bound CSRF', async () => {
    const f = await setup(); const before = await f.row();
    for (const suffix of ['', '/field?key=secret', '/search?key=grid', `/input/batches?agentId=${f.agent.id}`]) {
        for (const headers of [{ cookie: '' }, { cookie: f.memberCookie }, { origin: 'https://evil.invalid' }, { 'sec-fetch-site': 'cross-site' }] as Record<string, string>[]) {
            expect((await f.dispatch('GET', suffix, undefined, headers)).status).toBeGreaterThanOrEqual(400);
        }
    }
    for (const suffix of ['/draft', '/secret', '/submit', '/cancel']) {
        for (const headers of [{ cookie: '' }, { cookie: f.memberCookie }, { origin: 'https://evil.invalid' }, { 'sec-fetch-site': 'cross-site' }, { 'x-csrf-token': '' }, { 'x-csrf-token': 'forged' }] as Record<string, string>[]) {
            expect((await f.post(suffix, { revision: 0 }, headers)).status).toBeGreaterThanOrEqual(400);
        }
    }
    // A valid second owner cookie must not accept the first cookie's token.
    const second = await f.ctx.fns.auth.createUser({ name: 'Second owner', email: 'second@batch.test', password: 'another-test-password', role: 'owner' });
    const other = `${f.ctx.fns.procs.auth.cookieName({})}=${await f.ctx.fns.procs.auth.sign({ sub: second.id, name: second.name, days: 1 })}`;
    expect((await f.post('/draft', { revision: 0, key: 'choice', values: { pick: 'a' } }, { cookie: other })).status).toBe(403);
    expect(await f.row()).toEqual(before);
}, 60000);

test('HTTP methods, actual UTF-8 body limit, malformed JSON and prototype fields fail without mutation', async () => {
    const f = await setup(); const before = await f.row();
    for (const suffix of ['/draft', '/secret', '/submit', '/cancel']) expect((await f.dispatch('GET', suffix)).status).toBeGreaterThanOrEqual(400);
    for (const suffix of ['', '/field?key=secret', '/search?key=grid']) expect((await f.post(suffix, {})).status).toBeGreaterThanOrEqual(400);
    expect((await f.post('/draft', '{}', { 'content-type': 'text/plain' })).status).toBe(415);
    for (const body of ['{', 'null', '[]', '{"revision":0,"key":"choice","values":{"pick":"a","__proto__":"x"}}', '{"revision":0,"key":"choice","values":{"constructor":"x"}}', '{"revision":0,"key":"choice","values":{"prototype":"x"}}', '{"revision":0,"key":"choice","values":{"pick":"a"},"__proto__":{}}', { revision: 0, key: 'choice', values: { pick: 'a' }, authority: 'fake' }, { revision: -1, key: 'choice' }, { revision: 0.5, key: 'choice' }, { revision: 0, key: 'choice', values: { pick: 3 } }]) {
        expect((await f.post('/draft', body)).status).toBe(400);
    }
    // Smaller JS character count, larger byte count; a forged Content-Length cannot bypass the cap.
    const large = JSON.stringify({ revision: 0, key: 'secret', value: 'é'.repeat(500001) });
    expect(large.length).toBeLessThan(1_000_000); expect(Buffer.byteLength(large)).toBeGreaterThan(1_000_000);
    expect((await f.post('/secret', large, { 'content-length': '1' })).status).toBe(413);
    expect((await f.post('/secret', large)).status).toBe(413);
    expect(await f.row()).toEqual(before); expect(({} as any).polluted).toBeUndefined();
}, 60000);

test('member/step binding and dedicated secret transport cannot be bypassed by draft or generic submit', async () => {
    const f = await setup(); const before = await f.row();
    for (const body of [
        { revision: 0, key: 'missing', values: { pick: 'a' } },
        { revision: 0, key: 'choice', currentStep: 2 },
        { revision: 0, key: 'choice', currentStep: -1 },
        { revision: 0, key: 'choice', currentStep: 3 },
        { revision: 0, key: 'choice', currentStep: '1' },
        { revision: 0, key: 'secret', values: { value: SECRET } },
    ]) expect((await f.post('/draft', body)).status).toBe(400);
    expect((await f.post('/secret', { revision: 0, key: 'choice', value: SECRET })).status).toBe(400);
    expect((await f.dispatch('GET', '/field?key=choice')).status).toBe(404);
    const generic = await f.post(`/input/${f.id}`, { values: { value: SECRET } });
    expect(generic.status).toBeGreaterThanOrEqual(400); expect(await generic.text()).not.toContain(SECRET);
    expect(await f.row()).toEqual(before); expect((await f.ctx.fns.input.get({ id: f.id })).state).toBe('open');
    const valid = await f.post('/draft', { revision: 0, key: 'choice', values: { pick: 'a' }, currentStep: 1 }); expect(valid.status).toBe(200);
    const after = await f.row();
    expect((await f.post('/draft', { revision: 0, key: 'choice', values: { pick: 'b' } })).status).toBe(409);
    expect(await f.row()).toEqual(after);
}, 60000);

test('isolated secret field limits script/connect/frame origin, binds parent source and never reflects stored value', async () => {
    const f = await setup(); await fill(f);
    const response = await f.dispatch('GET', '/field?key=secret'); expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const csp = response.headers.get('content-security-policy')!;
    for (const policy of ["default-src 'none'", "connect-src 'self'", "frame-ancestors 'self'", "form-action 'none'", "base-uri 'none'"]) expect(csp).toContain(policy);
    const html = await response.text(); expect(html).not.toContain(SECRET);
    const nonce = html.match(/<script nonce="([^"]+)"/); expect(nonce).not.toBeNull(); expect(csp).toContain(`script-src 'nonce-${nonce![1]}'`);
    // Execute only the inline bridge in an isolated VM with DOM/fetch stand-ins, not the runtime backend.
    const { runInNewContext } = await import('node:vm');
    let listener: any; const sent: any[] = [], fetched: any[] = [];
    const parent = { postMessage: (message: any, origin: string) => sent.push({ message, origin }) };
    const field = { value: SECRET, focus() {}, }, status = { textContent: '' };
    runInNewContext(html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)![1], {
        parent, location: { origin: ORIGIN }, document: { getElementById: (id: string) => id === 'value' ? field : status },
        addEventListener: (_: string, fn: any) => { listener = fn; },
        fetch: async (url: string, options: any) => { fetched.push({ url, options }); return { ok: true, json: async () => ({ revision: 4, filled: true }) }; },
    });
    const data = { target: 'mauzcode-batch-secret', id: f.id, key: 'secret', action: 'save', revision: 3 };
    for (const event of [{ source: {}, origin: ORIGIN, data }, { source: parent, origin: 'https://evil.invalid', data }, { source: parent, origin: ORIGIN, data: { ...data, id: 'wrong' } }, { source: parent, origin: ORIGIN, data: { ...data, key: 'choice' } }]) await listener(event);
    expect(fetched).toHaveLength(0);
    await listener({ source: parent, origin: ORIGIN, data }); expect(fetched).toHaveLength(1); expect(field.value).toBe('');
    expect(JSON.parse(fetched[0].options.body)).toEqual({ key: 'secret', revision: 3, value: SECRET });
    expect(sent.every(x => x.origin === ORIGIN)).toBe(true); expect(JSON.stringify(sent)).not.toContain(SECRET);
    expect(sent.at(-1).message).toMatchObject({ state: 'saved', filled: true, revision: 4 });
}, 60000);


test('real HTTP secret success and rejection never write plaintext into runtime logs', async () => {
    const f = await setup();
    // Keep real emitters active at debug level; observe their actual pretty-format sinks.
    f.ctx.fns.procs.log.level({ set: 'debug' });
    const sinks = [spyOn(console, 'log'), spyOn(console, 'warn'), spyOn(console, 'error')];
    try {
        const s = await fill(f);
        const rejected = await f.post('/draft', { revision: s.revision, key: 'secret', values: { value: SECRET } });
        expect(rejected.status).toBe(400); expect(await rejected.text()).not.toContain(SECRET);
        const submitted = await f.post('/submit', { revision: s.revision, requestId: crypto.randomUUID() });
        expect(submitted.status).toBe(200);
        for (const sink of sinks) expect(JSON.stringify(sink.mock.calls)).not.toContain(SECRET);
    } finally { for (const sink of sinks) sink.mockRestore(); }
}, 60000);

test('isolated secret field honors only validated application themes',async()=>{
 const f=await setup();
 for(const [query,expected] of [['dark','dark'],['light','light'],['auto','light dark'],['bad%3Bcolor%3Ared','light dark']]){
  const response=await f.dispatch('GET','/field?key=secret&theme='+query);
  expect(response.status).toBe(200);const html=await response.text();expect(html).toContain('color-scheme:'+expected+'}');expect(html).not.toContain('color:red');
 }
});
