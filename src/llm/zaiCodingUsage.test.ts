import { test, expect } from 'bun:test';
import usage from './zaiCodingUsage';
import refresh from './refreshUsage';

const now = 1792645579000;
const payload = {success:true,code:200,data:{level:'lite',limits:[
 {type:'CREDIT_LIMIT',unit:3,number:5,percentage:20,nextResetTime:now+3600000},
 {type:'CREDIT_LIMIT',unit:6,number:1,percentage:7,nextResetTime:now+86400000},
]}};
function setup(body: any = payload, status = 200) {
 const requests: any[]=[];
 const ctx:any={fns:{secrets:{resolveSetting:async()=>'test-key'},llm:{connectFetch:async(o:any)=>{requests.push(o);return Response.json(body,{status});}}}};
 return {ctx,requests};
}
test('Z.ai quota normalizes 5h and weekly credits with no standard API or redirects',async()=>{
 const {ctx,requests}=setup();
 expect(await usage(ctx,null,{})).toEqual({planType:'lite',primary:{used_percent:20,window_minutes:300,resets_at:(now+3600000)/1000},secondary:{used_percent:7,window_minutes:10080,resets_at:(now+86400000)/1000}});
 expect(requests[0].url).toBe('https://api.z.ai/api/monitor/usage/quota/limit');expect(requests[0].init.redirect).toBe('error');
});
test('Z.ai quota rejects auth errors, invalid percent, changed schema and missing credentials',async()=>{
 for(const [body,status] of [[{},401],[{success:false,code:200,data:payload.data},200],[{success:true,code:200,data:{limits:[{...payload.data.limits[0],percentage:null}]}},200],[{success:true,code:200,data:{limits:[{...payload.data.limits[0],percentage:101}]}},200]] as const){
  const {ctx}=setup(body,status);await expect(usage(ctx,null,{})).rejects.toThrow();
 }
 const {ctx,requests}=setup();ctx.fns.secrets.resolveSetting=async()=>null;await expect(usage(ctx,null,{})).rejects.toThrow();expect(requests).toHaveLength(0);
});
test('Z.ai refresh uses the normal snapshot store, caches success and hides failed telemetry',async()=>{
 let cache:any;let snapshot:any;let fail=false;let deleted=false;
 const ctx:any={fns:{llm:{zaiCodingUsage:async()=>{if(fail)throw new Error('HTTP 503');return {planType:'lite',primary:{used_percent:20},secondary:{used_percent:7}};},recordUsage:async(o:any)=>{snapshot=o;},accountAuthHealth:async()=>{}},procs:{db:{select:async()=>cache?[{value:cache}]:[],run:async(o:any)=>{if(o.sql.startsWith('INSERT'))cache=o.params[1];if(o.sql.startsWith('DELETE'))deleted=true;return {changes:1};}},events:{emit:async()=>{}},log:{warn:async()=>{}}}}};
 const opts={accounts:[{provider:'zai-coding',account:'default'}],now,maxAgeMs:60000};
 expect((await refresh(ctx,null,opts))[0]?.status).toBe('refreshed');expect(snapshot.provider).toBe('zai-coding');expect(snapshot.rateLimits.secondary.used_percent).toBe(7);
 expect((await refresh(ctx,null,opts))[0]?.status).toBe('cached');
 fail=true;expect((await refresh(ctx,null,{...opts,maxAgeMs:0}))[0]?.status).toBe('failed');expect(deleted).toBe(true);
});
// Named Z.ai periods and expired measurements are covered through quotaData in ui/usageDial.test.ts.

test('Z.ai usage leaves through the chosen SSH instance while the plan key stays local',async()=>{
 const fetched:any[]=[];
 const ctx:any={fns:{secrets:{resolveSetting:async()=>'test-key'},llm:{codingInstance:async()=>({instance:'box'}),connectFetch:async(o:any)=>{fetched.push({via:'local',o});return Response.json(payload);}},sshAccount:{fetch:async(o:any)=>{fetched.push({via:'ssh',o});return Response.json(payload);}}}};
 const r=await usage(ctx,null,{});
 expect(fetched).toHaveLength(1);expect(fetched[0].via).toBe('ssh');
 expect(fetched[0].o.ssh).toEqual({instance:'box',provider:'zai-coding',account:'default'});
 expect(fetched[0].o.url).toBe('https://api.z.ai/api/monitor/usage/quota/limit');
 expect(fetched[0].o.init.headers.authorization).toBe('Bearer test-key');
 expect(r.primary!.used_percent).toBe(20);
 // The remote bridge defaults to POST when the method is omitted, and the
 // monitoring endpoint only answers GET — state it or quota fails remotely.
 expect(fetched[0].o.init.method).toBe('GET');
 // No instance chosen keeps the direct local connection.
 ctx.fns.llm.codingInstance=async()=>({instance:null});
 await usage(ctx,null,{});
 expect(fetched[1].via).toBe('local');
});
