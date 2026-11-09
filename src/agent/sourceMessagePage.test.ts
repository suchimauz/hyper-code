import { test, expect } from 'bun:test';
import page from './sourceMessagePage';
import route from './$route_$id_message_$idx_GET';

function fixture(who: any = { required: true, user: { id: 'owner' } }, owner: any = { created_by: 'owner' }) {
 const calls: any[] = [];
 const ctx: any = { fns: { auth: { currentUser: async () => who }, procs: { db: { select: async (o: any) => {
  calls.push(o);
  if (o.sql.includes('FROM agents')) return owner ? [owner] : [];
  return [{ role: 'user', content: '<script>unsafe</script>' }];
 } } }, agent: {} } };
 ctx.fns.agent.sourceMessagePage = (o: any) => page(ctx, null, o);
 const request = (accept = 'application/json', id = 'a', idx = '2') => route(ctx, null, { req: new Request('http://localhost/agent/a/message/2', { headers: { accept } }), params: { id, idx } });
 return { ctx, calls, request };
}

test('owner receives literal JSON only after durable ownership query; browser opens native reader', async () => {
 const f = fixture();
 const response = await f.request('text/html');
 expect(response.status).toBe(303);
 expect(response.headers.get('location')).toContain('view=extension%3Aagent-source%2Foverview');
 expect(f.calls).toHaveLength(1);
 expect(f.calls[0].sql).toBe('SELECT created_by FROM agents WHERE id = ?');
 const json = await f.request();
 expect(json.headers.get('cache-control')).toBe('no-store');
 expect(await json.json()).toEqual({ agentId: 'a', index: 2, role: 'user', content: '<script>unsafe</script>' });
 expect(f.calls[2].params).toEqual(['a', 2]);
});

test('anonymous authentication-required requests never query agents or messages', async () => {
 const f = fixture({ required: true, user: null });
 for (const accept of ['application/json', 'text/html']) expect((await f.request(accept)).status).toBe(401);
 expect(f.calls).toHaveLength(0);
});

test('other members and missing agents are indistinguishable and never read messages or redirect', async () => {
 for (const owner of [{ created_by: 'other' }, { created_by: null }, null]) {
  const f = fixture(undefined, owner);
  for (const accept of ['application/json', 'text/html']) {
   const response = await f.request(accept);
   expect(response.status).toBe(404);
   expect(await response.text()).toBe('Not Found');
  }
  expect(f.calls.every(o => o.sql.includes('FROM agents'))).toBe(true);
 }
});

test('invalid coordinates are nondisclosing and never query persisted data', async () => {
 const f = fixture();
 for (const [id, idx] of [['../a', '2'], ['a', '-1'], ['a', '9007199254740992'], ['a', 'x']]) {
  const response = await f.request('application/json', id, idx);
  expect(response.status).toBe(404);
  expect(await response.text()).toBe('Not Found');
 }
 expect(f.calls).toHaveLength(0);
});

test('open and shared-password modes permit only ownerless sources', async () => {
 for (const who of [{ required: false, user: null }, { required: true, legacy: true, user: null }]) {
  const allowed = fixture(who, { created_by: null });
  expect((await allowed.request()).status).toBe(200);
  const denied = fixture(who, { created_by: 'owner' });
  expect((await denied.request()).status).toBe(404);
  expect(denied.calls).toHaveLength(1);
 }
});

test('archived sources remain readable by exact owner, not another member', async () => {
 const f = fixture(undefined, { created_by: 'owner', archived_at: '2025-01-01' });
 expect((await f.request()).status).toBe(200);
 expect(f.calls[0].sql).not.toContain('archived_at');
 const denied = fixture(undefined, { created_by: 'other', archived_at: '2025-01-01' });
 expect((await denied.request()).status).toBe(404);
 expect(denied.calls).toHaveLength(1);
});

test('authorized missing source messages return 404', async () => {
 const f = fixture();
 f.ctx.fns.procs.db.select = async (o: any) => o.sql.includes('FROM agents') ? [{ created_by: 'owner' }] : [];
 expect((await f.request()).status).toBe(404);
});
