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
test('retired entry redirects GET and HEAD with validated shell query only',async()=>{
 for (const method of ['GET','HEAD']) {
  for (const [path,location] of [
   ['/old-ui','/'], ['/old-ui/','/'],
   ['/old-ui/agent/ab-1_/?agent=other&embedded=1&next=https://evil.test&token=secret','/?agent=ab-1_&embedded=1'],
   ['/old-ui/a/xy?new=1','/?agent=xy'],
   ['/old-ui?agent=xy&view=plugins','/?agent=xy&view=plugins'],
   ['/old-ui?new=1&view=automation','/?new=1&view=automation'],
   ['/old-ui?agent=%2F%2Fevil.test&embedded=evil&view=evil&redirect=//evil.test','/'],
   ['/old-ui?agent=new&demo=1','/'],
  ]) {
   const r=await handle(context(),null,{req:new Request('https://hyper.test'+path,{method})});
   expect(r?.status).toBe(302);expect(r?.headers.get('location')).toBe(location);
   expect(r?.headers.get('cache-control')).toBe('no-store');expect(await r?.text()).toBe('');
  }
 }
});
test('retired entry rejects writes without dispatching or replaying request bodies',async()=>{
 for (const method of ['POST','PUT','PATCH','DELETE','OPTIONS']) {
  const r=await handle(context(),null,{req:new Request('https://hyper.test/old-ui/agent/new',{method,body:'name=abc'})});
  expect(r?.status).toBe(405);expect(r?.headers.get('allow')).toBe('GET, HEAD');expect(r?.headers.has('location')).toBe(false);
 }
});
test('entry ignores canonical paths and rejects unsupported or malformed aliases',async()=>{
 const ctx=context();
 for(const path of ['/agent/ab','/old-ui-other']) expect(await handle(ctx,null,{req:new Request('https://hyper.test'+path)})).toBeUndefined();
 for(const path of ['/old-ui/old-ui/','/old-ui//evil.test','/old-ui/agent/new','/old-ui/a/new','/old-ui/agent/a%2Fb','/old-ui/agent/a/queue','/old-ui/settings']) {
  expect((await handle(ctx,null,{req:new Request('https://hyper.test'+path)}))?.status).toBe(404);
 }
});
test('dispatch reruns guards, and browser marker cannot select legacy',async()=>{
 let marker:any;let called=false;
 const ctx:any={env:{},fns:{procs:{http:{match:()=>({params:{},path:'/agent/a',handler:async()=>{called=true;return new Response('ok');}}),middleware:()=>[{handler:async(_ctx:any,session:any)=>{marker=session.legacyUi;return new Response('unauthorized',{status:401});}}]}}}};
 const r=await dispatch(ctx,null,{url:'https://hyper.test/agent/a',headers:{'x-legacy-ui':'true'}});
 expect(r.status).toBe(401);expect(marker).toBeUndefined();expect(called).toBe(false);
 await dispatch(ctx,null,{url:'https://hyper.test/agent/a',legacyUi:true});expect(marker).toBe(true);
});
