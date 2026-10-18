import { expect, test } from 'bun:test';
import route from './$route_v1_usage_GET';
function fixture() {
 const calls:any[]=[];
 const rows=[{provider:'codex',account:'named',usedPercent:23,updatedAt:123,windows:{primary:{usedPercent:23,resetsAt:999}}},{provider:'codex',account:'deleted',usedPercent:0,updatedAt:999},{provider:'xai',account:'named',usedPercent:80,updatedAt:999}];
 const ctx:any={state:{},fns:{node:{authorize:async()=>({ok:true,client:{providers:['codex']}})},llm:{listAccounts:async()=>[{provider:'codex',account:'named',source:'file'},{provider:'xai',account:'named',source:'oauth'},{provider:'codex',account:'remote',source:'node'}],refreshUsage:async(o:any)=>{calls.push(o);},usageOverview:async()=>rows}}};
 return {ctx,calls,rows};
}
const req=new Request('http://localhost/node/v1/usage');
test('authenticated export refreshes only configured exact accounts in scope and preserves measurement/windows',async()=>{
 const {ctx,calls}=fixture(); const body=await (await route(ctx,null,{req})).json();
 expect(calls).toEqual([{accounts:[{provider:'codex',account:'named'}],maxAgeMs:60000,timeoutMs:2500}]);
 expect(body.usage).toHaveLength(1); expect(body.usage[0].updatedAt).toBe(123); expect(body.usage[0].windows.primary.usedPercent).toBe(23);
 await route(ctx,null,{req}); expect(calls).toHaveLength(1);
});
test('auth denial performs no refresh',async()=>{const {ctx,calls}=fixture();ctx.fns.node.authorize=async()=>({ok:false,response:new Response('',{status:403})});expect((await route(ctx,null,{req})).status).toBe(403);expect(calls).toHaveLength(0);});
test('failed probes are throttled and missing usage is not a fresh zero',async()=>{const {ctx,rows}=fixture();let attempts=0;ctx.fns.llm.refreshUsage=async()=>{attempts++;rows.length=0;throw new Error('unavailable');};for(let i=0;i<2;i++){const body=await(await route(ctx,null,{req})).json();expect(body.usage).toEqual([]);}expect(attempts).toBe(1);});
test('hanging credential renewal bounds export without stamping fresh measurements or overlapping probes',async()=>{const {ctx}=fixture();let attempts=0;ctx.fns.llm.refreshUsage=()=>{attempts++;return new Promise(()=>{});};const start=Date.now();const body=await(await route(ctx,null,{req})).json();expect(Date.now()-start).toBeLessThan(4500);expect(body.usage[0].updatedAt).toBe(123);expect(attempts).toBe(1);},5000);
