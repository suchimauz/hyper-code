import { test, expect } from 'bun:test';
import route from './$route_usage_GET';
import usageData from './usageData';
import listAccounts from '../llm/listAccounts';
import quotaAccounts from '../sshAccount/quotaAccounts';
import registry from '../sshAccount/registry';
import authorize from '../sshInstance/authorize';

for (const role of ['user', 'owner']) {
 test(`/llms/usage exposes SSH quotas for ${role} without administrative access`, async () => {
  const session = { user: { role } } as Session;
  const row = { instance: 'host', provider: 'codex', account: 'work', status: 'connected', updatedAt: 1, privateKey: 'DO_NOT_EXPORT' };
  const snapshot = { provider: 'codex', account: 'ssh.host.work', model: 'codex/ssh.host.work:', usedPercent: 42, updatedAt: 1 };
  const ctx: any = { env: { HOME: '' }, state: { llmUsageRefresh: { startedAt: Date.now() } }, fns: {
   procs: { db: { select: async () => [{ value: JSON.stringify(row) }] } },
   sshInstance: { list: async () => [{ name: 'host' }] },
   llm: { usageOverview: async () => [snapshot], accountAuthHealth: async () => [], accountCredentialExists: () => false, listModels: async () => ({ 'ssh/host': ['ssh/host:codex/work:test'] }) },
   node: { list: async () => [] },
   ui: { live: ({html}: any) => html },
  } };
  ctx.fns.sshAccount = {
   quotaAccounts: () => quotaAccounts(ctx, session, {}),
   requireOwner: () => authorize(ctx, session, {}),
   registry: (opts: any) => registry(ctx, session, opts),
  };
  ctx.fns.llm.listAccounts = () => listAccounts(ctx, session, { provider: 'codex' });
  ctx.fns.llms = { quotaData: () => usageData(ctx, session, {}) };
  const response = await route(ctx, session, {});
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body).toContain('"usedPercent":42');
  expect(body).toContain('ssh/host:codex/work:');
  expect(body).not.toContain('DO_NOT_EXPORT');
 });
}
