import { test, expect } from 'bun:test';
import route from './$route_GET';
test('root fallback serves native frontend, not the removed home HTML',async()=>{
 let target='';const ctx:any={fns:{frontendBridge:{proxy:async({req}:any)=>{target=req.url;return new Response('native')}}}};
 const response=await route(ctx,null,{req:new Request('http://localhost/?newSession=1'),params:{}});
 expect(target).toBe('http://localhost/ui-lab/?newSession=1');expect(await response.text()).toBe('native');
});
