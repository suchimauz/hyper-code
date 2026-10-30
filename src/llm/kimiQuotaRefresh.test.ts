import { test, expect } from 'bun:test';
import refreshUsage from './refreshUsage';

test('SSH Kimi refresh delegates once to normalized quota fetch without an unused bridge request', async () => {
  const calls: string[] = [];
  const quota = { planType: 'Pro', primary: { used_percent: 25, window_minutes: 300, resets_at: 1900000000 } };
  const ctx: any = { fns: {
    procs: { db: { select: async () => [], run: async () => ({ changes: 0 }) } },
    sshAccount: {
      registry: async () => [{ instance: 'hiplet-130862', provider: 'kimi-coding', account: 'ThienHoang', status: 'connected' }],
      fetchUsage: async () => { throw new Error('redundant bridge request'); },
    },
    llm: {
      kimiCodingUsage: async ({ account }: { account: string }) => { calls.push(account); return quota; },
      recordUsage: async (opts: any) => { expect(opts.rateLimits).toEqual(quota); },
      accountAuthHealth: async () => undefined,
    },
  } };
  const account = 'ssh.hiplet-130862.ThienHoang';
  const result = await refreshUsage(ctx, null, { accounts: [{ provider: 'kimi-coding', account }], maxAgeMs: 0 });
  expect(result).toEqual([{ provider: 'kimi-coding', account, status: 'refreshed', error: null }]);
  expect(calls).toEqual([account]);
});
