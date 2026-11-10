import { expect, test } from 'bun:test';
import status from './$route_status_GET';
import apply from './$route_apply_POST';
import page from './$route__GET';
const req = (body: object = {}) => new Request('http://localhost/update/apply', { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':'token'}, body:JSON.stringify(body) });
const owner = {user:{role:'owner'}} as any;
test('update pages and status deny nonowners before git access', async () => {
 const opts={req:new Request('http://localhost/update'),params:{}};
 expect((await page({} as any,null,opts)).status).toBe(403);
 expect((await status({} as any,{user:{role:'member'}} as any,opts)).status).toBe(403);
 expect((await apply({} as any,null,{req:req(),params:{}})).status).toBe(403);
});
test('owner redirect is native and status does not fetch by default',async()=>{
 expect((await page({} as any,owner,{req:new Request('http://localhost/update'),params:{}})).headers.get('location')).toBe('/?settings=updates');
 const ctx={fns:{update:{check:async({fetch}:any)=>{expect(fetch).toBe(false);return {state:'current'};}},auth:{csrfToken:async()=> 'token'}}} as any;
 const result=await status(ctx,owner,{req:new Request('http://localhost/update/status'),params:{}});
 expect(await result.json()).toEqual({status:{state:'current'},csrfToken:'token'});
});
test('apply requires CSRF and explicit confirmation without running update',async()=>{
 const denied={fns:{auth:{verifyCsrf:async()=>false}}} as any;
 expect((await apply(denied,owner,{req:req({confirmed:true,target:'abc'}),params:{}})).status).toBe(403);
 const allowed={fns:{auth:{verifyCsrf:async()=>true}}} as any;
 expect((await apply(allowed,owner,{req:req({target:'abc'}),params:{}})).status).toBe(400);
});
test('changed target refuses confirmed request before staging or restart',async()=>{
 const ctx={fns:{auth:{verifyCsrf:async()=>true},update:{check:async()=>({state:'available',current:'old',target:'new',message:'Ready'})}}} as any;
 expect((await apply(ctx,owner,{req:req({confirmed:true,target:'stale'}),params:{}})).status).toBe(409);
});
