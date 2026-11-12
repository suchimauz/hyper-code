import {test,expect} from 'bun:test';
import {mkTestCtx} from '../_testCtx.entry';
import retryDecision from './retryDecision';
import proxyFailure from './proxyFailure';
import call from './call';
import stream from './streamAnthropic';
import compactor from './$compaction_anthropic';
import parseModelRouteFn from "./parseModelRoute";
const setup=()=>mkTestCtx({env:{MAUZCODE_OAUTH_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}});
const tokens={access:'private-access',refresh:'private-refresh',expiresAt:Date.now()+3600000};
const fail=()=>Object.assign(new Error('ECONNREFUSED: proxy connection refused'),{code:'PROXY_CONNECT',retryable:true,noFallback:true,requestSent:false});

test('all managed Claude destinations use saved SOCKS credentials and never direct fetch',async()=>{
 const c=await setup();const p=await c.fns.socksProxy.create({host:'127.0.0.1',port:1080,auth:true,username:'user',password:'secret'});
 await c.fns.llm.saveAnthropicOAuth({...tokens,account:'bound',proxyId:p.id});
 const calls:any[]=[];
 c.state.registry.socksProxy.request=async(_c:any,_s:any,o:any)=>{calls.push(o);return Response.json({ok:true});};
 c.state.registry.llm.connectFetch=()=>{throw Error('DIRECT FORBIDDEN');};
 for(const [url,method] of [['https://api.anthropic.com/v1/messages','POST'],['https://api.anthropic.com/v1/messages/count_tokens','POST'],['https://api.anthropic.com/api/oauth/usage','GET'],['https://api.anthropic.com/api/oauth/profile','GET'],['https://platform.claude.com/v1/oauth/token','POST']]){
  expect((await c.fns.llm.claudeFetch({account:'bound',url,init:{method}})).ok).toBe(true);
 }
 expect(calls).toHaveLength(5);expect(calls.every(x=>x.proxy.password==='secret')).toBe(true);
 c.state.registry.socksProxy.request=()=>{throw fail();};
 await expect(c.fns.llm.claudeFetch({account:'bound',url:'https://api.anthropic.com/v1/messages',init:{method:'POST'}})).rejects.toMatchObject({code:'PROXY_CONNECT',noFallback:true,failure:{retryable:true}});
 await expect(c.fns.llm.claudeFetch({account:'bound',url:'https://other.invalid/',init:{method:'GET'}})).rejects.toMatchObject({code:'PROXY_CONFIG',retryable:false});
 await c.fns.llm.logoutAnthropicOAuth({account:'bound'});
 await expect(c.fns.llm.claudeFetch({account:'bound',url:'https://api.anthropic.com/v1/messages',init:{method:'POST'}})).rejects.toMatchObject({code:'PROXY_CONFIG'});
});

test('OAuth code exchange and refresh retain proxy; ambiguous rotation is never replayed',async()=>{
 const c=await setup();const p=await c.fns.socksProxy.create({host:'127.0.0.1',port:1080,auth:false});let requests=0;
 c.state.registry.socksProxy.request=async()=>{requests++;return Response.json({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600});};
 const login=await c.fns.llm.startAnthropicOAuth({account:'oauth',proxyId:p.id,listen:false});
 const state=new URL(login.authorizationUrl).searchParams.get('state')!;
 await c.fns.llm.completeAnthropicOAuth({input:`code#${state}`});
 expect(requests).toBe(1);expect((await c.fns.llm.accountProxy({provider:'anthropic-oauth',account:'oauth'}))?.id).toBe(p.id);
 await c.fns.procs.db.run({sql:'UPDATE oauth_credentials SET expires_at=0 WHERE account=?',params:['oauth']});
 c.state.registry.socksProxy.request=async()=>{requests++;throw fail();};
 await expect(c.fns.llm.getAnthropicOAuthToken({account:'oauth'})).rejects.toMatchObject({code:'PROXY_CONNECT'});
 expect((await c.fns.procs.db.select({sql:'SELECT refresh_uncertain FROM oauth_credentials WHERE account=?',params:['oauth']}))[0].refresh_uncertain).toBe(false);
 c.state.registry.socksProxy.request=async()=>{requests++;throw Object.assign(fail(),{requestSent:true});};
 await expect(c.fns.llm.getAnthropicOAuthToken({account:'oauth'})).rejects.toMatchObject({code:'OAUTH_OUTCOME_UNKNOWN',retryable:false});
 const before=requests;
 await expect(c.fns.llm.getAnthropicOAuthToken({account:'oauth'})).rejects.toMatchObject({code:'OAUTH_OUTCOME_UNKNOWN'});
 expect(requests).toBe(before);
});

test('cancelled OAuth callback cannot resurrect an account; deleted pending proxy never creates direct account',async()=>{
 const c=await setup();const p=await c.fns.socksProxy.create({host:'127.0.0.1',port:1080,auth:false});
 const login=await c.fns.llm.startAnthropicOAuth({account:'pending',proxyId:p.id,listen:false});
 await c.fns.socksProxy.remove({id:p.id,revision:1});
 await expect(c.fns.llm.completeAnthropicOAuth({input:`code#${new URL(login.authorizationUrl).searchParams.get('state')}`})).rejects.toThrow('no longer exists');
 expect(await c.fns.procs.db.select({sql:'SELECT account FROM oauth_credentials WHERE account=?',params:['pending']})).toEqual([]);
 const second=await c.fns.llm.startAnthropicOAuth({account:'cancelled',listen:false});
 const flow=c.fns.llm.accountLoginStatus({}).find((f:any)=>f.account==='cancelled')!;
 await c.fns.llm.cancelAnthropicOAuth({id:flow.id!});
 await expect(c.fns.llm.completeAnthropicOAuth({input:`code#${new URL(second.authorizationUrl).searchParams.get('state')}`})).rejects.toThrow('expired');
});

for(const mode of ['normal','always'])test(`proxy retries hard-cap five under ${mode}, respect smaller/zero and legacy codes`,async()=>{
 const failure=proxyFailure({} as any,null,{error:fail(),provider:'anthropic-oauth',account:'a'})!;
 for(const cap of [0,2,99]){
  const c:any={fns:{settings:{get:async()=>({mode,maxRetries:cap,initialDelayMs:0,retryableCodes:['TRANSPORT','TIMEOUT']})}}};
  for(let retry=0;retry<7;retry++)expect((await retryDecision(c,null,{failure,retry})).retry).toBe(retry<Math.min(cap,5));
 }
});

test('standalone Claude call uses exactly six attempts and never alternate account/model',async()=>{
 let attempts=0;const resolved:string[]=[];
 const c:any={env:{},fns:{llm:{ parseModelRoute: (o: any) => parseModelRouteFn({} as any, null, o),
  resolveEndpoint:async({model}:any)=>{resolved.push(model);return {api:'anthropic',provider:'anthropic-oauth',modelId:'claude-test',account:'bound',url:'https://api.anthropic.com/v1/messages',apiKey:'token',noFallback:true};},
  getAnthropicOAuthToken:async()=> 'token',claudeCodeCliVersion:async()=> 'test',claudeFetch:async()=>{attempts++;throw fail();},
  proxyFailure:(o:any)=>proxyFailure(c,null,o),retryDecision:(o:any)=>retryDecision(c,null,o),retryDelay:async()=>{},
 },settings:{get:async()=>({mode:'always',maxRetries:50,initialDelayMs:0})}}};
 await expect(call(c,null,{user:'hello',model:'anthropic-oauth/bound:claude-test'})).rejects.toMatchObject({code:'PROXY_CONNECT'});
 expect(attempts).toBe(6);expect(new Set(resolved)).toEqual(new Set(['anthropic-oauth/bound:claude-test']));
});

test('compaction never switches strategy after a proxy failure',async()=>{
 let attempts=0,fallback=0;
 const c:any={state:{compaction:{compactors:{default:{compact:()=>{fallback++;throw Error('fallback forbidden');}}}}},fns:{llm:{ parseModelRoute: (o: any) => parseModelRouteFn({} as any, null, o),
 resolveEndpoint:async()=>({provider:'anthropic-oauth',account:'bound',noFallback:true}),compactAnthropic:async()=>{attempts++;throw fail();},proxyFailure:(o:any)=>proxyFailure(c,null,o),retryDecision:(o:any)=>retryDecision(c,null,o),retryDelay:async()=>{},
 },settings:{get:async()=>({mode:'always',maxRetries:50,initialDelayMs:0})}}};
 await expect(compactor(c,null,{model:'anthropic-oauth/bound:claude-test',messages:[]} as any)).rejects.toMatchObject({code:'PROXY_CONNECT'});
 expect(attempts).toBe(6);expect(fallback).toBe(0);
});

test('truncated proxied SSE never returns partial tools as success',async()=>{
 const c:any={env:{},fns:{agent:{wireTools:async()=>[],buildLlmRequest:async()=>({system:'system',messages:[]})},llm:{ parseModelRoute: (o: any) => parseModelRouteFn({} as any, null, o),
 resolveEndpoint:async()=>({provider:'anthropic-oauth',account:'bound',modelId:'claude-test',url:'https://api.anthropic.com/v1/messages',apiKey:'token',noFallback:true}),
 resolveReasoningEffort:async()=>({applied:'off',mode:'none'}),toAnthropicMessages:()=>[],getAnthropicOAuthToken:async()=> 'token',claudeCodeCliVersion:async()=> 'test',
 claudeFetch:async()=>new Response('event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"t","name":"mutate"}}\n\n'),
 parseSSE:async function*(){yield {event:'content_block_start',data:JSON.stringify({type:'content_block_start',index:0,content_block:{type:'tool_use',id:'t',name:'mutate'}})};},proxyFailure:(o:any)=>proxyFailure(c,null,o),
 }}};
 await expect(stream(c,null,{agent:{id:'test',model:'anthropic-oauth/bound:claude-test',tools:[],scratchpad:{}} as any})).rejects.toMatchObject({code:'PROXY_CONNECTION_LOST'});
});
