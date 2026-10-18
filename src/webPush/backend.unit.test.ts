import {test,expect,mock,afterEach} from 'bun:test';
import validate from './validateSubscription';
import notify from './notifyInput';
import handle from './handle';
import * as wp from 'web-push';
const subscription=()=>({endpoint:'https://web.push.apple.com/test',keys:{p256dh:wp.generateVAPIDKeys().publicKey,auth:Buffer.alloc(16,1).toString('base64url')}});
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
test('allowlisted provider keys accepted; SSRF URLs rejected',async()=>{
 const sub=subscription();expect((await validate({} as any,null,{subscription:sub})).endpoint).toBe(sub.endpoint);
 for(const endpoint of ['http://web.push.apple.com/a','https://localhost/a','https://web.push.apple.com.evil.test/a','https://u@web.push.apple.com/a','https://web.push.apple.com:444/a','https://web.push.apple.com/a#x','https://127.0.0.1/a'])await expect(validate({} as any,null,{subscription:{...sub,endpoint}})).rejects.toThrow();
 await expect(validate({} as any,null,{subscription:{...sub,keys:{...sub.keys,auth:'a'}}})).rejects.toThrow();
});
function harness(status=201){
 const sub=subscription(), keys={...wp.generateVAPIDKeys(),subject:'https://example.com'};let claimed=false;
 const run=mock(async()=>({changes:1}));const select=mock(async({sql}:any)=>{
 if(sql.startsWith('SELECT i.agent_id'))return [{agent_id:'ab',created_by:'u1'}];
 if(sql.startsWith('SELECT created_by'))return [{created_by:'u1'}];
 if(sql.startsWith('SELECT id,endpoint'))return [{id:'s1',endpoint:sub.endpoint,...sub.keys}];
 if(sql.startsWith('INSERT INTO web_push_deliveries')){if(claimed)return [];claimed=true;return [{input_id:'i1'}];}return [];
 });
 const fetchMock=mock(async()=>new Response(null,{status}));globalThis.fetch=fetchMock as any;
 const ctx:any={fns:{procs:{db:{select,run}},webPush:{preferences:async()=>({eligible:true,input:true,error:true}),validateSubscription:(o:any)=>validate({} as any,null,o),vapid:async()=>keys}}};
 return {ctx,run,select,fetchMock};
}
test('background agent input sends once; no unsafe redirect or plaintext content',async()=>{
 const h=harness();await notify(h.ctx,{agentId:'ab'},{inputId:'i1'});await notify(h.ctx,{agentId:'ab'},{inputId:'i1'});
 expect(h.fetchMock).toHaveBeenCalledTimes(1);const call=h.fetchMock.mock.calls[0] as any;expect(call[1].redirect).toBe('error');expect(call[1].signal).toBeInstanceOf(AbortSignal);
 expect(h.select.mock.calls.some((c:any)=>c[0].sql.includes("i.state='open'")&&c[0].sql.includes('login.revoked_at'))).toBe(true);
});
test('foreign owner and unauthenticated invocation never send',async()=>{
 const h=harness();await notify(h.ctx,{user:{id:'other'}},{inputId:'i1'});await notify(h.ctx,null,{inputId:'i1'});expect(h.fetchMock).not.toHaveBeenCalled();
});
for(const status of [404,410])test('expired provider subscription removed '+status,async()=>{
 const h=harness(status);await notify(h.ctx,{agentId:'ab'},{inputId:'i1'});expect(h.run.mock.calls.some((c:any)=>c[0].sql.startsWith('DELETE FROM web_push_subscriptions'))).toBe(true);
});
test('provider timeout is bounded failure, no retry',async()=>{
 const h=harness();const send=mock(async()=>{throw new Error('timeout endpoint secret');});globalThis.fetch=send as any;
 await notify(h.ctx,{agentId:'ab'},{inputId:'i1'});expect(send).toHaveBeenCalledTimes(1);expect(h.run.mock.calls.some((c:any)=>c[0].sql.includes("status='failed'"))).toBe(true);
});
test('config rejects ownerless auth before key initialization',async()=>{
 const h=harness();const result=await handle(h.ctx,null,{req:new Request('https://example.com/webPush/config'),action:'config'});expect(result.status).toBe(401);expect(h.select).not.toHaveBeenCalled();
});
test('closed/cancelled input produces no claim or send',async()=>{
 const h=harness();h.ctx.fns.procs.db.select=mock(async()=>[]);await notify(h.ctx,{agentId:'ab'},{inputId:'i1'});expect(h.fetchMock).not.toHaveBeenCalled();
});
function routeHarness(){
 const sub=subscription(),run=mock(async()=>({changes:1}));let existing:any[]=[],conflict=false;
 const select=mock(async({sql}:any)=>{
 if(sql.startsWith('SELECT id FROM users'))return [{id:'u1'}];
 if(sql.startsWith('SELECT owner_id'))return existing;
 if(sql.startsWith('SELECT count'))return [{n:0}];
 if(sql.startsWith('INSERT INTO web_push_subscriptions'))return conflict?[]:[{id:'s1'}];
 if(sql.startsWith('SELECT endpoint'))return [{endpoint:sub.endpoint}];return [];
 });
 const ctx:any={fns:{http:{publicOrigin:async()=> 'https://example.com'},auth:{verifyCsrf:async()=>true},procs:{auth:{cookieName:()=> 'session'},db:{select,run,transaction:async({fn}:any)=>fn()}},webPush:{sessionBinding:async()=>({ownerId:'u1',key:'binding',sessionId:null,expiresAt:Date.now()+10000}),vapid:async()=>({publicKey:'public',privateKey:'PRIVATE'}),validateSubscription:(o:any)=>validate({} as any,null,o)}}};
 const req=(body:any,origin='https://example.com')=>new Request('https://example.com/webPush/subscribe',{method:'POST',headers:{cookie:'session=token',origin,'content-type':'application/json','x-csrf-token':'csrf'},body:JSON.stringify(body)});
 return {ctx,run,select,sub,req,foreign:()=>{existing=[{owner_id:'other',session_key:'other'}]},conflict:()=>{conflict=true}};
}
test('mutations enforce exact origin and CSRF before reading subscriptions',async()=>{
 const h=routeHarness();let r=await handle(h.ctx,{user:{id:'u1'}},{req:h.req({subscription:h.sub},'https://evil.test'),action:'subscribe'});expect(r.status).toBe(403);
 h.ctx.fns.auth.verifyCsrf=async()=>false;r=await handle(h.ctx,{user:{id:'u1'}},{req:h.req({subscription:h.sub}),action:'subscribe'});expect(r.status).toBe(403);expect(h.run).not.toHaveBeenCalled();
});
test('foreign ownership and concurrent endpoint conflicts reject, never rebind',async()=>{
 const h=routeHarness();h.foreign();expect((await handle(h.ctx,{user:{id:'u1'}},{req:h.req({subscription:h.sub}),action:'subscribe'})).status).toBe(409);
 const c=routeHarness();c.conflict();expect((await handle(c.ctx,{user:{id:'u1'}},{req:c.req({subscription:c.sub}),action:'subscribe'})).status).toBe(409);
});
test('unsubscribe delete is owner and browser-session scoped',async()=>{
 const h=routeHarness();expect((await handle(h.ctx,{user:{id:'u1'}},{req:h.req({endpoint:h.sub.endpoint}),action:'unsubscribe'})).status).toBe(200);
 expect((h.run.mock.calls[0] as any)[0].params).toEqual([h.sub.endpoint,'u1','binding']);
});
test('config exposes hashes and public key only',async()=>{
 const h=routeHarness();const r=await handle(h.ctx,{user:{id:'u1'}},{req:h.req({}),action:'config'});const data=await r.json();expect(data.endpointHashes[0]).toHaveLength(64);expect(JSON.stringify(data)).not.toContain('PRIVATE');expect(JSON.stringify(data)).not.toContain(h.sub.endpoint);
});
test('project label lookup uses recipient principal and normalized workspace identity',async()=>{
 const h=harness();const previous=h.ctx.fns.procs.db.select;const lookup:any[]=[];
 h.ctx.fns.projects={identity:async({dir,host}:any)=>{expect(dir).toBe('/work/vpnator');expect(host).toBe('remote');return {id:'p_example',dir,host};}};
 h.ctx.fns.procs.db.select=async(o:any)=>{
  if(o.sql.startsWith('SELECT i.agent_id'))return [{agent_id:'ab',created_by:'u1',title:'spec-002',workspace_dir:'/work/vpnator',workspace_host:'remote'}];
  if(o.sql.startsWith('SELECT title FROM project_members')){lookup.push(o.params);return [{title:'My VPN'}];}
  return previous(o);
 };
 await notify(h.ctx,{agentId:'ab'},{inputId:'i1'});
 expect(lookup).toEqual([['p_example','user:u1']]);expect(h.fetchMock).toHaveBeenCalledTimes(1);
});
test('input disabled or ineligible main gate never claims or sends',async()=>{
 for(const preferences of [{eligible:true,input:false},{eligible:false,input:true}]) {
 const h=harness();h.ctx.fns.webPush.preferences=async()=>preferences;
 await notify(h.ctx,{agentId:'ab'},{inputId:'i1'});
 expect(h.fetchMock).not.toHaveBeenCalled();
 expect(h.select.mock.calls.some((c:any)=>c[0].sql.startsWith('INSERT'))).toBe(false);
 }
});
