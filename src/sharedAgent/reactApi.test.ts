import { test, expect } from 'bun:test';
import get from '../$route_shared-agents_GET';
import publish from '../$route_shared-agents_publish_POST';
import unpublish from '../$route_shared-agents_unpublish_POST';
import delegate from '../$route_shared-agents_delegate_POST';

const owner = { user: { role: 'owner' } } as any;
function fixture(csrf = true) {
  const calls: unknown[] = [];
  const ctx = { fns: { auth: { csrfToken: async () => 'cookie-token', verifyCsrf: async ({ token }: any) => csrf && token === 'cookie-token' }, session: { list: async () => [{ id: 'ab', title: 'Session', secret: 'hidden' }] }, sharedAgent: { list: async () => [], ...Object.fromEntries(['publish', 'unpublish', 'delegate'].map(key => [key, async (body: unknown) => { calls.push({ key, body }); return { childId: 'test' }; }])) }, procs: { db: { select: async () => [{ id: 'broken', scratchpad: '{' }] } } } } as any;
  return { ctx, calls };
}
function request(body: unknown, token = 'cookie-token') { return { req: new Request('http://localhost/shared-agents/publish', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify(body) }), params: {} }; }

test('registry requires owner and redirects HTML to the React extension', async () => {
  const { ctx } = fixture();
  const opts = { req: new Request('http://localhost/shared-agents?from=ab'), params: {} };
  expect((await get(ctx, null, opts)).status).toBe(403);
  const redirect = await get(ctx, owner, opts);
  expect(redirect.status).toBe(303);
  expect(redirect.headers.get('location')).toContain('extension%3Ashared-agents%2Foverview');
  expect(redirect.headers.get('location')).toContain('from=ab');
});
test('JSON registry omits private session fields and tolerates malformed legacy scratchpad', async () => {
  const { ctx } = fixture();
  const response = await get(ctx, owner, { req: new Request('http://localhost/shared-agents', { headers: { accept: 'application/json' } }), params: {} });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ agents: [{ id: 'ab', title: 'Session' }], cards: [], tasks: [], csrfToken: 'cookie-token' });
});
for (const [name, handler, fields] of [['publish', publish, { name: 'Test', description: 'Context', capabilities: ['review'] }], ['unpublish', unpublish, {}], ['delegate', delegate, { task: 'Review' }]] as const) {
  test(`${name}: owner, CSRF and explicit confirmation precede mocked mutation`, async () => {
    const { ctx, calls } = fixture();
    const body = { agentId: 'ab', confirmed: true, ...fields };
    expect((await handler(ctx, null, request(body))).status).toBe(403);
    expect((await handler(ctx, owner, request(body, 'bad'))).status).toBe(403);
    expect((await handler(ctx, owner, request({ ...body, confirmed: false }))).status).toBe(400);
    expect((await handler(ctx, owner, request({ ...body, agentId: {} }))).status).toBe(400);
    expect(calls).toEqual([]);
    expect((await handler(ctx, owner, request(body))).status).toBe(200);
    expect(calls.length).toBe(1);
  });
}
