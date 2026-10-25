import {afterEach,describe,expect,test} from 'bun:test';
import catalog from './opencodeCatalog';
import models from './opencodeModels';
import routes from './opencodeDocumentedRoutes';
import opencodeFetch from './opencodeFetch';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
function markdown(plan='go') {
 const p='https://opencode.ai/inference'+(plan==='go'?'/go':'');
 return `# Models\n## Endpoints\n<div class="docs-table-scroll">\n| Model | Model ID | Endpoint | AI SDK Package |\n| --- | --- | --- | --- |\n| Chat Free | chat-free | \`${p}/openai/v1/chat/completions\` | @ai-sdk/openai |\n| Big Pickle | big-pickle | \`${p}/openai/v1/chat/completions\` | @ai-sdk/openai-compatible |\n| GPT | gpt | \`${p}/openai/v1/responses\` | @ai-sdk/openai-compatible |\n| Claude | claude | \`${p}/anthropic/v1/messages\` | @ai-sdk/openai |\n| Gemini | gemini | \`${p}/google/v1beta/models/gemini\` | @ai-sdk/openai |\n| Missing | missing | \`${p}/openai/v1/chat/completions\` | - |\n| Evil | evil | \`https://evil.test/inference/openai/v1/chat/completions\` | @ai-sdk/openai |\n| Unsupported | jev | \`${p}/systemone/v1/systemone\` | - |\n</div>\n## Pricing\n### Free models\n- Big Pickle is a stealth model that's free on OpenCode.\n`;
}
function fixture() {
 const meta={models:{'chat-free':{tool_call:true,provider:{npm:'@ai-sdk/anthropic',api:'https://evil.test'},reasoning_options:[{type:'effort',values:['low','high','max']}],limit:{context:123,output:45}},gpt:{tool_call:true},claude:{tool_call:true},gemini:{tool_call:true}}};
 const calls:any[]=[];const auth={key:'test-key' as string|null,plan:'go'};
 globalThis.fetch=(async (url:any,init:any)=>{calls.push({url,init});return url==='https://models.dev/api.json'?Response.json({'opencode-go':meta,opencode:meta}):new Response(markdown(auth.plan));}) as any;
 const ctx={state:{},fns:{settings:{getString:async({key}:any)=>key==='opencodeInstance'?'local':auth.plan},secrets:{resolveSetting:async()=>auth.key},procs:{log:{warn:async()=>{}}},llm:{opencodeDocumentedRoutes:(opts:any)=>routes(ctx as any,null,opts),opencodeFetch:async(opts:any)=>{if(opts.url.includes('/v2/docs/'))return opencodeFetch(ctx,null,opts);calls.push(opts);return Response.json({data:['chat-free','big-pickle','gpt','claude','gemini','missing','evil','unknown'].map(id=>({id}))});}}}} as any;
 ctx.fns.llm.opencodeCatalog=(opts:any)=>catalog(ctx,null,opts);
 return {ctx,calls,auth};
}
describe('OpenCode documented discovery',()=>{
 test('Go table overrides SDK/metadata URLs and preserves missing metadata',async()=>{
  const {ctx,calls}=fixture();const result=await catalog(ctx,null,{});
  expect(result.models.map(m=>[m.id,m.api])).toEqual([['chat-free','openai'],['big-pickle','openai'],['gpt','responses'],['claude','anthropic'],['gemini','gemini'],['missing','openai']]);
  expect(result.models[0]?.context).toBe(123);expect(result.models[0]?.output).toBe(45);
  expect(result.models[0]?.reasoning.supported).toEqual(['auto','low','high','xhigh']);
  expect(result.models[0]?.baseUrl).toBe('https://opencode.ai/inference/go/openai/v1');
  expect(result.models[4]?.baseUrl).toBe('https://opencode.ai/inference/go/google/v1beta');
  expect(result.models[5]?.reasoningOptions).toEqual([]);
  expect(result.models.every(m=>!m.public)).toBe(true);
  expect(await models(ctx,null,{})).toContain('chat-free');expect(calls.length).toBe(3);
  expect(calls.find(c=>c.url.endsWith('/v1/models')).url).toBe('https://opencode.ai/inference/go/v1/models');
  expect(calls.find(c=>c.url.endsWith('/console/go')).init.headers).toEqual({Accept:'text/markdown'});
  expect(calls.find(c=>c.url==='https://models.dev/api.json').init.headers).toBeUndefined();
  expect(calls.every(c=>c.init.redirect==='error')).toBe(true);
 });
 test('cache scoped to plan and credentials, cached reads never fetch',async()=>{
  const {ctx,calls,auth}=fixture();await catalog(ctx,null,{});
  expect((await catalog(ctx,null,{cachedOnly:true})).models.length).toBe(6);expect(calls.length).toBe(3);
  auth.key='changed';expect(await catalog(ctx,null,{cachedOnly:true})).toEqual({models:[],updatedAt:0});
  await catalog(ctx,null,{});expect(calls.length).toBe(6);
  auth.plan='payg';expect((await catalog(ctx,null,{cachedOnly:true})).models).toEqual([]);
  await catalog(ctx,null,{});expect(calls.some(c=>c.url==='https://opencode.ai/inference/v1/models')).toBe(true);
 });
 test('Go requires key; anonymous payg advertises documented public chat only',async()=>{
  const {ctx,calls,auth}=fixture();auth.key=null;
  expect((await catalog(ctx,null,{})).models).toEqual([]);expect(calls.length).toBe(0);
  auth.plan='payg';const result=await catalog(ctx,null,{});
  expect(result.models.map(m=>m.id)).toEqual(['chat-free','big-pickle']);
  expect(result.models.every(m=>m.public)).toBe(true);expect(calls.length).toBe(2);
 });
 test('single-flight refresh and errors do not poison later refresh',async()=>{
  const {ctx,calls}=fixture();const results=await Promise.all([catalog(ctx,null,{}),catalog(ctx,null,{})]);
  expect(results[0]).toBe(results[1]);expect(calls.length).toBe(3);
  ctx.fns.llm.opencodeFetch=async()=>new Response('bad',{status:500});
  await expect(catalog(ctx,null,{refresh:true})).rejects.toThrow('discovery failed');
  expect((await catalog(ctx,null,{cachedOnly:true})).models.length).toBe(6);
 });
 test('rejects alternate plan routes and arbitrary hosts or model path mismatch',async()=>{
  expect((await routes({} as any,null,{markdown:markdown('go'),plan:'go'})).length).toBe(6);
  await expect(routes({} as any,null,{markdown:markdown('payg'),plan:'go'})).rejects.toThrow('no supported routes');
  const only='## Endpoints\n| Gemini | gemini | https://opencode.ai/inference/go/google/v1beta/models/other | @ai-sdk/google |';
  await expect(routes({} as any,null,{markdown:only,plan:'go'})).rejects.toThrow();
 });
});
