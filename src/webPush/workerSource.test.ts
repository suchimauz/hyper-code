import { expect, test } from 'bun:test';
import workerSource from './workerSource';
import route from './$route_web-push-sw.js_GET';
import middleware from '../$middleware';

async function fixture() {
  const handlers: Record<string, Function> = {}, shown: any[] = [], opened: string[] = [];
  let focused = 0;
  const self = { location: { origin: 'https://hyper.test' }, addEventListener: (name: string, fn: Function) => handlers[name] = fn,
    registration: { showNotification: async (...args: any[]) => { shown.push(args); } },
    clients: { matchAll: async () => [{ url: 'https://hyper.test/a/ab', focus: async () => { focused++; } }], openWindow: async (url: string) => { opened.push(url); } } };
  new Function('self', await workerSource({} as Context, null, {}))(self);
  async function push(data: any) { let work: any; handlers.push({ data: { json: () => data }, waitUntil: (p: any) => work = p }); await work; }
  async function click(url: string) { let work: any; handlers.notificationclick({ notification: { data: { url }, close() {} }, waitUntil: (p: any) => work = p }); await work; }
  return { handlers, shown, opened, push, click, focused: () => focused };
}
test('worker parses, registers no fetch handler, ignores injected payload text and rejects unsafe links', async () => {
  const f = await fixture();
  expect(Object.keys(f.handlers).sort()).toEqual(['notificationclick', 'push']);
  for (const url of ['https://evil.test/a/ab', '//evil.test/a/ab', '/auth/logout', '/a/ab?next=https://evil.test', '/a/../logout', '/a/%61b']) await f.push({ url });
  expect(f.shown).toHaveLength(0);
  await f.push({ url: '/a/ab', title: 'SECRET', body: 'SECRET', tag: 'input-123' });
  expect(f.shown[0][0]).toBe('Hyper');
  expect(f.shown[0][1].body).toBe('Агент ждёт вашего действия');
  expect(JSON.stringify(f.shown)).not.toContain('SECRET');
});
test('worker focuses matching chat or opens safe chat, rejects cross-origin and non-chat click data', async () => {
  const f = await fixture();
  await f.click('https://hyper.test/a/ab'); expect(f.focused()).toBe(1);
  await f.click('https://hyper.test/a/cd'); expect(f.opened).toEqual(['https://hyper.test/a/cd']);
  for (const url of ['https://evil.test/a/ab', 'https://hyper.test/auth/logout', 'https://hyper.test/a/ab?x=1']) await f.click(url);
  expect(f.opened).toHaveLength(1);
});
test('worker response has root scope, no-store, JavaScript MIME and only exact GET/HEAD route bypasses auth', async () => {
  const response = await route({ fns: { webPush: { workerSource: async () => 'script' } } } as any, null, { req: new Request('https://hyper.test/webPush/web-push-sw.js'), params: {} });
  expect(response.headers.get('service-worker-allowed')).toBe('/');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('content-type')).toContain('application/javascript');
  const ctx: any = { fns: { h2: { redirect: () => undefined }, auth: { currentUser: async () => ({ required: true, user: null }) } } };
  for (const method of ['GET', 'HEAD']) expect(await middleware(ctx, null, { req: new Request('https://hyper.test/webPush/web-push-sw.js', { method }) })).toBeUndefined();
  for (const [path, method] of [['/webPush/web-push-sw.js', 'POST'], ['/webPush/config', 'GET'], ['/webPush/web-push-sw.js/extra', 'GET']]) expect((await middleware(ctx, null, { req: new Request('https://hyper.test' + path, { method }) }))?.status).toBe(401);
});
test('worker displays bounded project and agent labels without accepting arbitrary body', async () => {
 const f=await fixture();
 await f.push({url:'/a/ab',projectName:'vpnator',agentName:'spec-002',body:'PRIVATE'});
 expect(f.shown[0][0]).toBe('vpnator · spec-002');
 expect(f.shown[0][1].body).toBe('Агент ждёт вашего действия');
 await f.push({url:'/a/ab',projectName:123,agentName:'  Agent\nname\u202e '});
 expect(f.shown[1][0]).toBe('Agent name');
 await f.push({url:'/a/ab',projectName:'p'.repeat(200),agentName:'a'.repeat(200)});
 expect(f.shown[2][0].length).toBe(163);
});
test('typed error has fixed safe body; unknown categories rejected and legacy input retained', async () => {
 const f=await fixture();
 for(const type of [null,'fatal','ERROR',{},3]) await f.push({type,url:'/a/ab'});
 expect(f.shown).toHaveLength(0);
 await f.push({type:'error',url:'/a/ab',tag:'error-123',projectName:'Project',agentName:'Agent',body:'secret https://evil.test'});
 expect(f.shown[0][0]).toBe('Project · Agent');
 expect(f.shown[0][1].body).toBe('Работа агента остановлена из-за ошибки');
 expect(f.shown[0][1].tag).toBe('error-123');
 expect(JSON.stringify(f.shown)).not.toContain('secret');
 await f.push({type:'input',url:'/a/ab',tag:'error-123'});
 expect(f.shown[1][1].tag).toBe('hyper-input');
});
