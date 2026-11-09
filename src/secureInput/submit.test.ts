import { expect, test } from 'bun:test';
import submit from './submit';
import current from './current';
import authorize from './authorize';
import prompt from './prompt';

function fixture() {
 const events: object[] = []; const stored: object[] = [];
 const session: any = { user: { id: 'owner' } };
 const ctx: any = { state: {}, fns: { auth: { currentUser: async ({req}: any) => ({required:true,user:{id:req.headers.get('x-test-user') ?? 'owner'}}), csrfToken: async()=> 'csrf', verifyCsrf: async({token}:any)=>token==='csrf' }, procs: {events:{emit:({event}:any)=>events.push(event)},db:{select:async()=>[{created_by:'owner'}]}}, secrets:{parseRef:({ref}:any)=>ref,set:async(data:any)=>{stored.push(data);return {ref:data.ref};}}, secureInput:{} } };
 ctx.fns.secureInput.authorize = (opts:any)=>authorize(ctx,session,opts);
 const request=(body:object, user='owner', csrf='csrf')=>new Request('http://localhost/secureInput/submit',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf,'x-test-user':user},body:JSON.stringify(body)});
 return {ctx,session,events,stored,request};
}

test('owner metadata is allowlisted; other users see nothing; HTTP/CSRF/exact id enforced',async()=>{
 const {ctx,session,events,request}=fixture();
 const waiting=prompt(ctx,session,{title:'Private title',maxlength:12});
 const id=ctx.state.secureInput.prompts.keys().next().value;
 const visible=await (await current(ctx,session,{req:new Request('http://localhost')})).json();
 expect(visible.prompt.id).toBe(id); expect(visible.prompt.resolve).toBeUndefined(); expect(visible.prompt.ownerId).toBeUndefined();
 expect(await (await current(ctx,session,{req:new Request('http://localhost',{headers:{'x-test-user':'other'}})})).json()).toEqual({prompt:null});
 expect((await submit(ctx,session,{})).status).toBe(403);
 expect((await submit(ctx,session,{req:request({id,value:'MOCK-SECRET'},'owner','bad')})).status).toBe(403);
 expect((await submit(ctx,session,{req:request({id,value:'MOCK-SECRET'},'other')})).status).toBe(404);
 expect((await submit(ctx,session,{req:request({id:'stale',value:'MOCK-SECRET'})})).status).toBe(404);
 expect((await submit(ctx,session,{req:request({id,value:'x'.repeat(13)})})).status).toBe(400);
 expect(ctx.state.secureInput.prompts.size).toBe(1);
 const result=await submit(ctx,session,{req:request({id,value:'MOCK-SECRET'})});
 expect(await result.text()).toBe('{"ok":true}'); expect(await waiting).toBe('MOCK-SECRET');
 expect(ctx.state.secureInput.prompts.size).toBe(0);
 expect((await submit(ctx,session,{req:request({id,value:'again'})})).status).toBe(404);
 expect(JSON.stringify(events)).not.toContain('MOCK-SECRET'); expect(JSON.stringify(events)).not.toContain('Private title');
});

test('saveAs encrypts via secrets.set and returns reference only; cancellation rejects and cleans',async()=>{
 const {ctx,session,request,stored}=fixture();
 const waiting=prompt(ctx,session,{title:'Store',saveAs:'secret://test/mock'});
 let id=ctx.state.secureInput.prompts.keys().next().value;
 await submit(ctx,session,{req:request({id,value:'MOCK-SECRET'})});
 expect(await waiting).toBe('secret://test/mock'); expect(stored).toEqual([{ref:'secret://test/mock',value:'MOCK-SECRET',source:'secure-input'}]);
 delete ctx.state.secureInput.closing;
 const cancelled=prompt(ctx,session,{title:'Cancel'}); const rejected=cancelled.catch((error: Error) => error.message);
 id=ctx.state.secureInput.prompts.keys().next().value;
 expect((await submit(ctx,session,{req:request({id,cancel:true})})).status).toBe(200);
 expect(await rejected).toContain('cancelled'); expect(ctx.state.secureInput.prompts.size).toBe(0);
});

test('expired or transferred agent prompts are not accepted',async()=>{
 const {ctx,session,request}=fixture();
 const waiting=prompt(ctx,session,{title:'Expiry'}); const id=ctx.state.secureInput.prompts.keys().next().value;
 const entry=ctx.state.secureInput.prompts.get(id); entry.expiresAt=Date.now()-1;
 expect((await submit(ctx,session,{req:request({id,value:'MOCK'})})).status).toBe(404);
 entry.expiresAt=Date.now()+10000;entry.agentId='a';ctx.fns.procs.db.select=async()=>[{created_by:'new-owner'}];
 expect((await submit(ctx,session,{req:request({id,value:'MOCK'})})).status).toBe(404);
 const rejected=waiting.catch((error: Error)=>error.message);entry.reject(new Error('test cleanup')); expect(await rejected).toContain('test cleanup');
});
