import {test, expect} from 'bun:test';
// Test harness loads leaf modules without mounting a second application.
const {default: proxy} = await import('./proxy');
const {default: authorize} = await import('./authorizeSocket');
const {default: endpoint} = await import('../$ws_ui-lab_hmr');
const session = {user:{id:'test-only'}} as any;
const ctx = {fns:{procs:{project:{projectRoot:()=>import.meta.dir+'/../..'}},http:{publicOrigin:async()=> 'http://127.0.0.1:5197'},frontendBridge:{authorizeSocket:({req}:any)=>authorize(ctx as any,session,{req})}}};
test('HTTP guards: no user, write methods, filesystem and encoded paths',async()=>{
 expect((await proxy(ctx as any,null,{req:new Request('http://local/ui-lab/')}))?.status).toBe(401);
 for(const path of ['/ui-lab/@fs/etc/passwd','/ui-lab/%2540fs/etc/passwd','/ui-lab/%2fetc/passwd']) expect((await proxy(ctx as any,session,{req:new Request('http://local'+path)}))?.status).toBe(403);
 expect((await proxy(ctx as any,session,{req:new Request('http://local/ui-lab/',{method:'POST'})}))?.status).toBe(405);
});
test('Live Vite GET, HEAD and module paths',async()=>{
 for(const path of ['/ui-lab/','/ui-lab/@vite/client']) {
 const response=await proxy(ctx as any,session,{req:new Request('http://local'+path)});
 expect(response?.status).toBe(200);expect(response?.headers.get('set-cookie')).toBeNull();
 expect((await response!.text()).length).toBeGreaterThan(100);
 }
 const head=await proxy(ctx as any,session,{req:new Request('http://local/ui-lab/',{method:'HEAD'})});expect(head?.status).toBe(200);expect(await head!.text()).toBe('');
});
test('WS rejects missing user, missing/foreign Origin and wrong protocol',async()=>{
 const req=(origin?:string,protocol='vite-hmr')=>new Request('http://127.0.0.1:5197/ui-lab/hmr',{headers:{...(origin?{origin}:{}),'sec-websocket-protocol':protocol}});
 expect((await authorize(ctx as any,null,{req:req('http://127.0.0.1:5197')}))?.status).toBe(401);
 for(const origin of [undefined,'https://evil.example','https://127.0.0.1:5197'])expect((await authorize(ctx as any,session,{req:req(origin)}))?.status).toBe(403);
 expect((await authorize(ctx as any,session,{req:req('http://127.0.0.1:5197','other')}))?.status).toBe(400);
 expect(await authorize(ctx as any,session,{req:req('http://127.0.0.1:5197')})).toBeUndefined();
});
test('Live HMR bridge receives Vite connected message and closes cleanly',async()=>{
 const source=await (await fetch('http://127.0.0.1:5174/ui-lab/@vite/client')).text();
 const token=/const wsToken = "([^"]+)"/.exec(source)?.[1];
 expect(token).toBeTruthy();
 const server=Bun.serve({hostname:'127.0.0.1',port:5197,async fetch(req,server){
 const state=await endpoint.upgrade(ctx as any,session,{req});if(state instanceof Response)return state;
 if(server.upgrade(req,{data:{state,url:req.url}}))return;
 return new Response('upgrade failed',{status:400});
 },websocket:{open(ws){endpoint.open(ctx as any,session,{ws});},message(ws,message){endpoint.message(ctx as any,session,{ws,message});},close(ws){endpoint.close(ctx as any,session,{ws});}}});
 try {
 await new Promise<void>((resolve,reject)=>{
 const client=new WebSocket('ws://127.0.0.1:5197/ui-lab/hmr?token='+token,{protocols:['vite-hmr'],headers:{origin:'http://127.0.0.1:5197'}});
 const timer=setTimeout(()=>{client.close();reject(new Error('No HMR connected frame'));},5000);
 client.onmessage=event=>{try{expect(JSON.parse(String(event.data)).type).toBe('connected');clearTimeout(timer);client.close();resolve();}catch(e){clearTimeout(timer);client.close();reject(e);}};
 client.onerror=()=>{clearTimeout(timer);reject(new Error('HMR error'));};
 });
 }finally{server.stop(true);}
});
