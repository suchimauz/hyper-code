import { describe, expect, test } from 'bun:test';
import route from './$route_$id_tool_$runId_abort_POST';

describe('explicit tool abort authorization', () => {
  function fixture() {
    const calls: string[] = [];
    const ctx: any = { state: {}, fns: {
      auth: { currentUser: async () => ({ user: { id: 'owner', disabledAt: null } }), verifyCsrf: async ({ token }: any) => token === 'csrf' },
      procs: { db: { select: async () => [{ created_by: 'owner', archived_at: null }] }, events: { refresh: () => calls.push('refresh') } },
      tools: { runs: ({ agentId }: any) => agentId === 'a' ? [{ id: 'run', name: 'bash', subject: 'sleep', startedAt: Date.now() }] : [], abortRun: () => { calls.push('abort'); return { aborted: true }; } },
      session: { appendEvent: async ({ event }: any) => { calls.push(event.runId); } },
    } };
    const invoke = (token = 'csrf', id = 'a', runId = 'run') => route(ctx, null, { req: new Request('http://localhost/agent/a/tool/run/abort', { method: 'POST', headers: { 'x-csrf-token': token } }), params: { id, runId } });
    return { ctx, calls, invoke };
  }
  test('owner exact run only, preserves run id in receipt', async () => { const f = fixture(); expect((await f.invoke()).status).toBe(200); expect(f.calls).toEqual(['abort', 'run', 'refresh']); });
  test('CSRF rejection never aborts', async () => { const f = fixture(); expect((await f.invoke('')).status).toBe(403); expect(f.calls).toEqual([]); });
  test('nonowner rejection never aborts', async () => { const f = fixture(); f.ctx.fns.procs.db.select = async () => [{ created_by: 'other' }]; expect((await f.invoke()).status).toBe(403); expect(f.calls).toEqual([]); });
  test('unauthenticated rejection never aborts', async () => { const f = fixture(); f.ctx.fns.auth.currentUser = async () => ({ user: null }); expect((await f.invoke()).status).toBe(401); expect(f.calls).toEqual([]); });
  test('stale run or wrong agent never aborts', async () => { const f = fixture(); expect((await f.invoke('csrf', 'a', 'stale')).status).toBe(404); expect((await f.invoke('csrf', 'b')).status).toBe(404); expect(f.calls).toEqual([]); });
});
