import { expect, test } from 'bun:test';
import sample from './sample';
import status from './$route_status_GET';

test('metrics endpoint rejects anonymous and members before sampling', async () => {
  const opts = { req: new Request('http://localhost/serverMetrics/status'), params: {} };
  expect((await status({} as any, null, opts)).status).toBe(401);
  expect((await status({} as any, { user: { role: 'member' } } as any, opts)).status).toBe(403);
});
test('owner endpoint requests details explicitly, disables HTTP caching and hides failures', async () => {
  const owner = { user: { role: 'owner' } } as any;
  const ctx = { fns: { serverMetrics: { sample: async (opts: {details: boolean}) => ({ details: opts.details }) } } } as any;
  const response = await status(ctx, owner, { req: new Request('http://localhost/serverMetrics/status?details=1'), params: {} });
  expect(await response.json()).toEqual({ details: true });
  expect(response.headers.get('cache-control')).toBe('no-store');
  ctx.fns.serverMetrics.sample = () => { throw Error('sensitive path'); };
  const failure = await status(ctx, owner, { req: new Request('http://localhost/serverMetrics/status'), params: {} });
  expect(failure.status).toBe(503);
  expect(await failure.text()).not.toContain('sensitive');
});
test('real server sampling caches summaries and bounds safe process fields', async () => {
  const ctx = { state: {}, fns: { serverMetrics: {} } } as any;
  ctx.fns.serverMetrics.sample = (opts: {details?: boolean}) => sample(ctx, null, opts);
  const summary = await sample(ctx, null, {});
  expect(summary.memory.total).toBeGreaterThan(0);
  expect(summary.cpu).toBeNull();
  expect(summary.processes).toBeUndefined();
  expect(await sample(ctx, null, {})).toBe(summary);
  const details = await sample(ctx, null, { details: true });
  expect(details.cores.length).toBeGreaterThan(0);
  if (process.platform === 'linux') {
    expect(details.swap).not.toBeNull();
    expect(details.processes!.length).toBeLessThanOrEqual(200);
    for (const row of details.processes!) expect(Object.keys(row).sort()).toEqual(['cpu', 'name', 'pid', 'rss', 'state']);
  }
  expect((await sample(ctx, null, {})).processes).toBeUndefined();
});
