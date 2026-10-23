import {test,expect} from 'bun:test';
import select from './selectFunctions';
const opts={query:'Read a file',candidates:[{name:'files.read',text:'Read files'}],retries:0};
test('bounded reranker forwards retries and returns usage',async()=>{
 let request:any;
 const ctx:any={fns:{jev:{decide:async(o:any)=>{request=o;return {answers:{needs_tool:{type:'noul',noul:0.9},c0:{type:'noul',noul:0.95}},latencyMs:10,usage:{inputTokens:20,outputTokens:4,cost:null}};}}}};
 const out=await select(ctx,null,opts);expect(request.retries).toBe(0);expect(out.usage?.inputTokens).toBe(20);expect(out.functions[0]?.name).toBe('files.read');
});
test('missing and invalid scores throw rather than silently dropping tools',async()=>{
 for(const answer of [undefined,{type:'noul',noul:NaN},{type:'noul',noul:1.1}]){
 const ctx:any={fns:{jev:{decide:async()=>({answers:{needs_tool:{type:'noul',noul:0.9},c0:answer},latencyMs:1,usage:{inputTokens:1,outputTokens:1,cost:null}})}}};
 await expect(select(ctx,null,opts)).rejects.toThrow('invalid');
 }
});
test('empty candidates never call provider',async()=>{
 const out=await select({} as any,null,{query:'thanks',candidates:[]});expect(out.usage).toBeNull();expect(out.functions).toEqual([]);
});
