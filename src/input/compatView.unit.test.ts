import { test, expect } from 'bun:test';
import view from './compatView';
const fixture = () => ({ fns: { procs: { db: { select: async () => [{id:'one',kind:'secret',title:'Secret'},{id:'two',kind:'choice',title:'Choice'}] } }, auth: { csrfToken: async () => 'csrf-test' }, input: { card: async () => '<form hx-post="/input/one"><input type="password"></form>', get: async () => null as any } }, state: { procs: {styles: [{href:'/style.css'}]} } });
const session = {user:{id:'owner',role:'owner'}};
test('compat denies anonymous, nonowner, cross-site and mutations',async()=>{
 for(const [s,req] of [[null,new Request('http://local/input/compat?agentId=a')],[{user:{role:'user'}},new Request('http://local/input/compat?agentId=a')],[session,new Request('http://local/input/compat?agentId=a',{headers:{'sec-fetch-site':'cross-site'}})],[session,new Request('http://local/input/compat?agentId=a',{method:'POST'})]] as const){const res=await view(fixture() as any,s as any,{req});expect(res.status).toBeGreaterThanOrEqual(400);}
});
test('metadata lists generic fallback kinds without specs or results',async()=>{
 const res=await view(fixture() as any,session as any,{req:new Request('http://local/input/compat?agentId=a')});expect(await res.json()).toEqual({inputs:[{id:'one',kind:'secret',title:'Secret'},{id:'two',kind:'choice',title:'Choice'}]});
});
test('document contains existing transports, CSRF and assets, is private and same-origin framed',async()=>{
 const res=await view(fixture() as any,session as any,{req:new Request('http://local/input/compat?agentId=a&id=one')});const html=await res.text();expect(html).toContain('<!doctype html>');expect(html).toContain('/procs/ui/htmx.js');expect(html).toContain('csrf-test');expect(html).toContain('hx-post="/input/one"');expect(html).not.toContain('/old-ui');expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');expect(res.headers.get('cache-control')).toBe('no-store');
});
const row = {id:'one',agentId:'a',kind:'secret',state:'open',title:'Key </script>',message:'Paste it',spec:{saveAs:'secret://t/k',mode:'otp',maxlength:16},result:null,error:null,answeredBy:null,createdAt:0,updatedAt:0};
test('metadata exposes secret card copy but never values',async()=>{
 const ctx:any=fixture();ctx.fns.input.get=async()=>row;
 const res=await view(ctx,session as any,{req:new Request('http://local/input/compat?agentId=a')});
 expect(await res.json()).toEqual({inputs:[{id:'one',kind:'secret',title:'Secret',message:'Paste it',saveAs:'secret://t/k',mode:'otp'},{id:'two',kind:'choice',title:'Choice'}]});
});
test('field view is a single themed input with JSON submit transport',async()=>{
 const ctx:any=fixture();ctx.fns.input.get=async()=>row;
 const res=await view(ctx,session as any,{req:new Request('http://local/input/compat?agentId=a&id=one&view=field&theme=dark')});const html=await res.text();
 expect(html).toContain('data-theme="dark"');expect(html).toContain('/ui/vendor/tokens.css');expect(html).toContain('autocomplete="one-time-code"');expect(html).toContain('maxlength="16"');
 expect(html).toContain('csrf-test');expect(html).not.toContain('htmx');expect(html).not.toContain('Key </script>');expect(html.match(/<input/g)).toHaveLength(1);
 expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
});
test('foreign or closed input cannot render',async()=>{const res=await view(fixture() as any,session as any,{req:new Request('http://local/input/compat?agentId=a&id=foreign')});expect(res.status).toBe(404);});
test('archived agent or mismatched input fails closed, missing browser token denies document',async()=>{
 const ctx=fixture();ctx.fns.procs.db.select=async()=>[];
 const req=new Request('http://local/input/compat?agentId=archived&id=one');expect((await view(ctx as any,session as any,{req})).status).toBe(404);
 const noToken=fixture();noToken.fns.auth.csrfToken=async()=>'';expect((await view(noToken as any,session as any,{req:new Request('http://local/input/compat?agentId=a&id=one')})).status).toBe(403);
 expect((await view(fixture() as any,session as any,{req:new Request('http://local/input/compat?agentId=a',{headers:{origin:'http://foreign'}})})).status).toBe(403);
});

test('arbitrary plugin kind retains its server-side transport without a React approval',async()=>{
 const ctx=fixture();ctx.fns.procs.db.select=async()=>[{id:'one',kind:'example-review',title:'Plugin review'}];
 const res=await view(ctx as any,session as any,{req:new Request('http://local/input/compat?agentId=a&id=one')});
 expect(res.status).toBe(200);expect(await res.text()).toContain('hx-post="/input/one"');
});
