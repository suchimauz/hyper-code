import {test,expect} from 'bun:test';
import draft from './draft';
test('React draft concurrent first submissions create and send once; retries reuse result',async()=>{
 let starts=0,sends=0;const b:any={id:'a'.repeat(36),state:'active',approved:true,revoked:false,expires_at:Date.now()+60000,first_send_state:'draft',agent_id:null,browser_id:'browser',target_id:'target',title:'Tab'};
 const ctx:any={fns:{sidebar:{requestOrigin:async()=>{},ensureSchema:async()=>{},targetSnapshot:async()=>({browserId:'browser',title:'Tab',url:'https://example.test'})},auth:{currentUser:async()=>({required:false}),verifyCsrf:async({token}:any)=>token==='csrf',csrfToken:async()=>'csrf'},settings:{modelDefault:async()=>'mock:model'},agent:{start:async()=>{starts++;await Bun.sleep(5);return {id:'ab'}},acceptMessage:async()=>{sends++;return new Response('{}')}},procs:{db:{select:async({sql}:any)=>{if(sql.startsWith('SELECT b.'))return [{...b}];if(sql.startsWith('SELECT a.'))return [];if(sql.includes("SET first_send_state='sending'")){if(b.first_send_state!=='draft')return [];b.first_send_state='sending';return [{id:b.id}]}throw Error(sql)},run:async({sql,params}:any)=>{if(sql.includes('SET agent_id='))b.agent_id=params[0];if(sql.includes("first_send_state='sent'"))b.first_send_state='sent';if(sql.includes("first_send_state='failed'"))b.first_send_state='failed'}}}}};
 const req=(method='GET',token='csrf')=>new Request('http://localhost/sidebar/draft/'+b.id,{method,headers:{accept:'application/json',origin:'http://localhost','x-csrf-token':token},...(method==='POST'?{body:new URLSearchParams({text:'Hello'})}:{})});
 const initial=await(await draft(ctx,null,{req:req()})).json();expect(initial.csrfToken).toBe('csrf');expect(starts).toBe(0);
 expect((await draft(ctx,null,{req:req('POST','wrong')})).status).toBe(403);expect(starts).toBe(0);
 const results=await Promise.all([draft(ctx,null,{req:req('POST')}),draft(ctx,null,{req:req('POST')})]);for(const result of results)expect(await result.json()).toEqual({agentId:'ab'});expect(starts).toBe(1);expect(sends).toBe(1);
 expect(await(await draft(ctx,null,{req:req('POST')})).json()).toEqual({agentId:'ab'});expect(sends).toBe(1);
 b.revoked=true;expect((await draft(ctx,null,{req:req()})).status).toBe(410);
});
