import { expect, test } from 'bun:test';
import mobileOptions from '../api/$route_v1_new-agent-options_GET';
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

test('mobile options retain disabled catalog entries and choose enabled default or empty', async () => {
  const ctx: any = { fns: { llm: { listModels: async () => ({ openai: [alias, named] }), modelPolicy: async () => ({ disabledModels: [model] }) }, settings: { modelDefault: async () => alias }, session: { list: async () => [] } } };
  let result = await (await mobileOptions(ctx, null, { req: new Request('http://localhost'), params: {} })).json();
  expect(result.defaultModel).toBe(named);
  expect(result.models).toEqual([{ provider: 'openai', model: alias, disabled: true }, { provider: 'openai', model: named, disabled: false }]);
  ctx.fns.llm.modelPolicy = async () => ({ disabledModels: [model, named] });
  result = await (await mobileOptions(ctx, null, { req: new Request('http://localhost'), params: {} })).json();
  expect(result.defaultModel).toBe('');
});
