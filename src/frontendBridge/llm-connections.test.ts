import {describe,test,expect} from 'bun:test';
import llm from './llmConnections';
import middleware from '../$middleware_ui-lab-api';

const owner={user:{id:'owner',role:'owner'}};
const account={provider:'codex',account:'work',label:'Codex · work',model:'codex:gpt',source:'file',sshInstance:null,available:true,needsReconnect:false,usedPercent:12,resetsAt:null,windows:null,planType:'pro',resetCredits:null,parkedAgents:0,secret:'never'};
function setup(){
 const calls:{fn:string;opts:any}[]=[];
 const rec=(fn:string,result:any)=>async(opts:any)=>{calls.push({fn,opts});if(result instanceof Error)throw result;return result;};
 const ctx:any={state:{sshAccount:{flows:new Map([['r1',{id:'r1',instance:'box',provider:'claude-code',account:'a',status:'pending',verificationUri:'https://claude.ai/oauth/authorize',userCode:null,error:null,expiresAt:Date.now()+60000,process:{},callbackConnection:{bin:'ssh',args:[],host:'h'}}]])}},fns:{
  http:{publicOrigin:async()=>'https://hyper.test'},auth:{csrfToken:async()=>'csrf',verifyCsrf:async({token}:any)=>token==='csrf'},
  llm:{listAccounts:async()=>[account],accountLoginStatus:()=>[{provider:'codex',account:'new',status:'pending',verificationUri:'https://auth.openai.com/device',userCode:'ABCD',needsCode:false,error:null}],startAccountLogin:rec('startAccountLogin',{}),startXaiOAuth:rec('startXaiOAuth',{}),accountUsers:rec('accountUsers',[{id:'ag',title:'T',model:null}]),removeAccount:rec('removeAccount',{removed:true,provider:'codex',account:'work',archived:[]})},
  sshInstance:{list:async()=>[{name:'box',pinnedHostKey:'k'},{name:'raw',pinnedHostKey:null}]},
  sshAccount:{startLogin:rec('sshStartLogin',{id:'r2'}),startKimiLogin:rec('kimi',{id:'k1'}),status:async({id}:any)=>({id,instance:id==='r1'?'box':null}),submitCode:rec('submitCode',{ok:true}),cancel:rec('cancel',{ok:true})},
  llms:{submitLoginCode:rec('submitLoginCode','<html>')},
 }};
 return {ctx,calls};
}
const URL_='https://hyper.test/ui-lab-api/llm-connections';
const get=()=>new Request(URL_);
const post=(data:unknown,headers:Record<string,string>={})=>new Request(URL_,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':'csrf',...headers},body:JSON.stringify(data)});
const run=(s:ReturnType<typeof setup>,req:Request,user:any=owner)=>llm(s.ctx,user,{req});

describe('ui-lab llm connections',()=>{
 test('requires a signed-in owner',async()=>{const s=setup();expect((await run(s,get(),null)).status).toBe(401);expect((await run(s,get(),{user:{id:'v',role:'member'}})).status).toBe(403);expect((await run(s,post({action:'login',provider:'codex',account:'x'}),{user:{id:'v',role:'member'}})).status).toBe(403);expect(s.calls).toHaveLength(0);});
 test('GET returns secret-free rows, logins, trusted instances and csrf',async()=>{const s=setup(),r=await run(s,get());expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');const b=await r.json();expect(b.csrfToken).toBe('csrf');expect(b.accounts[0].secret).toBeUndefined();expect(b.accounts[0].account).toBe('work');expect(b.instances).toEqual(['box']);expect(b.logins.map((l:any)=>l.userCode??l.id)).toEqual(['ABCD','r1']);expect(b.logins[1].needsCode).toBe(true);expect(JSON.stringify(b)).not.toContain('callbackConnection');});
 test('writes require CSRF, same origin and JSON',async()=>{for(const h of [{'x-csrf-token':'bad'},{origin:'https://evil.test'},{'sec-fetch-site':'cross-site'}]){const s=setup();expect((await run(s,post({action:'cancel',id:'r1'},h))).status).toBe(403);expect(s.calls).toHaveLength(0);}const s=setup();expect((await run(s,post({action:'cancel',id:'r1'},{'content-type':'text/plain'}))).status).toBe(415);expect((await run(s,post({action:'cancel',pad:'x'.repeat(9000)}))).status).toBe(413);});
 test('validates fields without calling native functions',async()=>{for(const data of [{action:'login',provider:'oneapi',account:'a'},{action:'login',provider:'codex',account:'default'},{action:'login',provider:'codex',account:'bad name'},{action:'login',provider:'xai',account:'a',instance:'box'},{action:'remove',provider:'codex',account:'work'},{action:'remove',provider:'zai-coding',account:'default',confirmed:true},{action:'cancel'},{action:'nope'}]){const s=setup();expect((await run(s,post(data))).status).toBe(400);expect(s.calls).toHaveLength(0);}});
 test('delegates actions to native functions',async()=>{
  let s=setup();expect((await run(s,post({action:'login',provider:'codex',account:'work'}))).status).toBe(201);expect(s.calls).toEqual([{fn:'startAccountLogin',opts:{provider:'codex',account:'work'}}]);
  s=setup();expect((await (await run(s,post({action:'login',provider:'claude-code',account:'w',instance:'box'}))).json()).id).toBe('r2');expect(s.calls[0]).toEqual({fn:'sshStartLogin',opts:{instance:'box',provider:'claude-code',account:'w'}});
  s=setup();await run(s,post({action:'code',id:'r1',code:'http://localhost:1234/callback?code=1'}));expect(s.calls[0]!.fn).toBe('submitCode');
  s=setup();await run(s,post({action:'code',provider:'claude-code',account:'w',code:'abc'}));expect(s.calls).toEqual([{fn:'submitLoginCode',opts:{provider:'claude-code',account:'w',code:'abc'}}]);
  s=setup();await run(s,post({action:'remove',provider:'codex',account:'work',confirmed:true,archiveUsers:true}));expect(s.calls).toEqual([{fn:'removeAccount',opts:{provider:'codex',account:'work',archiveUsers:true}}]);
 });
 test('native errors map to 422',async()=>{const s=setup();s.ctx.fns.llm.startAccountLogin=async()=>{throw new Error('already running')};const r=await run(s,post({action:'login',provider:'codex',account:'w'}));expect(r.status).toBe(422);expect((await r.json()).error).toBe('already running');});
 test('middleware dispatches after authentication',async()=>{let n=0;const ctx:any={fns:{frontendBridge:{llmConnections:async()=>{n++;return Response.json({ok:true})}}}};expect((await middleware(ctx,null,{req:get()})).status).toBe(401);expect((await middleware(ctx,owner as any,{req:get()})).status).toBe(200);expect(n).toBe(1);});
});
