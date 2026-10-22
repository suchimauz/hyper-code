import {test,expect} from 'bun:test';
import quota from './opencodeGoUsage';
import transport from './opencodeFetch';
import refresh from './refreshUsage';
import record from './recordUsage';
import overview from './usageOverview';
const reset='2026-11-22T15:32:29.000Z';
const body=()=>({usage:{rolling:{status:'ok',percent:12,resetsAt:reset},weekly:{status:'ok',percent:35,resetsAt:reset},monthly:{status:'ok',percent:67,resetsAt:reset}}});
test('Go normalizes three used windows and never infers remaining as used',async()=>{
 let request:any;const result=await quota({fns:{llm:{opencodeFetch:async(o:any)=>{request=o;return Response.json(body());}}}} as any,null,{});
 expect(request.url).toBe('https://opencode.ai/inference/go/v1/usage');expect(request.init.method).toBe('GET');
 expect(result).toEqual({primary:{used_percent:12,window_minutes:300,resets_at:Date.parse(reset)/1000},secondary:{used_percent:35,window_minutes:10080,resets_at:Date.parse(reset)/1000},tertiary:{used_percent:67,window_minutes:43200,resets_at:Date.parse(reset)/1000},planType:'Go subscription'});
});
test('Go rejects invalid windows, server failures and unknown statuses without leaking bodies',async()=>{
 for(const mutate of [(b:any)=>delete b.usage.monthly,(b:any)=>b.usage.weekly.percent='0',(b:any)=>b.usage.rolling.percent=-1,(b:any)=>b.usage.rolling.percent=101,(b:any)=>b.usage.monthly.status='mystery',(b:any)=>b.usage.monthly.resetsAt='invalid']){
  const b=body();mutate(b);await expect(quota({fns:{llm:{opencodeFetch:async()=>Response.json(b)}}} as any,null,{})).rejects.toThrow('Unrecognized');
 }
 await expect(quota({fns:{llm:{opencodeFetch:async()=>new Response('private',{status:401})}}} as any,null,{})).rejects.toThrow('HTTP 401');
 const b=body();b.usage.monthly.status='rate-limited';b.usage.monthly.percent=99;
 expect((await quota({fns:{llm:{opencodeFetch:async()=>Response.json(b)}}} as any,null,{})).tertiary.used_percent).toBe(100);
});
test('Go usage transport is authenticated read-only and follows selected pinned SSH route',async()=>{
 let sent:any;const ctx:any={fns:{settings:{getString:async({key}:any)=>key==='opencodePlan'?'go':key==='opencodeInstance'?'edge':''},secrets:{resolveSetting:async()=>'fake-key'},sshAccount:{fetch:async(o:any)=>{sent=o;return Response.json(body());}}}};
 await transport(ctx,null,{url:'https://opencode.ai/inference/go/v1/usage',init:{method:'GET'}});
 expect(sent.ssh.instance).toBe('edge');expect(sent.init.method).toBe('GET');expect(sent.init.headers.authorization).toBe('Bearer fake-key');
 for(const url of ['https://opencode.ai/inference/v1/usage','https://opencode.ai/inference/go/v1/usage?q=1'])await expect(transport(ctx,null,{url,init:{method:'GET'}})).rejects.toThrow();
 await expect(transport(ctx,null,{url:'https://opencode.ai/inference/go/v1/usage',init:{method:'POST'}})).rejects.toThrow();
 ctx.fns.secrets.resolveSetting=async()=>null;await expect(transport(ctx,null,{url:'https://opencode.ai/inference/go/v1/usage',init:{method:'GET'}})).rejects.toThrow('key');
});
test('refreshUsage persists Go through the standard recorder and skips PAYG',async()=>{
 let recorded:any;let plan='go';const queries:any[]=[];const ctx:any={fns:{settings:{getString:async()=>plan},procs:{db:{select:async()=>[],run:async(o:any)=>queries.push(o)}},llm:{opencodeGoUsage:async()=>({primary:{used_percent:1},secondary:{used_percent:2},tertiary:{used_percent:80},planType:'Go subscription'}),recordUsage:async(o:any)=>{recorded=o;},accountAuthHealth:async()=>{}}}};
 expect((await refresh(ctx,null,{accounts:[{provider:'opencode',account:'default'}],now:1,maxAgeMs:0}))[0]?.status).toBe('refreshed');
 expect(recorded.rateLimits.tertiary.used_percent).toBe(80);expect(queries.length).toBe(1);
 plan='payg';recorded=null;expect((await refresh(ctx,null,{accounts:[{provider:'opencode',account:'default'}]}))[0]?.status).toBe('unsupported');expect(recorded).toBeNull();
});

test('three-window recorder and overview persist monthly worst and hide expired resets without database fixtures',async()=>{
 const now=Date.parse('2026-10-22T16:44:00Z');const kv=new Map<string,string>();
 const ctx:any={fns:{settings:{getNumber:async({fallback}:any)=>fallback},procs:{db:{select:async({sql,params}:any)=>sql.includes('LIKE')?[...kv].map(([key,value])=>({key,value})):kv.has(params[0])?[{value:kv.get(params[0])}]:[],run:async({params}:any)=>{kv.set(params[0],params[1]);}},events:{refresh:()=>{}}},ui:{notify:async()=>{}}}};
 const result=await record(ctx,null,{provider:'opencode',planType:'Go subscription',now,rateLimits:{primary:{used_percent:1,window_minutes:300,resets_at:(now+10000)/1000},secondary:{used_percent:5,window_minutes:10080,resets_at:(now+20000)/1000},tertiary:{used_percent:90,window_minutes:43200,resets_at:(now+30000)/1000}}});
 expect(result!.windows.tertiary!.usedPercent).toBe(90);
 expect((await overview(ctx,null,{now}))[0]).toMatchObject({usedPercent:90,resetsAt:now+30000,tone:'error'});
 expect((await overview(ctx,null,{now:now+31000}))[0]).toMatchObject({usedPercent:null});
 expect((await overview(ctx,null,{now:now+31000}))[0]!.windows.tertiary).toBeUndefined();
});
