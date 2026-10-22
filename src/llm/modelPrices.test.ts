import {test,expect} from 'bun:test';
import prices from './modelPrices';
import parse from './opencodeGoComparison';
const row=(name:string,requests:string,monthly:string)=>`<tr><th><bdi>${name}</bdi></th><td data-slot="bars"></td><td data-slot="number"><span>${requests}</span><span>440</span></td><td data-slot="number"><span>${monthly}</span><span>$60</span></td></tr>`;
const html=`<table><thead><tr><th>Model</th><th>Est. requests / 5h</th><th>Monthly usage</th></tr></thead><tbody>${row('Kimi K3','110','$15')}${row('Promo','<s>220</s><!--$-->440','<s>$30</s>$60')}${row('Free','∞','∞')}${row('Unmapped','1','$1')}</tbody></table>`;
const markdown='## Endpoints\n| Model | Model ID | Endpoint |\n| Kimi K3 | kimi-k3 | https://opencode.ai/inference/go/openai/v1/chat/completions |\n| Promo | promo | https://opencode.ai/inference/go/openai/v1/chat/completions |\n| Free | free | https://opencode.ai/inference/go/openai/v1/chat/completions |';
const fixture=()=>{const ctx:any={state:{},fns:{settings:{getString:async()=> 'go'},procs:{log:{warn:async()=>{}}},llm:{}}};ctx.fns.llm.opencodeGoComparison=(o:any)=>parse(ctx,null,o);return ctx as Context;};
test('official comparison parser matches exact IDs, removes crossed-out promos and preserves unlimited',async()=>{
 const r=await parse(fixture(),null,{html,markdown});expect(r['kimi-k3']).toMatchObject({go:{requests5h:110,monthlyUsd:15},plus:{requests5h:440,monthlyUsd:60}});expect(r.promo?.go).toEqual({requests5h:440,monthlyUsd:60});expect(r.free?.go).toEqual({requests5h:'unlimited',monthlyUsd:'unlimited'});expect(r.Unmapped).toBeUndefined();
 await expect(parse(fixture(),null,{html:'<table>Changed</table>',markdown})).rejects.toThrow('comparison table missing');
});
test('OpenCode loads official public page and docs only, caches limits and does not touch other providers',async()=>{
 const old=globalThis.fetch;const urls:string[]=[];globalThis.fetch=(async(url)=>{urls.push(String(url));return new Response(String(url).endsWith('/console/go')?markdown:html);}) as typeof fetch;
 try{const ctx=fixture();expect(await prices(ctx,null,{models:['openai:gpt','codex:gpt']})).toEqual({});expect(urls).toHaveLength(0);
 const r=await prices(ctx,null,{models:['opencode:kimi-k3','opencode:unpublished','openai:kimi-k3']});expect(r['opencode:kimi-k3']?.go?.requests5h).toBe(110);expect(r['opencode:kimi-k3']?.source).toBe('https://opencode.ai/go');expect(r['opencode:unpublished']?.go).toBeUndefined();expect(r['openai:kimi-k3']).toBeUndefined();await prices(ctx,null,{models:['opencode:kimi-k3']});expect(urls).toEqual(['https://opencode.ai/go','https://opencode.ai/v2/docs/console/go']);
 }finally{globalThis.fetch=old;}
});
test('unavailable source leaves unknowns and retains successful snapshot original time',async()=>{
 const old=globalThis.fetch;globalThis.fetch=(async()=>new Response('',{status:503})) as typeof fetch;
 try{const ctx=fixture();let r=await prices(ctx,null,{models:['opencode:kimi-k3']});expect(r['opencode:kimi-k3']?.go).toBeUndefined();
 (ctx.state as any).opencodeGoComparison={attemptAt:1,updatedAt:123,data:{'kimi-k3':{go:{requests5h:110,monthlyUsd:15},plus:{requests5h:440,monthlyUsd:60}}}};
 r=await prices(ctx,null,{models:['opencode:kimi-k3']});expect(r['opencode:kimi-k3']?.go?.requests5h).toBe(110);expect(r['opencode:kimi-k3']?.updatedAt).toBe(123);
 }finally{globalThis.fetch=old;}
});

test('View all rows come from official plan docs, including context tiers; sorted by Go requests with unlimited last',async()=>{
 const endpoints=markdown+'\n| Hidden | hidden | https://opencode.ai/inference/go/openai/v1/chat/completions |';
 const docs='## Usage limits\n<div slot="go">\n| Hidden (≤ 256K tokens) | $1 | **$15** |\n| Hidden (> 256K tokens) | $2 | **$15** |\n</div>\n<div slot="go-plus">\n| Hidden (≤ 256K tokens) | $1 | **$60** |\n</div>\n### Estimated requests\n<div slot="go">\n| Hidden | 160 | 400 |\n</div>\n<div slot="go-plus">\n| Hidden | 640 | 1600 |\n</div>\n'+endpoints;
 const result=await parse(fixture(),null,{html:html+'<button>View all 4 models</button>',markdown:docs});
 expect(Object.keys(result)).toEqual(['kimi-k3','hidden','promo','free']);expect(result.hidden).toMatchObject({go:{requests5h:160,monthlyUsd:15},plus:{requests5h:640,monthlyUsd:60},order:1});
 await expect(parse(fixture(),null,{html:html+'<button>View all 5 models</button>',markdown:docs})).rejects.toThrow('incomplete');
});
