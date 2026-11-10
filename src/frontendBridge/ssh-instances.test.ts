import {describe,test,expect} from 'bun:test';
import ssh from './sshInstances';
import middleware from '../$middleware_ui-lab-api';

const owner={user:{id:'owner',role:'owner'}};
const item={name:'box',host:'h.example',user:'run',port:22,id:'x',publicKey:'ssh-ed25519 AAA mauzcode',pinnedHostKey:null,updatedAt:1};
function setup(){
 const calls:{fn:string;opts:any}[]=[];
 const rec=(fn:string,result:any)=>async(opts:any)=>{calls.push({fn,opts});if(result instanceof Error)throw result;return result;};
 const ctx:any={fns:{http:{publicOrigin:async()=>'https://mauzcode.test'},auth:{csrfToken:async()=>'csrf',verifyCsrf:async({token}:any)=>token==='csrf'},sshInstance:{list:rec('list',[item]),create:rec('create',item),save:rec('save',item),trust:rec('trust',{...item,pinnedHostKey:'ssh-ed25519 K'}),probe:rec('probe',{python3:true,codex:false,claude:true}),remove:rec('remove',undefined)}}};
 return {ctx,calls};
}
const get=()=>new Request('https://mauzcode.test/ui-lab-api/ssh-instances');
const post=(data:unknown,headers:Record<string,string>={})=>new Request('https://mauzcode.test/ui-lab-api/ssh-instances',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':'csrf',...headers},body:JSON.stringify(data)});
const run=(s:ReturnType<typeof setup>,req:Request,user:any=owner)=>ssh(s.ctx,user,{req});

describe('ui-lab ssh instances',()=>{
 test('requires a signed-in owner',async()=>{const s=setup();expect((await run(s,get(),null)).status).toBe(401);expect((await run(s,get(),{user:{id:'v',role:'viewer'}})).status).toBe(403);expect((await run(s,post({action:'probe',name:'box'}),{user:{id:'v',role:'member'}})).status).toBe(403);expect(s.calls).toHaveLength(0);});
 test('GET returns secret-free descriptors and csrf token',async()=>{const s=setup(),r=await run(s,get());expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');const body=await r.json();expect(body.csrfToken).toBe('csrf');expect(body.instances[0]).toEqual({name:'box',host:'h.example',user:'run',port:22,publicKey:'ssh-ed25519 AAA mauzcode',pinnedHostKey:null,updatedAt:1});});
 test('writes require CSRF, same origin and JSON',async()=>{for(const h of [{'x-csrf-token':'bad'},{origin:'https://evil.test'},{'sec-fetch-site':'cross-site'}]){const s=setup();expect((await run(s,post({action:'probe',name:'box'},h))).status).toBe(403);expect(s.calls).toHaveLength(0);}
  const s=setup();expect((await run(s,post({action:'probe',name:'box'},{'content-type':'text/plain'}))).status).toBe(415);expect(s.calls).toHaveLength(0);});
 test('validates actions and fields without calling native functions',async()=>{for(const data of [null,[],{action:'probe'},{action:'nope',name:'box'},{action:'create',name:'box',host:'h',user:'u',port:0},{action:'create',name:'box',host:'h',user:'u',port:'22'},{action:'trust',name:'box',hostKey:'ssh-ed25519 K'},{action:'remove',name:'box'},{action:'remove',name:'box',confirmed:'yes'}]){const s=setup();expect((await run(s,post(data))).status).toBe(400);expect(s.calls).toHaveLength(0);}});
 test('delegates each action exactly once',async()=>{
  let s=setup();expect((await run(s,post({action:'create',name:' box ',host:'h.example',user:'run',port:22}))).status).toBe(201);expect(s.calls).toEqual([{fn:'create',opts:{name:'box',host:'h.example',user:'run',port:22}}]);
  s=setup();await run(s,post({action:'trust',name:'box',hostKey:'ssh-ed25519 K',confirmed:true,replace:true}));expect(s.calls).toEqual([{fn:'trust',opts:{name:'box',hostKey:'ssh-ed25519 K',confirmed:true,replace:true}}]);
  s=setup();const p=await (await run(s,post({action:'probe',name:'box'}))).json();expect(p.probe).toEqual({python3:true,codex:false,claude:true});
  s=setup();expect((await run(s,post({action:'remove',name:'box',confirmed:true}))).status).toBe(200);expect(s.calls).toEqual([{fn:'remove',opts:{name:'box',confirmed:true}}]);
 });
 test('native errors map to 422 with message',async()=>{const s=setup();s.ctx.fns.sshInstance.create=async()=>{throw new Error('Instance already exists')};const r=await run(s,post({action:'create',name:'box',host:'h',user:'u',port:22}));expect(r.status).toBe(422);expect((await r.json()).error).toBe('Instance already exists');});
 test('rejects oversized bodies',async()=>{const s=setup();expect((await run(s,post({action:'probe',name:'box',pad:'x'.repeat(9000)}))).status).toBe(413);});
 test('middleware dispatches after authentication',async()=>{let n=0;const ctx:any={fns:{frontendBridge:{sshInstances:async()=>{n++;return Response.json({ok:true})}}}};expect((await middleware(ctx,null,{req:get()})).status).toBe(401);expect((await middleware(ctx,owner as any,{req:get()})).status).toBe(200);expect(n).toBe(1);});
});
