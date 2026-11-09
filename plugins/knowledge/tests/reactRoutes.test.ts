import { test, expect } from 'bun:test';
import overview from '../src/knowledge/$route__GET';
import typePage from '../src/knowledge/$route_$type_GET';
import detail from '../src/knowledge/$route_$type_$slug_GET';
import rawGuard from '../src/knowledge/$route_agent_$id_tracking_POST';
const tracking = (ctx: any, session: any, opts: any) => { ctx.fns.auth.currentUser = async () => ({required: true, user: session?.user ?? null}); return rawGuard(ctx, session, opts); };
const session: any = { user: { id: 'owner', role: 'owner' } };
const ctx: any = { fns: { auth: { csrfToken: async () => 'token', verifyCsrf: async ({token}: any) => token === 'token' }, http: { publicOrigin: async () => 'https://hyper.test' }, knowledge: { stats: async () => ({entities: 1}), types: async () => [], get: async () => ({ id: 'Person/a', data: { title: '<script>' }, provenance: [], relations: {} }), setTracking: async ({enabled}: any) => ({enabled}) }, procs: { db: { select: async () => [] } } } };
test('legacy knowledge URLs redirect to native extension preserving identity', async () => {
 for (const [fn, params] of [[overview, {}], [typePage, {type: 'Person'}], [detail, {type: 'Person', slug: 'a b'}]] as const) {
  const response = await fn(ctx, session, { req: new Request('https://hyper.test/knowledge?q=test'), params } as any);
  expect(response.status).toBe(302); const url = new URL(response.headers.get('location')!); expect(url.searchParams.get('view')).toBe('extension:knowledge/overview'); expect(url.searchParams.get('q')).toBe('test');
  if ('slug' in params) expect(url.searchParams.get('slug')).toBe('a b');
 }
});
test('JSON detail exposes evidence data not HTML and requires authentication', async () => {
 const opts = { req: new Request('https://hyper.test/knowledge/Person/a?format=json'), params: {type:'Person',slug:'a'} };
 expect((await detail(ctx, null, opts)).status).toBe(401);
 const response = await detail(ctx, session, opts); expect(response.headers.get('cache-control')).toBe('no-store'); expect((await response.json()).entity.data.title).toBe('<script>');
});
test('tracking rejects anonymous, non-owner and invalid CSRF; accepts exact boolean JSON', async () => {
 const opts = (token: string, enabled: unknown = true) => ({req: new Request('https://hyper.test/knowledge/agent/a/tracking', {method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify({enabled})}),params:{id:'a'}});
 expect((await tracking(ctx,null,opts('token'))).status).toBe(401);
 expect((await tracking(ctx,{user:{role:'reader'}} as any,opts('token'))).status).toBe(403);
 expect((await tracking(ctx,session,opts('bad'))).status).toBe(403);
 expect((await tracking(ctx,session,opts('token','yes'))).status).toBe(400);
 expect((await tracking(ctx,session,opts('token'))).status).toBe(204);
});
