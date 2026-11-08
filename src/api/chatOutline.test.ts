import { expect, test } from 'bun:test';
import outline from './chatOutline';
import route from './$route_v1_agents_$id_outline_GET';

test('outline bounds prompts and joins durable human provenance', async () => {
  let query = '';
  let params: unknown[] = [];
  const ctx: any = { fns: { procs: { db: { select: async (opts: any) => { query = opts.sql; params = opts.params; return [{ idx: 2, prompt: 'a' }, { idx: 4, prompt: 'b' }, { idx: 6, prompt: 'c' }]; } } } } };
  expect(await outline(ctx, null, { id: 'ab', after: 1, limit: 2 })).toEqual({ items: [{ idx: 2, prompt: 'a' }, { idx: 4, prompt: 'b' }], nextAfter: 4 });
  expect(params).toEqual(['ab', 1, 3]);
  expect(query).toContain('JOIN messages');
  expect(query).toContain("coalesce(m.message_type, 'message') = 'message'");
  expect(query).toContain("NOT LIKE 'agent:%'");
  expect(query).toContain('input-result|canvas-ping');
});
test('outline route rejects invalid cursors and missing agents', async () => {
  const ctx: any = { fns: { procs: { db: { select: async () => [1] } }, api: { chatOutline: async () => ({ items: [], nextAfter: null }) } } };
  expect((await route(ctx, null, { req: new Request('http://localhost/?after=no'), params: { id: 'ab' } })).status).toBe(400);
  const response = await route(ctx, null, { req: new Request('http://localhost/'), params: { id: 'ab' } });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ items: [], nextAfter: null });
  ctx.fns.procs.db.select = async () => [];
  expect((await route(ctx, null, { req: new Request('http://localhost/'), params: { id: 'ab' } })).status).toBe(404);
});
