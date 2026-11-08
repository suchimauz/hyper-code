import { test, expect } from 'bun:test';
import inferenceOwner from '../codexAccount/inferenceOwner';
import binding from '../codexAccount/binding';
import scopedService from './scopedService';
import runtime from './runtime';
import importSelected from './importSelected';
import dispatch from './dispatch';
const slot={instance:'aeza-criminal-amarant',account:'test'};
function fixture(kind='agent',storedOwner='owner-a') {
 const agent={id:'fixture'};
 const session:any=kind==='browser'?{kind:'http',user:{id:'owner-a',role:'owner'}}:{kind,agent,agentId:agent.id};
 const gate={run:async(f:any)=>f(),acquire:async()=>async()=>{},within:async(f:any)=>f()};
 const state:any={agent:{fixture:agent}};
 let record:any=null;
 const ctx:any={state,fns:{procs:{db:{select:async()=>[{created_by:storedOwner}]}},sshAccount:{requireOwner:async()=>{},legacyFetch:async()=>new Response('legacy')},sshInstance:{get:async()=>({id:'host',host:'host',user:'user',port:22,publicKey:'public',pinnedHostKey:'pin'})},codexAccount:{},codexTunnel:{}}};
 ctx.fns.codexAccount.inferenceOwner=()=>inferenceOwner(ctx,session,{});
 ctx.fns.codexAccount.binding=(o:any)=>binding(ctx,session,o);
 Object.assign(ctx.fns.codexTunnel,{mutation:()=>gate,runtime:(o:any)=>runtime(ctx,session,o),scopedService:(o:any)=>scopedService(ctx,session,o),encryptedStore:()=>({read:async()=>record})});
 return {ctx,session,setRecord:(r:any)=>record=r};
}
test('browser and bound worker owner reach actual scoped runtime dispatch',async()=>{
 for(const kind of ['browser','agent']) {const f=fixture(kind);expect(await inferenceOwner(f.ctx,f.session,{})).toBe('owner-a');const response=await dispatch(f.ctx,f.session,{request:{ssh:{...slot,provider:'codex'},url:'https://example.invalid',init:{}}});expect(await response.text()).toBe('legacy');}
});
test('null, unknown, request-bearing, detached and mismatched agent sessions reject',async()=>{
 const f=fixture();for(const session of [null,{kind:'repl'}, {...f.session,kind:'unknown'},{...f.session,req:new Request('http://localhost')},{...f.session,agent:{id:'fixture'}},{...f.session,agentId:'other'},{kind:'http',user:{id:'owner-a',role:'member'}}]) await expect(inferenceOwner(f.ctx,session as any,{})).rejects.toThrow();
 f.ctx.fns.procs.db.select=async()=>[];await expect(inferenceOwner(f.ctx,f.session,{})).rejects.toThrow('Agent owner required');
});
test('persisted cross-owner credentials reject before transport',async()=>{
 const f=fixture();const b=await f.ctx.fns.codexAccount.binding(slot);f.setRecord({revision:1,value:{version:1,binding:b.fingerprint,owner:'owner-b',mode:'socks'}});
 await expect(dispatch(f.ctx,f.session,{request:{ssh:{...slot,provider:'codex'},url:'https://example.invalid',init:{}}})).rejects.toThrow('Account request failed; no fallback');
});
test('captured runtime rechecks durable owner and exact slot',async()=>{
 const f=fixture();const service=await scopedService(f.ctx,f.session,slot);const b=await f.ctx.fns.codexAccount.binding(slot);f.setRecord({revision:1,value:{version:1,binding:b.fingerprint,owner:'owner-a',mode:'legacy'}});f.ctx.fns.procs.db.select=async()=>[{created_by:'owner-b'}];
 await expect(service.runtime.fetch({ssh:{...slot,provider:'codex'},url:'x',init:{}})).rejects.toThrow('Account request failed; no fallback');
 await expect(service.runtime.fetch({ssh:{...slot,account:'su4imauz',provider:'codex'},url:'x',init:{}})).rejects.toThrow('Scoped owner or slot mismatch');
});
test('import still requires actual owner user and protected slot is rejected',async()=>{
 const f=fixture();await expect(importSelected(f.ctx,f.session,{...slot,confirmedUnused:true})).rejects.toThrow('Authenticated owner required');await expect(scopedService(f.ctx,f.session,{...slot,account:'su4imauz'})).rejects.toThrow('Scoped slot prohibited');
});
