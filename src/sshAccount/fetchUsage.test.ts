import {it,expect} from 'bun:test';
import fetchUsage from './fetchUsage';
import fetchRemote from './fetch';
const opts={instance:'work',provider:'codex' as const,account:'main'};
const fake=(fetch:Function)=>({fns:{sshAccount:{fetch}}}) as any;
it('uses fixed GET endpoints, returns status and body, never sends credentials',async()=>{
 for(const provider of ['codex','claude-code'] as const){let call:any;
 const res=await fetchUsage(fake(async(o:any)=>{call=o;return new Response('{"quota":42}',{status:429});}),null,{...opts,provider});
 expect(res.status).toBe(429);expect(await res.json()).toEqual({quota:42});expect(call.ssh).toEqual({...opts,provider});expect(call.init.method).toBe('GET');expect(call.init.body).toBeUndefined();expect(call.init.headers.authorization).toBeUndefined();expect(call.url).toBe(provider==='codex'?'https://chatgpt.com/backend-api/wham/usage':'https://api.anthropic.com/api/oauth/usage');
 }
});
it('rejects oversized response',async()=>{await expect(fetchUsage(fake(async()=>new Response(new Uint8Array(1048577))),null,opts)).rejects.toThrow('exceeds limit');});
it('rejects invalid deadlines without transport',async()=>{for(const timeoutMs of [0,499,30001,NaN])await expect(fetchUsage(fake(()=>{throw Error('unexpected transport');}),null,{...opts,timeoutMs})).rejects.toThrow('timeout');});
it('bounds startup and body deadlines even when cancellation stalls',async()=>{
 let signal:AbortSignal|undefined; const start=Date.now();
 await expect(fetchUsage(fake(async(o:any)=>{signal=o.init.signal;return new Promise(()=>{});}),null,{...opts,timeoutMs:500})).rejects.toThrow('timed out');expect(signal?.aborted).toBe(true);
 await expect(fetchUsage(fake(async()=>new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){return new Promise(()=>{});}}))),null,{...opts,timeoutMs:500})).rejects.toThrow('timed out');expect(Date.now()-start).toBeLessThan(2500);
});
it('fetches quota through framed fake SSH process without auth or network',async()=>{
 const c:any={fns:{sshInstance:{authorize:async()=>{},connection:async()=>({bin:'python3',args:['-c',`import sys,json
r=json.load(sys.stdin)
assert r['url']=='https://chatgpt.com/backend-api/wham/usage'
assert r['method']=='GET' and 'body' not in r
assert 'authorization' not in r['headers']
print(json.dumps({'status':200,'headers':{}}))
print(json.dumps({'rate_limit':{'primary_window':{'used_percent':12}}}))`],host:'ignored'})},sshAccount:{registry:async()=>[{...opts,status:'connected'}],inferenceScript:async()=>''}}};
 c.fns.sshAccount.fetch=(o:any)=>fetchRemote(c,null,o);
 const res=await fetchUsage(c,null,opts);expect((await res.json()).rate_limit.primary_window.used_percent).toBe(12);
});
