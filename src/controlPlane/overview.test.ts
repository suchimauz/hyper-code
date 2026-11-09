import { expect, test } from 'bun:test';
import overview from './overview';
import redirect from './$route_GET';

const req = new Request('http://localhost/controlPlane/overview');
function fixture(connected = true) {
  let reads = 0;
  const ctx: any = { fns: { auth: { oidcConfig: async () => connected ? { issuer: 'https://cp.example', clientSecret: 'PRIVATE' } : null }, controlPlane: { services: async () => { reads++; return [{ id: 'one', name: '<script>name</script>', url: 'javascript:alert(1)', ownerEmail: 'owner@example.com', metadata: { users: 2, agents: 3, running: 1, version: 'v1', token: 'PRIVATE' }, lastSeenAt: 1000 }, { id: 'two', name: 'Two', url: 'https://example.com/app?token=PRIVATE', metadata: {}, lastSeenAt: null }]; } } } };
  return { ctx, reads: () => reads };
}
const session: any = { user: { id: 'member', role: 'member' } };
test('overview requires authentication before config or discovery', async () => {
  const f = fixture();
  expect((await overview(f.ctx, null, { req })).status).toBe(401);
  expect(f.reads()).toBe(0);
});
test('directory preserves authenticated member read access without revealing credentials or arbitrary metadata', async () => {
  const f = fixture(); const response = await overview(f.ctx, session, { req });
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = await response.json();
  expect(body.instances[0].url).toBeNull();
  expect(body.instances[1].url).toBe('https://example.com/app');
  expect(body.instances[0].users).toBe(2);
  expect(JSON.stringify(body)).not.toContain('PRIVATE');
  expect(body.instances[0].metadata).toBeUndefined();
});
test('disconnected directory never calls discovery', async () => {
  const f = fixture(false);
  expect(await (await overview(f.ctx, session, { req })).json()).toEqual({ connected: false, instances: [] });
  expect(f.reads()).toBe(0);
});
test('no action endpoint or configuration writes', async () => {
  const f = fixture();
  expect((await overview(f.ctx, session, { req: new Request(req.url, { method: 'POST' }) })).status).toBe(405);
  expect(f.reads()).toBe(0);
});
test('legacy route redirects to native extension without fetching configuration', async () => {
  const response = await redirect({} as any, null, { req, params: {} });
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe('/?view=extension:instances/overview');
});
