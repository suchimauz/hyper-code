import {test,expect} from 'bun:test';
import handle from './handle';
import rewrite from './rewriteResponse';
import navigation from './navigationUrl';
import dispatch from '../procs/http/dispatch';

const context = () => {
 const ctx:any={fns:{legacyUi:{}}};
 ctx.fns.legacyUi.navigationUrl=(opts:any)=>navigation(ctx,null,opts);
 ctx.fns.legacyUi.rewriteResponse=(opts:any)=>rewrite(ctx,null,opts);
 return ctx;
};
test('rewrites navigation, preserving assets, cookies and external URLs',async()=>{
 const ctx=context();
 const r=await rewrite(ctx,null,{origin:'https://hyper.test',response:new Response('<a href="/agent/ab?q=1">a</a><form action="/agent/new"></form><script src="/ui/app.js"></script><a href="https://other.test/">external</a><div hx-get="/agent/ab" hx-target="#main"></div>',{headers:{'content-type':'text/html','set-cookie':'sid=x; HttpOnly','hx-push-url':'/agent/ab'}})});
 expect(r.headers.get('set-cookie')).toBe('sid=x; HttpOnly');
 expect(r.headers.get('hx-push-url')).toBe('/old-ui/agent/ab');
 const html=await r.text();
 expect(html).toContain('href="/old-ui/agent/ab?q=1"');expect(html).toContain('action="/old-ui/agent/new"');expect(html).toContain('src="/ui/app.js"');expect(html).toContain('href="https://other.test/"');expect(html).toContain('hx-get="/old-ui/agent/ab"');
});
test('adapter retains origin query cookie CSRF and body, sets trusted dispatch flag',async()=>{
 const ctx=context(); let seen:any;
 ctx.fns.procs={http:{dispatch:async(opts:any)=>{seen=opts;return new Response(null,{status:303,headers:{location:'/agent/ab'}});}}};
 const req=new Request('https://hyper.test/old-ui/agent/new?q=1',{method:'POST',headers:{cookie:'session=x',origin:'https://hyper.test','x-csrf-token':'token'},body:'name=abc'});
 const r=await handle(ctx,null,{req});
 expect(seen.url).toBe('https://hyper.test/agent/new?q=1');expect(seen.request).toBe(req);expect(seen.legacyUi).toBe(true);expect(await seen.request.text()).toBe('name=abc');expect(seen.request.headers.get('cookie')).toBe('session=x');expect(seen.request.headers.get('x-csrf-token')).toBe('token');expect(r?.headers.get('location')).toBe('/old-ui/agent/ab');
});
test('adapter ignores canonical paths and rejects nested aliases',async()=>{
 const ctx=context(); expect(await handle(ctx,null,{req:new Request('https://hyper.test/agent/ab')})).toBeUndefined();
 expect((await handle(ctx,null,{req:new Request('https://hyper.test/old-ui/old-ui/')}))?.status).toBe(404);
});
test('dispatch reruns guards, and browser marker cannot select legacy',async()=>{
 let marker:any;let called=false;
 const ctx:any={env:{},fns:{procs:{http:{match:()=>({params:{},path:'/agent/a',handler:async()=>{called=true;return new Response('ok');}}),middleware:()=>[{handler:async(_ctx:any,session:any)=>{marker=session.legacyUi;return new Response('unauthorized',{status:401});}}]}}}};
 const r=await dispatch(ctx,null,{url:'https://hyper.test/agent/a',headers:{'x-legacy-ui':'true'}});
 expect(r.status).toBe(401);expect(marker).toBeUndefined();expect(called).toBe(false);
 await dispatch(ctx,null,{url:'https://hyper.test/agent/a',legacyUi:true});expect(marker).toBe(true);
});
