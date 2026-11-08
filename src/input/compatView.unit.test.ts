import { test, expect } from 'bun:test';
import view from './compatView';
const fixture = () => ({ fns: { procs: { db: { select: async () => [{id:'one',kind:'secret',title:'Secret'},{id:'two',kind:'choice',title:'Choice'}] } }, auth: { csrfToken: async () => 'csrf-test' }, input: { card: async () => '<form hx-post="/input/one"><input type="password"></form>' } }, state: { procs: {styles: [{href:'/style.css'}]} } });
const session = {user:{id:'owner',role:'owner'}};
test('compat denies anonymous, nonowner, cross-site and mutations',async()=>{
 for(const [s,req] of [[null,new Request('http://local/input/compat?agentId=a')],[{user:{role:'user'}},new Request('http://local/input/compat?agentId=a')],[session,new Request('http://local/input/compat?agentId=a',{headers:{'sec-fetch-site':'cross-site'}})],[session,new Request('http://local/input/compat?agentId=a',{method:'POST'})]] as const){const res=await view(fixture() as any,s as any,{req});expect(res.status).toBeGreaterThanOrEqual(400);}
});
test('metadata excludes native kinds and secrets',async()=>{
 const res=await view(fixture() as any,session as any,{req:new Request('http://local/input/compat?agentId=a')});expect(await res.json()).toEqual({inputs:[{id:'one',kind:'secret',title:'Secret'}]});
});
test('document contains existing transports, CSRF and assets, is private and same-origin framed',async()=>{
 const res=await view(fixture() as any,session as any,{req:new Request('http://local/input/compat?agentId=a&id=one')});const html=await res.text();expect(html).toContain('<!doctype html>');expect(html).toContain('/procs/ui/htmx.js');expect(html).toContain('csrf-test');expect(html).toContain('hx-post="/input/one"');expect(html).not.toContain('/old-ui');expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');expect(res.headers.get('cache-control')).toBe('no-store');
});
test('foreign or closed input cannot render',async()=>{const res=await view(fixture() as any,session as any,{req:new Request('http://local/input/compat?agentId=a&id=foreign')});expect(res.status).toBe(404);});
test('archived agent or mismatched input fails closed, missing browser token denies document',async()=>{
 const ctx=fixture();ctx.fns.procs.db.select=async()=>[];
 const req=new Request('http://local/input/compat?agentId=archived&id=one');expect((await view(ctx as any,session as any,{req})).status).toBe(404);
 const noToken=fixture();noToken.fns.auth.csrfToken=async()=>'';expect((await view(noToken as any,session as any,{req:new Request('http://local/input/compat?agentId=a&id=one')})).status).toBe(403);
 expect((await view(fixture() as any,session as any,{req:new Request('http://local/input/compat?agentId=a',{headers:{origin:'http://foreign'}})})).status).toBe(403);
});
