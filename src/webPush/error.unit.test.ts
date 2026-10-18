import {test,expect,mock,afterEach} from 'bun:test';
import notify from './notifyError';
import record from './recordFailure';
import validate from './validateSubscription';
import * as wp from 'web-push';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
function fixture(status=201){
 const keys={...wp.generateVAPIDKeys(),subject:'https://example.com'};
 const sub={id:'s1',endpoint:'https://web.push.apple.com/test',p256dh:wp.generateVAPIDKeys().publicKey,auth:Buffer.alloc(16,1).toString('base64url')};
 let claimed=false;
 const select=mock(async({sql}:any)=>{
 if(sql.startsWith('SELECT a.id'))return [{agent_id:'ab',created_by:'u1',title:'Agent',workspace_dir:'/project'}];
 if(sql.startsWith('SELECT title'))return [{title:'Personal project'}];
 if(sql.startsWith('SELECT id,endpoint'))return [sub];
 if(sql.startsWith('INSERT INTO web_push_error_deliveries')){if(claimed)return [];claimed=true;return [{agent_id:'ab'}];}
 return [];
 });
 const fetchMock=mock(async()=>new Response(null,{status}));globalThis.fetch=fetchMock as any;
 const ctx:any={fns:{projects:{identity:async()=>({id:'project-id',dir:'/project'})},procs:{db:{select,run:mock(async()=>({changes:1}))},log:{warn:mock(()=>{})}},webPush:{preferences:async()=>({eligible:true,input:true,error:true}),vapid:async()=>keys,validateSubscription:(o:any)=>validate({} as any,null,o)}}};
 return {ctx,select,fetchMock};
}
test('error delivery claims concurrently once per durable run and subscription, with owner and state fences',async()=>{
 const h=fixture();await Promise.all([notify(h.ctx,null,{agentId:'ab',runToken:'run-1'}),notify(h.ctx,null,{agentId:'ab',runToken:'run-1'})]);
 expect(h.fetchMock).toHaveBeenCalledTimes(1);
 const claim=h.select.mock.calls.find((c:any)=>c[0].sql.startsWith('INSERT'))![0] as any;
 for(const text of ['ON CONFLICT DO NOTHING','a.updated_at=f.failed_at','a.next_run_at IS NULL','a.parent_id IS NULL','p.error_enabled=false','login.revoked_at IS NULL'])expect(claim.sql).toContain(text);
 expect((h.fetchMock.mock.calls[0] as any)[1].redirect).toBe('error');
});
test('error preference and eligibility suppress all subscription reads',async()=>{
 for(const prefs of [{eligible:false,error:true},{eligible:true,error:false}]){
 const h=fixture();h.ctx.fns.webPush.preferences=async()=>prefs;
 await notify(h.ctx,null,{agentId:'ab',runToken:'run-1'});
 expect(h.select).not.toHaveBeenCalled();expect(h.fetchMock).not.toHaveBeenCalled();
 }
});
test('error unknown durable record or lost claim cannot send',async()=>{
 const h=fixture();h.ctx.fns.procs.db.select=async()=>[];
 await notify(h.ctx,null,{agentId:'ab',runToken:'run-1'});expect(h.fetchMock).not.toHaveBeenCalled();
});
for(const status of [404,410])test(`error provider ${status} revokes subscription`,async()=>{
 const h=fixture(status);await notify(h.ctx,null,{agentId:'ab',runToken:'run-1'});
 expect(h.ctx.fns.procs.db.run.mock.calls[0][0].sql).toContain('DELETE FROM web_push_subscriptions');
});
test('record failure only dispatches after fenced durable insert; lost ownership and duplicate are silent',async()=>{
 const notifyError=mock(async()=>{});let won=true;
 const select=mock(async()=>won?[{agent_id:'ab'}]:[]);
 const ctx:any={fns:{procs:{db:{select},log:{warn:mock(()=>{})}},webPush:{notifyError}}};
 await record(ctx,null,{agentId:'ab',runToken:'run-1',finalizedAt:100});won=false;
 await record(ctx,null,{agentId:'ab',runToken:'run-1',finalizedAt:100});
 expect(notifyError).toHaveBeenCalledTimes(1);
 const sql=(select.mock.calls[0] as any)[0].sql;
 for(const text of ['updated_at=?',"run_state='idle'",'next_run_at IS NULL',"last_error NOT LIKE 'stopped by user%'",'ON CONFLICT DO NOTHING'])expect(sql).toContain(text);
});
