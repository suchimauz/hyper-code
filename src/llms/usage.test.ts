import { describe, expect, test } from 'bun:test';
import route from './$route_usage_GET';
import usageData from './usageData';
const local={provider:'codex',account:'local',label:'Local quota',usedPercent:21,resetsAt:null,planType:null,parkedAgents:0,tone:'neutral'};
const catalog=Array.from({length:14},(_,i)=>({id:`model-${i}`,provider:'codex',account:i<7?'alice':'bob',kind:'subscription'}));
function node(patch={}) {return {name:'mini6',enabled:true,catalogAt:Date.now(),usageAt:Date.now(),lastError:null,catalog,usage:[{provider:'codex',account:'alice',usedPercent:17},{provider:'codex',account:'bob',usedPercent:83}],...patch};}
async function data(nodes:any[],locals:any[]=[local],groups?:Record<string,string[]>,gateway?:any) {
 let calls=0;
 const ctx:any={state:{llmUsageRefresh:{startedAt:Date.now()}},fns:{llm:{listAccounts:async()=>locals,...(gateway?{gatewayHealth:async()=>gateway}:{}),usageOverview:async()=>locals,listModels:async(opts:any)=>{expect(opts).toEqual({});calls++;return groups??Object.fromEntries(nodes.map(n=>[`mauzcode/${n.name}`,n.catalog.map((m:any)=>`mauzcode/${n.name}:${m.id}`)]));}},node:{list:async()=>nodes}}};
 const result=await usageData(ctx,null,{});expect(calls).toBe(1);return result;
}
describe('native quota source preserves account/domain selection',()=>{
 test('gateway remains distinct from measured quota',async()=>{const q=await data([node()],[local],undefined,{status:'available',reason:'models-ok'});expect(q.gateway?.status).toBe('available');expect(q.entries).toHaveLength(3);expect(q.entries.some(e=>e.usedPercent===17)).toBe(true);});
 test('relayed snapshots never duplicate remote accounts',async()=>{expect((await data([node()],[local,{...local,provider:'mauzcode'}])).entries).toHaveLength(3);});
 test('same account on distinct providers and nodes stays distinct',async()=>{const n=node({catalog:[{id:'a',provider:'codex',account:'same'},{id:'b',provider:'claude-code',account:'same'}]});expect((await data([n,{...n,name:'other'}],[])).entries).toHaveLength(4);});
 test('14 models collapse to two account observations plus local',async()=>{const q=await data([node()]);expect(q.entries).toHaveLength(3);expect(q.entries.map(e=>e.usedPercent).sort()).toEqual([17,21,83]);});
 test('disabled and forbidden catalogues are omitted',async()=>{for(const patch of [{enabled:false},{lastError:'models 403: forbidden'}])expect((await data([node(patch)])).entries).toHaveLength(1);});
 test('successful empty catalogues and shared omissions are authoritative',async()=>{expect((await data([node()],[local],{})).entries).toHaveLength(1);expect((await data([node({catalog:[]})])).entries).toHaveLength(1);});
 test('outages preserve last known usage as stale',async()=>{const q=await data([node({lastError:'connection refused'})]);expect(q.entries).toHaveLength(3);expect(q.entries.find(e=>e.usedPercent===17)?.quotaStatus).toBe('stale');});
 test('old usage is stale and absent usage is unknown, not zero',async()=>{expect((await data([node({usageAt:1})],[])).entries.every(e=>e.quotaStatus==='stale')).toBe(true);const q=await data([node({usage:null})],[]);expect(q.entries).toHaveLength(2);expect(q.entries.every(e=>e.usedPercent===null&&e.quotaStatus==='unavailable')).toBe(true);});
 test('untrusted node/account identity stays data',async()=>{const q=await data([node({name:'mini<6"',catalog:[{id:'a',provider:'co<dex',account:'a"><script>'}],usage:null})],[]);expect(q.entries).toHaveLength(1);expect(q.entries[0]?.node).toBe('mini<6"');expect(q.entries[0]?.account).toBe('a"><script>');});
 test('compatibility endpoint returns only quota JSON without caching',async()=>{const q=await data([node()]);const response=await route({fns:{llms:{quotaData:async()=>({...q,accounts:[],private:'never'})}}} as any,null,{});expect(response.headers.get('Cache-Control')).toBe('no-store');expect(await response.json()).toEqual(q);});
});
