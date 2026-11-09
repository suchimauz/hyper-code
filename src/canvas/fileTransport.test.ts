import { describe, test, expect } from 'bun:test';
import route from './$route_$id_item_$itemId_POST';
import stateRoute from './$id/state/$route__GET';
import documentRoute from './$route_$id_item_$itemId_document_GET';
import authorizeHttp from './authorizeHttp';
import currentUser from '../auth/currentUser';
import csrfToken from '../auth/csrfToken';
import verifyCsrf from '../auth/verifyCsrf';

function fixture(options: { missing?: boolean; private?: boolean; directory?: boolean; binary?: boolean; user?: string; role?: string; archived?: boolean; csrf?: 'missing' | 'wrong'; anonymous?: boolean } = {}) {
  let written: unknown;
  const ctx = { fns: {
    canvas: { authorizeHttp: (opts: any) => authorizeHttp(ctx, null, opts), get: async () => ({}), revision: async () => ({panel:'rev'}), itemDocument: async () => new Response('document'), list: async ({ agentId }: { agentId: string }) => agentId === 'owner' && !options.missing ? [{ id: 7, kind: 'file', args: { path: '/safe/file', host: 'local' } }] : [] },
    files: { rawResponse: async ({path}: {path:string}) => { expect(path).toBe('/safe/file'); return new Response('raw', {headers:{'content-type':'text/html'}}); }, isPrivateResult: async () => !!options.private, stat: async () => ({ size: 12, isDir: !!options.directory }), list: async () => [{ name: 'hello', isDir: false }], read: async () => options.binary ? '\0binary' : 'original', write: async (opts: unknown) => { written = opts; } },
  } } as any;
  const user = {id: options.user ?? 'alice', role: options.role ?? 'member', canSignIn:true};
  ctx.state = {};
  ctx.fns.auth = {
    currentUser: (opts: any) => currentUser(ctx, null, opts),
    csrfToken: (opts: any) => csrfToken(ctx, null, opts),
    verifyCsrf: (opts: any) => verifyCsrf(ctx, null, opts),
    portalIdentity: async () => null, oidcOnly: async () => false,
    listUsers: async () => [user, {id:'bob',canSignIn:true}],
    getUser: async ({id}: any) => id === user.id ? user : null,
  };
  ctx.fns.procs = {auth:{
    cookieName: () => 'session',
    verify: async ({token}: any) => token === 'signed-session' ? {sub:user.id, exp:Math.floor(Date.now()/1000)+3600} : null,
    authenticate: async ({req}: any) => req.headers.get('cookie') === 'session=signed-session' ? {sub:user.id} : null,
  }, db:{select:async ({sql,params}: any) => {
    expect(sql).toContain('archived_at IS NULL');
    return !options.archived && params[0] === 'owner' ? [{created_by:'alice'}] : [];
  }}};
  const request = async (method: string, body?: object) => {
    const headers: Record<string,string> = options.anonymous ? {} : {cookie:'session=signed-session'};
    if (!options.anonymous && options.csrf !== 'missing') headers['x-csrf-token'] = options.csrf === 'wrong' ? 'forged' : await csrfToken(ctx,null,{req:new Request('http://localhost',{headers})});
    return new Request('http://localhost/canvas/owner/item/7',{method,headers,...(body ? {body:JSON.stringify(body)} : {})});
  };
  const call = async (body: object, agent = 'owner') => route(ctx, null, { req: await request('POST',body), params: { id: agent, itemId: '7' } });
  const state = async () => stateRoute(ctx,null,{req:await request('GET'),params:{id:'owner'}});
  const document = async () => documentRoute(ctx,null,{req:await request('GET'),params:{id:'owner',itemId:'7'}});
  return { call, state, document, written: () => written };
}
describe('React Canvas file transport', () => {
  test('raw file responses cannot execute as the application origin', async () => {
    const response = await fixture().document();
    expect(await response.text()).toBe('raw');
    expect(response.headers.get('content-security-policy')).toContain('sandbox;');
    expect(response.headers.get('content-security-policy')).not.toContain('allow-same-origin');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  test('authenticated member can access their own agent', async () => {
    const f = fixture(); expect((await f.state()).status).toBe(200); expect((await f.document()).status).toBe(200);
  });
  for (const options of [{user:'bob'}, {user:'bob',role:'owner'}, {archived:true}, {anonymous:true}]) {
    test(`reject unauthorized target ${JSON.stringify(options)} before any disclosure or mutation`, async () => {
      const f = fixture(options); const status = 'anonymous' in options ? 401 : 404;
      expect((await f.state()).status).toBe(status); expect((await f.document()).status).toBe(status);
      for (const fileAction of ['read','save']) expect((await f.call({fileAction,content:'new',expectedContent:'original'})).status).toBe(status);
      expect(f.written()).toBeUndefined();
    });
  }
  for (const csrf of ['missing','wrong'] as const) test(`reject ${csrf} cookie-bound CSRF`, async () => {
    const f = fixture({csrf});
    for(const fileAction of ['read','save']) expect((await f.call({fileAction,content:'new',expectedContent:'original'})).status).toBe(403);
    expect(f.written()).toBeUndefined();
  });
  test('reads only stored target and refuses other agents', async () => {
    const f = fixture();
    expect(await (await f.call({ fileAction: 'read', path: '/attacker' })).json()).toEqual({ path: '/safe/file', content: 'original', previewKind: 'text' });
    expect((await f.call({ fileAction: 'read' }, 'other')).status).toBe(404);
  });
  test('private results are not exposed', async () => { expect((await fixture({ private: true }).call({ fileAction: 'read' })).status).toBe(404); });
  test('save detects conflicts and does not write', async () => {
    const f = fixture(); expect((await f.call({ fileAction: 'save', content: 'new', expectedContent: 'stale' })).status).toBe(409); expect(f.written()).toBeUndefined();
  });
  test('explicit save uses pinned target', async () => {
    const f = fixture(); expect((await f.call({ fileAction: 'save', content: 'new', expectedContent: 'original' })).status).toBe(200);
    expect(f.written()).toEqual({ path: '/safe/file', host: undefined, content: 'new', expectedContent: 'original' });
  });
  test('directories list but cannot be overwritten', async () => {
    const f = fixture({ directory: true }); expect(await (await f.call({ fileAction: 'read' })).json()).toMatchObject({isDir:true}); expect((await f.call({ fileAction: 'save', content: '' })).status).toBe(400);
  });
  test('binary files retain safe preview transport', async () => { expect(await (await fixture({ binary: true }).call({ fileAction: 'read' })).json()).toMatchObject({preview:true}); });
});
