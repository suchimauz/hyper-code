import { describe, expect, test } from 'bun:test';
import list from './$route__GET';
import detail from './$route_$id_GET';
import create from './$route__POST';
import start from './$route_$id_start_POST';
import status from './$route_$id_status_POST';

const id = '00000000-0000-0000-0000-000000000001';
const task = { id, description: '<script>literal</script>', status: 'todo', agentId: null, workspaceMode: 'default', workspaceDir: null, createdAt: 1, updatedAt: 1 };
const owner = { user: { role: 'owner' } } as any;
function fixture(found = true) {
  const calls: string[] = [];
  const ctx = { fns: { auth: { csrfToken: async () => 'csrf', verifyCsrf: async ({ token }: { token: string }) => token === 'csrf' }, tasks: {
    list: async () => { calls.push('list'); return [task]; }, get: async () => { calls.push('get'); return found ? task : null; },
    create: async (data: object) => { calls.push('create'); return { ...task, ...data }; },
    start: async () => { calls.push('start'); return { ...task, agentId: 'ab', status: 'running' }; },
    setStatus: async (data: object) => { calls.push('status'); return { ...task, ...data }; },
  } } } as any;
  return { ctx, calls };
}
function opts(method = 'GET', body?: unknown, token = 'csrf') {
  return { params: { id }, req: new Request('https://hyper.example/tasks/' + id, { method, headers: { accept: 'application/json', 'content-type': 'application/json', 'x-csrf-token': token }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) };
}
describe('native Tasks JSON contracts (mock-only, no database or agent starts)', () => {
  for (const route of [list, detail, create, start, status]) {
    test(`${route === list ? 'list' : route === detail ? 'detail' : route === create ? 'create' : route === start ? 'start' : 'status'} denies non-owners before data access`, async () => {
      const { ctx, calls } = fixture();
      expect((await route(ctx, null, opts())).status).toBe(401);
      expect((await route(ctx, { user: { role: 'member' } } as any, opts())).status).toBe(403);
      expect(calls).toEqual([]);
    });
  }
  test('read returns tasks and cookie-bound CSRF, no mutation', async () => {
    const { ctx, calls } = fixture(); const response = await list(ctx, owner, opts());
    expect(await response.json()).toEqual({ tasks: [task], csrfToken: 'csrf' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(calls).toEqual(['list']);
    expect(await (await detail(ctx, owner, opts())).json()).toEqual({ task, csrfToken: 'csrf' });
  });
  test('HTML links redirect into the actual LiveApp view contract, preserving selection', async () => {
    const { ctx, calls } = fixture();
    const response = await list(ctx, owner, { params: {}, req: new Request('https://hyper.example/tasks?view=closed&q=hello') });
    const url = new URL(response.headers.get('location')!, 'https://hyper.example');
    expect(response.status).toBe(303); expect(url.searchParams.get('view')).toBe('extension:tasks/overview');
    expect(url.searchParams.get('taskView')).toBe('closed'); expect(url.searchParams.get('q')).toBe('hello');
    expect(calls).toEqual([]);
    const response2 = await detail(ctx, owner, { params: { id }, req: new Request('https://hyper.example/tasks/' + id) });
    expect(response2.headers.get('location')).toBe('/?view=extension:tasks/overview&task=' + id);
  });
  test('every write rejects absent/invalid CSRF before reading or mutating tasks', async () => {
    for (const route of [create, start, status]) {
      const { ctx, calls } = fixture();
      expect((await route(ctx, owner, opts('POST', {}, 'bad'))).status).toBe(403);
      expect(calls).toEqual([]);
    }
  });
  test('create validates description and workspace and never starts agent', async () => {
    const { ctx, calls } = fixture();
    for (const body of [null, {}, { description: 7 }, { description: ' ' }, { description: 'x', workspaceMode: 'elsewhere' }]) expect((await create(ctx, owner, opts('POST', body))).status).toBe(400);
    expect(calls).toEqual([]);
    const response = await create(ctx, owner, opts('POST', { description: ' Test ', workspaceMode: 'isolated' }));
    expect(response.status).toBe(201); expect((await response.json()).task.description).toBe('Test'); expect(calls).toEqual(['create']);
  });
  test('start and explicit status return updated attached task', async () => {
    const { ctx, calls } = fixture();
    expect((await (await start(ctx, owner, opts('POST', {}))).json()).task.agentId).toBe('ab');
    expect((await (await status(ctx, owner, opts('POST', { status: 'done' }))).json()).task.status).toBe('done');
    expect(calls).toEqual(['get', 'start', 'get', 'status']);
  });
  test('unknown status, malformed IDs and missing tasks never mutate', async () => {
    const { ctx, calls } = fixture(false);
    expect((await status(ctx, owner, opts('POST', { status: 'unknown' }))).status).toBe(400);
    expect((await start(ctx, owner, { ...opts('POST'), params: { id: 'bad' } })).status).toBe(400);
    expect(calls).toEqual([]);
    expect((await start(ctx, owner, opts('POST'))).status).toBe(404);
    expect((await status(ctx, owner, opts('POST', { status: 'done' }))).status).toBe(404);
    expect((await detail(ctx, owner, opts())).status).toBe(404);
    expect(calls).toEqual(['get', 'get', 'get']);
  });
});
