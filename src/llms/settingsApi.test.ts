import { describe, expect, test } from 'bun:test';
import api from './settingsApi';
const owner = {user:{role:'owner'}} as any;
function setup() {
 const writes: object[] = [];
 const ctx: any = {fns:{
  auth:{csrfToken:async()=> 'csrf',verifyCsrf:async({token}:any)=>token==='csrf'},
  http:{publicOrigin:async()=> 'https://hyper.test'},
  llm:{listModels:async()=>({codex:['codex:a']}),modelPolicy:async(o:any)=>{if(o.action==='set')writes.push(o);return {disabledModels:['codex:b']};},codingInstance:async()=>({instance:null})},
  sshInstance:{list:async()=>[{name:'trusted',pinnedHostKey:'pin'},{name:'untrusted'}]},
  settings:{getString:async()=> 'standard',set:async(o:any)=>{writes.push(o);}},
  node:{list:async()=>[{name:'node',url:'https://user:secret@node',token:'SECRET',enabled:true,catalog:[],catalogAt:null,usageAt:null}]}
 }};
 return {ctx,writes};
}
const post=(body:object, token='csrf', origin='https://hyper.test')=>new Request('https://hyper.test/llms/settings',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':token,origin},body:JSON.stringify(body)});
describe('native model settings security and writes',()=>{
 test('requires owner before data reads or writes',async()=>{
  const {ctx,writes}=setup();
  expect((await api(ctx,null,{req:post({action:'tier',tier:'priority'})})).status).toBe(401);
  expect((await api(ctx,{user:{role:'member'}} as any,{req:post({action:'tier',tier:'priority'})})).status).toBe(403);
  expect(writes).toEqual([]);
 });
 test('GET allowlists fields and preserves disabled model routes',async()=>{
  const {ctx}=setup(); const res=await api(ctx,owner,{req:new Request('https://hyper.test/llms/settings')});
  const data=await res.json(); expect(data.models).toEqual(['codex:a','codex:b']);expect(data.instances).toEqual(['trusted']);
  expect(JSON.stringify(data)).not.toContain('SECRET');expect(JSON.stringify(data)).not.toContain('https://user');
  expect(res.headers.get('Cache-Control')).toBe('no-store');
 });
 test('blocks CSRF and cross-origin requests',async()=>{
  const {ctx,writes}=setup();
  expect((await api(ctx,owner,{req:post({action:'tier',tier:'priority'},'bad')})).status).toBe(403);
  expect((await api(ctx,owner,{req:post({action:'tier',tier:'priority'},'csrf','https://evil.test')})).status).toBe(403);
  expect(writes).toEqual([]);
 });
 test('validates provider, host trust, tier and explicit boolean',async()=>{
  const {ctx,writes}=setup();
  for(const body of [{action:'instance',provider:'opencode',instance:'untrusted'},{action:'instance',provider:'__proto__',instance:''},{action:'tier',tier:'fast'},{action:'model',model:'codex:a',disabled:'false'}]) expect((await api(ctx,owner,{req:post(body)})).status).toBe(400);
  expect(writes).toEqual([]);
 });
 test('writes exact model, instance and admission settings without login',async()=>{
  const {ctx,writes}=setup();
  for(const body of [{action:'model',model:'codex:a',disabled:true},{action:'instance',provider:'opencode',instance:'trusted'},{action:'tier',tier:'priority'}]) expect((await api(ctx,owner,{req:post(body)})).status).toBe(200);
  expect(writes).toEqual([{action:'set',model:'codex:a',disabled:true},{module:'llm',scopeType:'global',key:'opencodeInstance',value:'trusted'},{module:'llm',scopeType:'global',key:'minimaxCodingServiceTier',value:'priority'}]);
 });
});
