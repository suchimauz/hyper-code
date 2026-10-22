import { test, expect } from 'bun:test';
import usage from './zaiCodingUsage';
import refresh from './refreshUsage';
import dial from '../ui/usageDial';

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
test('Z.ai dual rings put weekly outside and 5h inside with explicit tooltip and no invented fills',()=>{
 const ctx:any={fns:{procs:{ui:{escape:({text}:any)=>String(text)}},ui:{modelLogo:()=>'<svg data-logo></svg>'}}};
 const entry:any={provider:'zai-coding',account:'default',label:'Z.ai Coding Plan',usedPercent:20,resetsAt:now+3600000,planType:'lite',parkedAgents:0,tone:'neutral',windows:{primary:{usedPercent:20,resetsAt:now+3600000},secondary:{usedPercent:7,resetsAt:now+86400000}}};
 let html=dial(ctx,null,{entries:[entry],now});
 expect(html).toContain('data-quota-window="weekly" class="text-info"><circle cx="14" cy="14" r="12"');
 expect(html).toContain('data-quota-window="5h" class="text-success"><circle cx="14" cy="14" r="9"');
 expect(html).toContain('Weekly: 7% used');expect(html).toContain('5h: 20% used');expect(html).toContain('resets in');
 html=dial(ctx,null,{entries:[{...entry,windows:{},usedPercent:null,quotaStatus:'unavailable'}],now});expect(html).not.toContain('stroke-dasharray');expect(html).toContain('Weekly: quota unavailable');
 html=dial(ctx,null,{entries:[{...entry,windows:{primary:{usedPercent:100,resetsAt:now-1}}}],now});expect(html).not.toContain('stroke-dasharray');
});
