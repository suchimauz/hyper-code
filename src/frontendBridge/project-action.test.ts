import {test,expect} from 'bun:test';
import handler from './projectAction';
import nativeArchive from '../projects/setArchived';
import middleware from '../$middleware_ui-lab-api';
function fixture(){
 const writes:any[]=[]; const chats=[{id:'active',archived_at:null},{id:'old',archived_at:10}]; let archived:number|null=null;
 const ctx:any={fns:{auth:{verifyCsrf:async({token}:any)=>token==='token',csrfToken:async()=> 'token'},projects:{list:async()=>[{id:'p',virtual:true,dir:'/exact'}],principal:async()=> 'user:owner',materialize:async({projectId}:any)=>({id:projectId}),setArchived:async(opts:any)=>nativeArchive(ctx,null,opts)},procs:{events:{emit:()=>{}},db:{run:async(opts:any)=>{writes.push(opts);archived=opts.params[0];}}}}};
 const session:any={user:{id:'owner',role:'owner'}};
 const post=(data:any={projectId:'p',action:'archive'},user:any=session,token='token')=>handler(ctx,user,{req:new Request('http://localhost/ui-lab-api/project-action',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':token},body:JSON.stringify(data)})});
 return {ctx,session,post,writes,chats,archived:()=>archived};
}
test('archive and restore write only scoped project membership, never chat flags',async()=>{const f=fixture();const before=JSON.stringify(f.chats);expect((await f.post()).status).toBe(200);expect(f.archived()).toBeNumber();expect((await f.post({projectId:'p',action:'restore'})).status).toBe(200);expect(f.archived()).toBeNull();expect(JSON.stringify(f.chats)).toBe(before);for(const w of f.writes){expect(w.sql).toBe('UPDATE project_members SET archived_at=? WHERE principal=? AND project_id=?');expect(w.params.slice(1)).toEqual(['user:owner','p']);}});
test('auth owner and CSRF guards precede writes',async()=>{const f=fixture();expect((await f.post(undefined,null)).status).toBe(401);expect((await f.post(undefined,{user:{id:'member',role:'member'}})).status).toBe(403);expect((await f.post(undefined,undefined,'bad')).status).toBe(403);expect(f.writes).toHaveLength(0);});
test('reject unassigned, invisible projects, unknown action and extra fields',async()=>{const f=fixture();for(const data of [{projectId:'unassigned',action:'archive'},{projectId:'p',action:'delete'},{projectId:'p',action:'archive',principal:'other'}])expect((await f.post(data)).status).toBe(400);expect((await f.post({projectId:'missing',action:'archive'})).status).toBe(404);expect(f.writes).toHaveLength(0);});
test('token GET and middleware routing are read only',async()=>{const f=fixture();const req=new Request('http://localhost/ui-lab-api/project-action');expect(await (await handler(f.ctx,f.session,{req})).json()).toEqual({csrfToken:'token'});f.ctx.fns.frontendBridge={projectAction:async()=>new Response('routed')};expect(await (await middleware(f.ctx,f.session,{req})).text()).toBe('routed');expect(f.writes).toHaveLength(0);});
