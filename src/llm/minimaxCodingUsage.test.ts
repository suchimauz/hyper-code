import { test, expect } from 'bun:test';
import usage from './minimaxCodingUsage';
import refresh from './refreshUsage';

const now = 1792645579000;
// Live shape of GET /v1/token_plan/remains: remaining percent, not used.
const payload = { model_remains: [
  { model_name: 'general', start_time: now, end_time: now + 3600000, remains_time: 3500000,
    current_interval_total_count: 0, current_interval_usage_count: 0,
    weekly_start_time: now, weekly_end_time: now + 86400000, weekly_remains_time: 600000000,
    current_interval_status: 1, current_interval_remaining_percent: 80,
    current_weekly_status: 1, current_weekly_remaining_percent: 93 },
  { model_name: 'video', end_time: now + 3600000, weekly_end_time: now + 86400000,
    current_interval_remaining_percent: 1, current_weekly_remaining_percent: 1 },
], base_resp: { status_code: 0, status_msg: 'success' } };

function setup(body: any = payload, status = 200) {
  const requests: any[] = [];
  const ctx: any = { fns: {
    secrets: { resolveSetting: async () => 'test-key' },
    llm: { connectFetch: async (o: any) => { requests.push(o); return Response.json(body, { status }); } },
  } };
  return { ctx, requests };
}

test('MiniMax quota inverts remaining percent into used 5h and weekly windows and ignores video', async () => {
  const { ctx, requests } = setup();
  const r = await usage(ctx, null, {});
  expect(r.primary).toEqual({ used_percent: 20, window_minutes: 300, resets_at: (now + 3600000) / 1000 });
  expect(r.secondary).toEqual({ used_percent: 7, window_minutes: 10080, resets_at: (now + 86400000) / 1000 });
  expect(r.planType).toBe('M Plan');
  expect(requests[0].url).toBe('https://www.minimax.io/v1/token_plan/remains');
  expect(requests[0].init.headers.authorization).toBe('Bearer test-key');
  expect(requests[0].init.redirect).toBe('error');
});

test('MiniMax quota makes no request without credentials', async () => {
  const { ctx, requests } = setup({});
  const c2: any = { ...ctx, fns: { ...ctx.fns, secrets: { resolveSetting: async () => null } } };
  await expect(usage(c2, null, {})).rejects.toThrow('not configured');
  expect(requests).toHaveLength(0);
});

test('MiniMax quota rejects failed or unrecognized responses without inventing windows', async () => {
  const http = setup(payload, 403);
  await expect(usage(http.ctx, null, {})).rejects.toThrow('HTTP 403');
  const shape = setup({ model_remains: [{ model_name: 'general' }], base_resp: { status_code: 0 } });
  await expect(usage(shape.ctx, null, {})).rejects.toThrow('No recognized');
  const status = setup({ model_remains: [], base_resp: { status_code: 1021, status_msg: 'no plan' } });
  await expect(usage(status.ctx, null, {})).rejects.toThrow('no plan');
});

test('refreshUsage persists MiniMax windows and reuses the recent refresh', async () => {
  let cache: any; let snapshot: any;
  const ctx: any = { fns: {
    llm: {
      minimaxCodingUsage: async () => ({ planType: 'M Plan', primary: { used_percent: 20, window_minutes: 300, resets_at: 1792649179 }, secondary: { used_percent: 7, window_minutes: 10080, resets_at: 1792731979 } }),
      recordUsage: async (o: any) => { snapshot = o; return null; },
      accountAuthHealth: async () => ({}),
    },
    procs: { db: { select: async () => cache ? [{ value: cache }] : [], run: async (o: any) => { if (o.sql.startsWith('INSERT')) cache = o.params[1]; return { changes: 1 }; } }, events: { emit: async () => {} }, log: { warn: async () => {} } },
  } };
  const opts = { accounts: [{ provider: 'minimax-coding', account: 'default' }], now, maxAgeMs: 60000 };
  expect((await refresh(ctx, null, opts))[0]?.status).toBe('refreshed');
  expect(snapshot.provider).toBe('minimax-coding');
  expect(snapshot.rateLimits.secondary.used_percent).toBe(7);
  expect((await refresh(ctx, null, opts))[0]?.status).toBe('cached');
});

test('MiniMax usage leaves through the chosen SSH instance while the plan key stays local',async()=>{
 const fetched:any[]=[];
 const ctx:any={fns:{secrets:{resolveSetting:async()=>'test-key'},llm:{codingInstance:async()=>({instance:'edge'}),connectFetch:async(o:any)=>{fetched.push({via:'local',o});return Response.json(payload);}},sshAccount:{fetch:async(o:any)=>{fetched.push({via:'ssh',o});return Response.json(payload);}}}};
 const r=await usage(ctx,null,{});
 expect(fetched).toHaveLength(1);expect(fetched[0].via).toBe('ssh');
 expect(fetched[0].o.ssh).toEqual({instance:'edge',provider:'minimax-coding',account:'default'});
 expect(fetched[0].o.url).toBe('https://www.minimax.io/v1/token_plan/remains');
 expect(fetched[0].o.init.headers.authorization).toBe('Bearer test-key');
 expect(r.primary!.used_percent).toBe(20);
});
