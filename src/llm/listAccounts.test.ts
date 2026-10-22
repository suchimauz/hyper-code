import { expect, test } from 'bun:test';
import listAccounts from './listAccounts';
import mobileRoute from '../llms/$route_mobileUsage_GET';
import usageData from '../llms/usageData';

function fixture(measured: boolean) {
 const snapshot = { provider: 'zai-coding', account: 'default', label: 'Z.ai', model: 'zai-coding:', usedPercent: 32, resetsAt: null, planType: 'lite', parkedAgents: 0, tone: 'neutral', updatedAt: Date.now(), thresholds: { warnAt: 40, criticalAt: 70, alertAt: 80 } };
 const ctx: any = { state: {}, fns: {
  llm: {
   usageOverview: async () => measured ? [snapshot] : [],
   accountAuthHealth: async () => [],
   refreshUsage: async () => [],
   listModels: async () => ({ 'zai-coding': ['zai-coding:glm-5.3'] }),
  },
  settings: { get: async ({ key }: { key: string }) => key === 'zaiCodingApiKey' ? 'secret://test/reference' : null },
  node: { list: async () => [] },
  ui: { modelLogo: () => '<svg></svg>' },
 } };
 // Real inventory helper: do not mock away the scope error that broke mobile.
 ctx.fns.llm.listAccounts = () => listAccounts(ctx, null, { provider: 'zai-coding' });
 ctx.fns.llms = { usageData: (opts: any) => usageData(ctx, null, opts) };
 return ctx;
}

test('Coding Plan inventory inherits measured thresholds and safely defaults without snapshots', async () => {
 for (const measured of [true, false]) {
  const rows = await listAccounts(fixture(measured), null, { provider: 'zai-coding' });
  expect(rows).toHaveLength(1);
  expect(rows[0]!.thresholds).toEqual(measured ? { warnAt: 40, criticalAt: 70, alertAt: 80 } : { warnAt: 30, criticalAt: 60, alertAt: 75 });
 }
});

test('mobile endpoint reads real connected Coding Plan inventory without throwing', async () => {
 for (const measured of [true, false]) {
  const response = await mobileRoute(fixture(measured), null, { req: new Request('https://local/llms/mobileUsage') });
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.entries).toHaveLength(1);
  expect(data.entries[0].provider).toBe('zai-coding');
  expect(data.entries[0].usedPercent).toBe(measured ? 32 : null);
 }
});

test('OpenCode inventory is reference-only and has no subscription quota', async () => {
 const ctx = fixture(false);
 let configured = true;
 ctx.fns.settings.get = async ({key}: {key:string}) => configured && key === 'opencodeApiKey' ? 'secret://test/opencode' : null;
 const rows = await listAccounts(ctx,null,{provider:'opencode'});
 expect(rows).toHaveLength(1);
 expect(rows[0]).toMatchObject({provider:'opencode',account:'default',model:'opencode:',label:'OpenCode Console',planType:'Pay as you go',usedPercent:null,windows:null,resetsAt:null,available:true});
 expect(JSON.stringify(rows)).not.toContain('secret://');
 configured=false;
 expect(await listAccounts(ctx,null,{provider:'opencode'})).toEqual([]);
});
