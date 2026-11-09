import { test, expect } from 'bun:test';
import sessionRoute from './$route_session_GET';

for (const [mode, who, allowed, status] of [
 ['owner', {required:true,user:{role:'owner'}}, true,200],
 ['member', {required:true,user:{role:'member'}}, false,200],
 ['open', {required:false,user:null}, true,200],
 ['legacy', {required:true,user:null,legacy:true}, true,200],
 ['invalid legacy', {required:true,user:null,legacy:false}, false,401],
 ['signed out', {required:true,user:null}, false,401],
 ['member despite open flag', {required:false,user:{role:'member'}}, false,200],
] as const) test(`session native capability: ${mode}`, async () => {
 const ctx:any={fns:{auth:{currentUser:async()=>who,listUsers:async()=>[]}}};
 const response=await sessionRoute(ctx,null,{req:new Request('http://localhost/auth/session'),params:{}});
 const body=await response.json();
 expect(response.status).toBe(status);
 expect(body.canManage).toBe(allowed);
 expect(typeof body.canManage).toBe('boolean');
 expect(Object.keys(body).sort()).toEqual((status===401 ? ['authenticated','multiuser','canManage'] : ['authenticated','required','multiuser','canManage','user']).sort());
});
