import { test, expect } from 'bun:test';
import route from './$route_$id_POST';
function fixture(denied=false,csrf=true){let navigated=0;const ctx={fns:{canvas:{authorizeHttp:async()=>denied?new Response('Unknown agent',{status:404}):null,navigate:async()=>{navigated++;},update:async()=>({}),revision:async()=>({panel:'p'})},auth:{verifyCsrf:async()=>csrf}}} as unknown as Context;return {call:()=>route(ctx,null,{req:new Request('http://localhost/canvas/a',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({navigate:{itemId:1,file:{path:'/target'}}})}),params:{id:'a'}}),count:()=>navigated};}
test('file navigation refuses nonowner before changing target',async()=>{const f=fixture(true);expect((await f.call()).status).toBe(404);expect(f.count()).toBe(0);});
test('file navigation requires cookie-bound CSRF before changing target',async()=>{const f=fixture(false,false);expect((await f.call()).status).toBe(403);expect(f.count()).toBe(0);});
test('authorized file navigation preserves the existing operation',async()=>{const f=fixture();expect((await f.call()).status).toBe(200);expect(f.count()).toBe(1);});
