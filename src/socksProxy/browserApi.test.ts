import {test,expect} from 'bun:test';
import {mkTestCtx} from '../_testCtx.entry';
import {makeRequestCtx} from '../procs/boot/requestCtx';
const setup=async()=>{const c=await mkTestCtx();c.state.registry.auth.currentUser=async()=>({required:true,user:{role:'owner'}});c.state.registry.auth.verifyCsrf=async(_c:any,_s:any,o:any)=>o.token==='valid';c.state.registry.http.publicOrigin=async()=> 'https://app.test';return c;};
test('browser check propagates request cancellation through the real session proxy',async()=>{
 const c=await setup();const controller=new AbortController();const request=new Request('https://app.test/settings/proxies',{method:'POST',headers:{origin:'https://app.test','content-type':'application/json','x-csrf-token':'valid'},body:JSON.stringify({action:'check',id:'00000000-0000-4000-8000-000000000001'}),signal:controller.signal});
 let entered!:()=>void;const storage=new Promise<void>(r=>entered=r);c.state.registry.socksProxy.readSaved=async()=>{entered();return new Promise(()=>{});};c.state.registry.socksProxy.probeTransport=async()=>{throw new Error('must not dial');};
 const rctx=makeRequestCtx(c,{req:request} as any);const pending=rctx.fns.socksProxy.browserApi({req:request});await storage;controller.abort();expect((await (await pending).json()).code).toBe('cancelled');
});
const req=(data:any,headers:Record<string,string>={})=>new Request('https://app.test/settings/proxies',{method:'POST',headers:{origin:'https://app.test','content-type':'application/json','x-csrf-token':'valid',...headers},body:typeof data==='string'?data:JSON.stringify(data)});
test('browser owner authentication and CSRF origin protections fail closed',async()=>{
 const c=await setup();const call=(r:Request)=>c.fns.socksProxy.browserApi({req:r});
 c.state.registry.auth.currentUser=async()=>({required:true,user:null});expect((await call(new Request('https://app.test/settings/proxies'))).status).toBe(401);
 c.state.registry.auth.currentUser=async()=>({required:true,user:{role:'member'}});expect((await call(req({action:'add'}))).status).toBe(403);
 c.state.registry.auth.currentUser=async()=>({required:true,user:{role:'owner'}});
 for(const headers of [{origin:'https://evil.test'},{'sec-fetch-site':'cross-site'},{'x-csrf-token':'bad'}])expect((await call(req({action:'add'},headers))).status).toBe(403);
 expect((await call(req({}, {'content-type':'text/plain'}))).status).toBe(415);
 expect((await call(req('x'.repeat(65537)))).status).toBe(413);expect((await call(req('{'))).status).toBe(400);expect((await call(req([]))).status).toBe(400);
});
test('browser safe snapshots CRUD conflict and saved-only check responses',async()=>{
 const c=await setup();const call=(r:Request)=>c.fns.socksProxy.browserApi({req:r});
 const added=await call(req({action:'add',host:'localhost',port:1080,auth:false}));expect(added.status).toBe(200);const {item}=await added.json();
 const listed=await call(new Request('https://app.test/settings/proxies'));expect(await listed.json()).toEqual({items:[{...item,users:[]}]});expect(listed.headers.get('cache-control')).toBe('no-store');
 expect((await call(req({action:'update',id:item.id,revision:2,host:'localhost',port:1080,auth:false}))).status).toBe(409);
 let args:any;c.state.registry.socksProxy.check=async(_c:any,_s:any,o:any)=>{args=o;return {code:'rate_limit',retryAfter:3};};const checked=await call(req({action:'check',id:item.id,host:'evil',password:'sensitive'}));expect(args).toEqual({id:item.id});expect(checked.status).toBe(429);expect(checked.headers.get('retry-after')).toBe('3');
 c.state.registry.socksProxy.create=async()=>{throw new Error('password=LEAK_ME secret://socksProxy/private');};const failed=await call(req({action:'add'}));expect(failed.status).toBe(500);expect(await failed.text()).not.toMatch(/LEAK_ME|secret:\/\//);
 expect((await call(req({action:'remove',id:item.id,revision:1}))).status).toBe(200);
});
