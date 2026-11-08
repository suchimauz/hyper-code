import {test, expect} from 'bun:test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// Leaf modules only; no second application is mounted.
const {default: authorize} = await import('./authorizeTerminal');
const {default: proxy} = await import('./proxy');
const {default: endpoint} = await import('../$ws_ui-lab_terminal');
const ORIGIN = 'http://127.0.0.1:5198';
const dir = mkdtempSync(join(tmpdir(), 'hyper-term-'));
const agents: Record<string, {workspace_dir: string; workspace_host: string}> = {
 a: {workspace_dir: dir, workspace_host: ''},
 remote: {workspace_dir: '/srv', workspace_host: 'box'},
 gone: {workspace_dir: join(dir, 'missing'), workspace_host: ''},
};
const owner = {user: {id: 'o', role: 'owner'}} as any;
const ctx: any = {fns: {
 http: {publicOrigin: async () => ORIGIN},
 procs: {db: {select: async ({params}: any) => agents[params[0]] ? [agents[params[0]]] : []}},
 frontendBridge: {authorizeTerminal: ({req}: any) => authorize(ctx, owner, {req})},
}};
const req = (query: string, {origin = ORIGIN, protocol = 'hyper-terminal', path = '/ui-lab/terminal'}: {origin?: string | null; protocol?: string; path?: string} = {}) =>
 new Request(ORIGIN + path + query, {headers: {...(origin ? {origin} : {}), 'sec-websocket-protocol': protocol, upgrade: 'websocket'}});

test('terminal handshake requires owner, same origin, subprotocol, valid agent and local workspace', async () => {
 const status = async (r: Request, s: any = owner) => { const out = await authorize(ctx, s, {req: r}); return out instanceof Response ? out.status : 200; };
 expect(await status(req('?agentId=a'), null)).toBe(401);
 expect(await status(req('?agentId=a'), {user: {id: 'u', role: 'member'}})).toBe(403);
 expect(await status(req('?agentId=a', {origin: null}))).toBe(403);
 expect(await status(req('?agentId=a', {origin: 'https://evil.example'}))).toBe(403);
 expect(await status(req('?agentId=a', {protocol: 'vite-hmr'}))).toBe(400);
 expect(await status(req('?agentId=a', {path: '/ui-lab/other'}))).toBe(400);
 expect(await status(req('?agentId=../x'))).toBe(400);
 expect(await status(req('?agentId=a&cols=9999'))).toBe(400);
 expect(await status(req('?agentId=nobody'))).toBe(404);
 expect(await status(req('?agentId=remote'))).toBe(409);
 expect(await status(req('?agentId=gone'))).toBe(409);
 expect(await authorize(ctx, owner, {req: req('?agentId=a&cols=100&rows=30')})).toEqual({agentId: 'a', cwd: dir, cols: 100, rows: 30});
});

test('proxy lets only the fixed terminal and HMR sockets through to their endpoints', async () => {
 const up = (path: string) => proxy(ctx, owner, {req: new Request(ORIGIN + path, {headers: {upgrade: 'websocket'}})});
 expect(await up('/ui-lab/terminal')).toBeUndefined();
 expect(await up('/ui-lab/hmr')).toBeUndefined();
 expect((await up('/ui-lab/shell'))?.status).toBe(404);
});

function serve(port: number) {
 return Bun.serve({hostname: '127.0.0.1', port, async fetch(r, server) {
  const state = await endpoint.upgrade(ctx, owner, {req: r});
  if (state instanceof Response) return state;
  if (server.upgrade(r, {data: {state, url: r.url}, headers: {'sec-websocket-protocol': 'hyper-terminal'}})) return;
  return new Response('upgrade failed', {status: 400});
 }, websocket: {
  open(ws) { endpoint.open(ctx, owner, {ws}); },
  message(ws, message) { endpoint.message(ctx, owner, {ws, message: message as any}); },
  close(ws) { endpoint.close(ctx, owner, {ws}); },
 }});
}
const connect = (query = '?agentId=a&cols=90&rows=20') => new WebSocket(`ws://127.0.0.1:5198/ui-lab/terminal${query}`, {protocols: ['hyper-terminal'], headers: {origin: ORIGIN}} as any);

test('live PTY runs in the workspace, resizes, and its shell dies when the socket closes', async () => {
 const server = serve(5198);
 try {
  const ws = connect();
  ws.binaryType = 'arraybuffer';
  let out = '';
  const decoder = new TextDecoder();
  const seen = (text: string) => new Promise<void>((resolve, reject) => {
   const timer = setTimeout(() => reject(new Error('timeout waiting for ' + text + ' in ' + JSON.stringify(out.slice(-400)))), 8000);
   const check = () => { if (out.includes(text)) { clearTimeout(timer); resolve(); } else setTimeout(check, 20); };
   check();
  });
  ws.onmessage = e => { out += typeof e.data === 'string' ? e.data : decoder.decode(e.data as ArrayBuffer, {stream: true}); };
  await seen('"type":"ready"');
  ws.send(JSON.stringify({type: 'input', data: 'echo "P=$(pwd)"; echo "C=$(tput cols)"; echo "PID=$$"\r'}));
  await seen('C=90');
  expect(out).toContain('P=' + dir);
  const pid = Number(/PID=(\d+)/.exec(out.slice(out.lastIndexOf('C=90')))?.[1]);
  expect(pid).toBeGreaterThan(0);
  ws.send(JSON.stringify({type: 'resize', cols: 120, rows: 40}));
  await Bun.sleep(100);
  ws.send(JSON.stringify({type: 'input', data: 'echo "W=$(tput cols)"\r'}));
  await seen('W=120');
  ws.close();
  const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
  for (let i = 0; i < 100 && alive(); i++) await Bun.sleep(50);
  expect(alive()).toBe(false);
 } finally { server.stop(true); }
}, 20000);

test('shell exit closes the socket with an exit frame; invalid frames close the session', async () => {
 const server = serve(5198);
 try {
  const ws = connect();
  const texts: string[] = [];
  ws.onmessage = e => { if (typeof e.data === 'string') texts.push(e.data); };
  const closed = new Promise<number>(resolve => { ws.onclose = e => resolve(e.code); });
  await new Promise(resolve => { ws.onopen = resolve; });
  await Bun.sleep(200);
  ws.send(JSON.stringify({type: 'input', data: 'exit 3\r'}));
  expect(await closed).toBe(1000);
  expect(texts.some(t => t.includes('"type":"exit"') && t.includes('"code":3'))).toBe(true);

  const bad = connect();
  const badClosed = new Promise<number>(resolve => { bad.onclose = e => resolve(e.code); });
  await new Promise(resolve => { bad.onopen = resolve; });
  bad.send('not json');
  expect(await badClosed).toBe(1003);
 } finally { server.stop(true); }
}, 20000);

test('at most four terminals run at once', async () => {
 const server = serve(5198);
 const sockets: WebSocket[] = [];
 try {
  for (let i = 0; i < 4; i++) {
   const ws = connect(); sockets.push(ws);
   await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  }
  const res = await fetch('http://127.0.0.1:5198/ui-lab/terminal?agentId=a', {headers: {origin: ORIGIN, 'sec-websocket-protocol': 'hyper-terminal', upgrade: 'websocket', connection: 'Upgrade', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', 'sec-websocket-version': '13'}});
  expect(res.status).toBe(429);
 } finally {
  for (const ws of sockets) ws.close();
  await Bun.sleep(300);
  server.stop(true);
 }
 expect(((globalThis as any).__hyperUiTerminals as Set<unknown>).size).toBe(0);
}, 20000);
