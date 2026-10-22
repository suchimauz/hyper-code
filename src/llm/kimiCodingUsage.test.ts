import { test, expect } from 'bun:test';
import usage from './kimiCodingUsage';

const reset = (minutes: number) => new Date(Date.UTC(2026, 9, 22, 12, 0, 0) + minutes * 60000).toISOString();
// Live shape of GET /coding/v1/usages: used_ratio is a fraction, not a percent.
const payload = {
  limits: [{ window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: '100', remaining: '100', resetTime: reset(60) } }],
  usages: {
    limit_5h: { used_ratio: 0.25, reset_time: reset(300) },
    limit_7d: { used_ratio: 0.4, reset_time: reset(10080) },
    limit_month_total: { used_ratio: 0.5, reset_time: reset(43200) },
    limit_month_code: { used_ratio: 0.1, reset_time: reset(43200) },
  },
};

function setup(body: any = payload, status = 200, me: any = { user_level_name: 'Pro' }) {
  const requests: any[] = [];
  const respond = (o: any) => Response.json(String(o.url).endsWith('/me') ? me : body, { status });
  const ctx: any = { fns: {
    secrets: { resolveSetting: async () => 'test-key' },
    llm: {
      accountCredentialPath: () => ({ file: '/tmp/kimi-code.json' }),
      connectFetch: async (o: any) => { requests.push({ via: 'local', o }); return respond(o); },
    },
    sshAccount: { fetch: async (o: any) => { requests.push({ via: 'ssh', o }); return respond(o); } },
  } };
  return { ctx, requests };
}

test('Kimi quota scales used_ratio fractions into 5h, weekly and monthly windows', async () => {
  const { ctx } = setup();
  const r = await usage(ctx, null, {});
  expect(r.planType).toBe('Pro');
  expect(r.primary!.used_percent).toBe(25);
  expect(r.primary!.window_minutes).toBe(300);
  expect(r.secondary!.used_percent).toBe(40);
  expect(r.secondary!.window_minutes).toBe(10080);
  expect(r.tertiary!.used_percent).toBe(50);
  expect(r.tertiary!.window_minutes).toBe(43200);
  expect(r.tertiary!.resets_at).toBe(Date.parse(reset(43200)) / 1000);
});

test('Kimi quota falls back to the generic plan name when the profile fails or lacks a level', async () => {
  const failingMe: any = { fns: {
    secrets: { resolveSetting: async () => 'test-key' },
    llm: {
      accountCredentialPath: () => ({ file: '/tmp/kimi-code.json' }),
      connectFetch: async (o: any) => String(o.url).endsWith('/me') ? Promise.reject(new Error('me down')) : Response.json(payload),
    },
  } };
  expect((await usage(failingMe, null, {})).planType).toBe('Kimi Coding');
  const noLevel = setup(payload, 200, { nickname: 'x' });
  expect((await usage(noLevel.ctx, null, {})).planType).toBe('Kimi Coding');
});

test('Kimi quota asks the remote instance for its own credential', async () => {
  const { ctx, requests } = setup();
  const r = await usage(ctx, null, { account: 'ssh.edge.work' });
  expect(requests).toHaveLength(2);
  expect(requests[0].via).toBe('ssh');
  expect(requests[0].o.ssh).toEqual({ instance: 'edge', provider: 'kimi-coding', account: 'work' });
  expect(requests[0].o.url).toBe('https://api.kimi.com/coding/v1/usages');
  // The remote bridge defaults to POST; this endpoint only answers GET.
  expect(requests[0].o.init.method).toBe('GET');
  expect(requests[1].o.url).toBe('https://api.kimi.com/coding/v1/me');
  expect(r.primary!.used_percent).toBe(25);
  expect(r.planType).toBe('Pro');
});

test('Kimi quota rejects failures and unrecognized bodies instead of inventing windows', async () => {
  await expect(usage(setup(payload, 403).ctx, null, {})).rejects.toThrow('HTTP 403');
  await expect(usage(setup({}).ctx, null, {})).rejects.toThrow('Unrecognized');
  await expect(usage(setup({ usages: { limit_5h: { used_ratio: 0.5 } } }).ctx, null, {})).rejects.toThrow('No recognized');
});

test('Kimi quota rejects an account that is neither local nor an ssh identity', async () => {
  const { ctx } = setup();
  await expect(usage(ctx, null, { account: 'plain-name' })).rejects.toThrow('Not a Kimi Coding account');
});