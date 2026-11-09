import { expect, test } from 'bun:test';
import dialogs from './$route_api_dialogs_GET';
import messages from './$route_api_messages_GET';
import avatar from './$route_api_avatar_$userId_GET';
import send from './$route_api_send_POST';
import page from './$route__GET';
function context(role: string | null, csrf = true) {
  const calls: object[] = [];
  const ctx = { fns: { auth: { currentUser: async () => ({ required: true, user: role ? { role } : null }), verifyCsrf: async () => csrf, csrfToken: async () => 'bound' }, telegram: { mirror: async () => ({ dialogs: [] }), send: async (opts: object) => { calls.push(opts); return { id: 1 }; } } } } as any;
  return { ctx, calls };
}
const opts = (body: object = {}) => ({ req: new Request('https://hyper.test/telegram/api/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), params: {} });
test('Telegram native page redirect has no HTML client', async () => {
  const result = await page({} as any, null, opts());
  expect(result.status).toBe(302); expect(result.headers.get('location')).toBe('/?view=extension:telegram/overview'); expect(await result.text()).toBe('');
});
test('all personal JSON/avatar reads require authenticated owner before accessing data', async () => {
  for (const fn of [dialogs, messages, avatar]) for (const role of [null, 'member']) {
    const { ctx } = context(role); expect((await fn(ctx, null, opts())).status).toBe(role ? 403 : 401);
  }
  const { ctx } = context('owner'); const response = await dialogs(ctx, null, opts());
  expect(await response.json()).toEqual({ dialogs: [], csrfToken: 'bound' });
});
test('send rejects missing owner, CSRF and explicit confirmation without sending; valid mock sends exact snapshot', async () => {
  for (const [role, csrf, confirm, status] of [[null, true, true, 401], ['member', true, true, 403], ['owner', false, true, 403], ['owner', true, false, 409]] as const) {
    const { ctx, calls } = context(role, csrf); const response = await send(ctx, null, opts({ chat: '123', text: 'hello', confirm }));
    expect(response.status).toBe(status); expect(calls).toHaveLength(0);
  }
  const { ctx, calls } = context('owner'); expect((await send(ctx, null, opts({ chat: '123', text: 'hello', confirm: true }))).status).toBe(200);
  expect(calls).toEqual([{ chat: '123', text: 'hello', confirm: true }]);
});
