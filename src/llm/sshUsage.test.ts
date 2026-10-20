import {expect,test} from 'bun:test';
import refreshUsage from './refreshUsage';
function harness(provider='codex',status=200){
 const calls:{remote:object[];records:any[];health:object[];sql:string[]}={remote:[],records:[],health:[],sql:[]};
 let cached=false,connected=true;
 const fail=()=>{throw new Error('Must not access local credentials or HTTP');};
 const ctx:any={env:{},fns:{sshAccount:{registry:async()=>[{instance:'host.with.dots',provider,account:'work',status:connected?'connected':'failed'}],fetchUsage:async(o:object)=>{calls.remote.push(o);return Response.json(provider==='codex'?{plan_type:'pro',rate_limit:{primary_window:{used_percent:42,limit_window_seconds:18000},secondary_window:{used_percent:17,limit_window_seconds:604800}},rate_limit_reset_credits:{available_count:2}}:{five_hour:{utilization:12},seven_day:{utilization:30}},{status});}},llm:{refreshCodex:fail,refreshClaudeCode:fail,getAnthropicOAuthToken:fail,connectFetch:fail,recordUsage:async(o:object)=>{calls.records.push(o);return o;},accountAuthHealth:async(o:object)=>calls.health.push(o)},procs:{db:{select:async()=>cached?[{value:String(Date.now())}]:[],run:async(o:any)=>{calls.sql.push(o.sql);return {changes:0};}},events:{refresh:()=>{}}}}};
 return {ctx,calls,cache:()=>cached=true,disconnect:()=>connected=false};
}
const account='ssh.host.with.dots.work';
test('SSH Codex quotas reuse parsers and synthetic identity without local auth or detail requests',async()=>{
 const h=harness();const r=await refreshUsage(h.ctx,null,{accounts:[{provider:'codex',account}],maxAgeMs:0,timeoutMs:9000});
 expect(r[0]?.status).toBe('refreshed');expect(h.calls.remote).toEqual([{instance:'host.with.dots',provider:'codex',account:'work',timeoutMs:9000}]);
 expect(h.calls.records[0]).toMatchObject({provider:'codex',account,planType:'pro',rateLimits:{primary:{used_percent:42,window_minutes:300},secondary:{used_percent:17,window_minutes:10080}},resetCredits:{availableCount:2}});
});
test('SSH Claude quotas use remote response and do not request local profile',async()=>{
 const h=harness('claude-code');const r=await refreshUsage(h.ctx,null,{accounts:[{provider:'claude-code',account}],maxAgeMs:0});
 expect(r[0]?.status).toBe('refreshed');expect(h.calls.records[0]).toMatchObject({provider:'claude-code',account,headers:{'anthropic-ratelimit-unified-5h-utilization':'0.12','anthropic-ratelimit-unified-7d-utilization':'0.3'}});
});
test('SSH cached quota makes no remote request',async()=>{
 const h=harness();h.cache();expect((await refreshUsage(h.ctx,null,{accounts:[{provider:'codex',account}]}))[0]?.status).toBe('cached');expect(h.calls.remote).toEqual([]);
});
test('disconnected SSH account cannot fall back to local credentials',async()=>{
 const h=harness();h.disconnect();expect((await refreshUsage(h.ctx,null,{accounts:[{provider:'codex',account}],maxAgeMs:0}))[0]?.status).toBe('failed');expect(h.calls.remote).toEqual([]);
});
test('SSH endpoint errors do not record successful quota',async()=>{
 const h=harness('codex',401);const r=await refreshUsage(h.ctx,null,{accounts:[{provider:'codex',account}],maxAgeMs:0});expect(r[0]).toMatchObject({status:'failed',error:'usage endpoint returned 401'});expect(h.calls.records).toEqual([]);expect(h.calls.health).toContainEqual({action:'mark',provider:'codex',account});
});
test('local Codex and Claude still use local credentials and HTTP',async()=>{
 for(const provider of ['codex','claude-code']){
  const h=harness(provider);let auth=0,requests=0;
  h.ctx.fns.llm.refreshCodex=async()=>{auth++;return 'local-token';};
  h.ctx.fns.llm.refreshClaudeCode=async()=>{auth++;return 'local-token';};
  h.ctx.fns.llm.claudeCodeCliVersion=async()=> '1.0';
  h.ctx.fns.llm.connectFetch=async(o:any)=>{requests++;expect(o.init.headers.authorization).toBe('Bearer local-token');return Response.json(provider==='codex'?{rate_limit:{primary_window:{used_percent:10}}}:o.url.endsWith('/profile')?{organization:{organization_type:'claude_pro'}}:{five_hour:{utilization:20}});};
  expect((await refreshUsage(h.ctx,null,{accounts:[{provider,account:'local'}],maxAgeMs:0}))[0]?.status).toBe('refreshed');
  expect(auth).toBe(1);expect(requests).toBe(provider==='codex'?1:2);expect(h.calls.remote).toEqual([]);
 }
});
