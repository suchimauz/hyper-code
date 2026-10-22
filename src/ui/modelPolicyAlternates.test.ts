import { expect, test } from 'bun:test';
import parkedCard from './parkedCard';
import metaHtml from './agentMetaSectionHtml';
import newForm from '../agent/newForm';
import mobileOptions from '../api/$route_mobile_v1_new-agent-options_GET';
import button from '../procs/ui/button';
import escape from '../procs/ui/escape';
import attr from '../procs/ui/attr';

const renderCtx = async (): Promise<any> => {
  const ctx: any = { fns: { ui: {}, procs: { ui: {} } } };
  for (const [name, fn] of Object.entries({ button, escape, attr })) ctx.fns.procs.ui[name] = (opts: any) => fn(ctx, null, opts as never);
  return ctx;
};

const model = 'openai:gpt-5';
const alias = 'openai/default:gpt-5';
const named = 'openai/work:gpt-5';
const agent: any = { id: 'test', model: 'codex:gpt-5', scratchpad: { parked: { provider: 'codex' } } };

test('parked recovery disables aliases, excludes quick actions, preserves named routes and does not auto-select', async () => {
  const ctx = await renderCtx();
  const html = parkedCard(ctx, null, { agent, models: { openai: [model, alias, named] }, disabledModels: [model],
    accounts: [{ provider: 'openai', account: 'default', label: 'default', model: alias, available: true, usedPercent: null, resetsAt: null, parkedAgents: 0 }] });
  expect(html).toContain(`<option value="${model}" disabled>`);
  expect(html).toContain(`<option value="${alias}" disabled>`);
  expect(html).toContain(`<option value="${named}">`);
  expect(html).not.toContain(`name="model" value="${alias}"`);
  expect(html).not.toContain(`name="model" value="${model}"`);
  expect(html).toContain('<option value="" disabled selected>');
});

test('parked recovery has no enabled submit when all alternatives are disabled', async () => {
  const ctx = await renderCtx();
  const html = parkedCard(ctx, null, { agent, models: { openai: [alias] }, disabledModels: [model] });
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Switch<\/button>/);
});

test('Hyper default node stays distinct from provider default aliases', async () => {
  const ctx = await renderCtx();
  const html = parkedCard(ctx, null, { agent, models: { hyper: ['hyper/default:gpt-5', 'hyper:gpt-5'] }, disabledModels: ['hyper:gpt-5'] });
  expect(html).toContain('<option value="hyper/default:gpt-5">');
  expect(html).toContain('<option value="hyper:gpt-5" disabled>');
});

test('new form ignores disabled last and configured models without filtering catalog', async () => {
  let picked = '';
  const groups = { openai: [alias, named] };
  const ctx: any = { env: {}, fns: { procs: { db: { select: async () => [{ value: alias }] }, ui: { escape: (o: any) => String(o.text) } },
    llm: { listModels: async () => groups, modelPolicy: async () => ({ disabledModels: [model] }) },
    settings: { modelDefault: async () => alias }, agent: { getBasePromptParts: async () => ({}), listPromptPresets: async () => ({}), modelPickerHtml: async (o: any) => { picked = o.current; return ''; } } } };
  await newForm(ctx, null, {});
  expect(picked).toBe(named);
  expect(groups.openai).toEqual([alias, named]);
  ctx.fns.llm.modelPolicy = async () => ({ disabledModels: [model, named] });
  await newForm(ctx, null, {});
  expect(picked).toBe('');
});

test('mobile options retain disabled catalog entries and choose enabled default or empty', async () => {
  const ctx: any = { fns: { llm: { listModels: async () => ({ openai: [alias, named] }), modelPolicy: async () => ({ disabledModels: [model] }) }, settings: { modelDefault: async () => alias }, session: { list: async () => [] } } };
  let result = await (await mobileOptions(ctx, null, { req: new Request('http://localhost'), params: {} })).json();
  expect(result.defaultModel).toBe(named);
  expect(result.models).toEqual([{ provider: 'openai', model: alias, disabled: true }, { provider: 'openai', model: named, disabled: false }]);
  ctx.fns.llm.modelPolicy = async () => ({ disabledModels: [model, named] });
  result = await (await mobileOptions(ctx, null, { req: new Request('http://localhost'), params: {} })).json();
  expect(result.defaultModel).toBe('');
});

test('inspector redraw passes policy to renderer and propagates policy read failures', async () => {
  let passed: any;
  const ctx: any = { state: { agent: { test: agent } }, fns: { agent: { triggers: async () => [] }, llm: { listModels: async () => ({}), listAccounts: async () => [], modelPolicy: async () => ({ disabledModels: [model] }) }, ui: { agentMetaSection: (o: any) => { passed = o; return 'ok'; } } } };
  expect(await metaHtml(ctx, null, { agentId: 'test', section: 'automation' })).toBe('ok');
  expect(passed.disabledModels).toEqual([model]);
  ctx.fns.llm.modelPolicy = async () => { throw new Error('policy unavailable'); };
  await expect(metaHtml(ctx, null, { agentId: 'test', section: 'automation' })).rejects.toThrow('policy unavailable');
});
