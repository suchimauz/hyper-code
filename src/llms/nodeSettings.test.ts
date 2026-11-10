import { expect, test } from 'bun:test';
import rawGuard from './settingsApi';
const api = (ctx: any, session: any, opts: any) => { ctx.fns.auth.currentUser = async () => ({required: true, user: session?.user ?? null}); return rawGuard(ctx, session, opts); };
import accounts from './$route_accounts_GET';
import login from './$route_$provider_login_POST';
import card from '../node/$route_card_GET';
const owner = { user: { role: 'owner' } } as any;
test('sharing writes require owner, CSRF, origin and explicit confirmation; tokens are no-store', async () => {
 const writes: object[] = [];
 const ctx: any = { fns: { auth: { verifyCsrf: async ({ token }: any) => token === 'csrf' }, http: { publicOrigin: async () => 'https://mauzcode.test' }, node: {
  issueClient: async (o: object) => { writes.push(o); return { token: 'new-token', url: 'https://node/node/v1' }; },
  revokeClient: async (o: object) => { writes.push(o); return { revoked: true }; },
  add: async (o: object) => { writes.push(o); }, refresh: async (o: object) => { writes.push(o); },
 } } };
 const req = (body: object, token = 'csrf', origin = 'https://mauzcode.test') => new Request('https://mauzcode.test/llms/settings', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': token, origin }, body: JSON.stringify(body) });
 const issue = { action: 'client-issue', name: 'laptop', providers: ['codex'], confirmed: true };
 expect((await api(ctx, null, { req: req(issue) })).status).toBe(401);
 expect((await api(ctx, { user: { role: 'member' } } as any, { req: req(issue) })).status).toBe(403);
 expect((await api(ctx, owner, { req: req(issue, 'bad') })).status).toBe(403);
 expect((await api(ctx, owner, { req: req(issue, 'csrf', 'https://evil.test') })).status).toBe(403);
 for (const body of [{ ...issue, confirmed: false }, { action: 'client-revoke', id: 'id' }, { action: 'node-save', name: 'node', url: 'https://user:pass@node', token: '' }]) expect((await api(ctx, owner, { req: req(body) })).status).toBe(400);
 expect(writes).toEqual([]);
 const issued = await api(ctx, owner, { req: req(issue) });
 expect(issued.headers.get('cache-control')).toBe('no-store'); expect((await issued.json()).token).toBe('new-token');
 expect((await api(ctx, owner, { req: req({ action: 'client-revoke', id: 'id', confirmed: true }) })).status).toBe(200);
 expect((await api(ctx, owner, { req: req({ action: 'node-save', name: 'node', url: 'https://node/node/v1', token: 'secret' }) })).status).toBe(200);
 expect(writes).toEqual([{ name: 'laptop', providers: ['codex'] }, { id: 'id' }, { name: 'node', url: 'https://node/node/v1', token: 'secret' }]);
});
test('retired account, node and login fragments redirect without reads or mutations', () => {
 for (const route of [accounts, login, card]) {
  const response = route({} as any, null, {});
  expect(response.status).toBe(303); expect(response.headers.get('location')).toBe('/?settings=llm-connections');
 }
});
