import {test,expect} from 'bun:test';
import relay from './relay';
import proxyFailure from '../llm/proxyFailure';
import classify from '../llm/classifyError';

test('node relay uses saved Claude adapter and exports only safe no-fallback failure',async()=>{
 const model='anthropic-oauth/work:claude-test';let routed=0;
 const ctx:any={fns:{node:{authorize:async()=>({ok:true,client:{name:'client',providers:['anthropic-oauth']},hops:0}),catalog:async()=>[{id:model,provider:'anthropic-oauth',account:'work',api:'anthropic',noFallback:true}],upstream:async()=>({url:'https://api.anthropic.com/v1/messages',headers:{authorization:'Bearer private'},kind:'subscription',noFallback:true})},llm:{claudeFetch:async(o:any)=>{routed++;expect(o.requireProxy).toBe(true);throw Object.assign(new Error('PROXY_CONNECT: ECONNREFUSED'),{code:'PROXY_CONNECT',retryable:true});},proxyFailure:(o:any)=>proxyFailure(ctx,null,o)},procs:{log:{info:()=>{}}}}};
 const req=new Request('https://node.test/anthropic',{method:'POST',body:JSON.stringify({model,messages:[{role:'user',content:'hello'}]})});
 const response=await relay(ctx,null,{req,api:'anthropic'});
 expect(routed).toBe(1);expect(response.status).toBe(502);expect(response.headers.get('x-mauzcode-no-fallback')).toBe('true');
 const body=await response.text();expect(body).not.toContain('private');
 const failure=classify(ctx,null,{provider:'mauzcode',account:'host',status:502,body});
 expect(failure).toMatchObject({code:'PROXY_CONNECT',retryable:true,provider:'mauzcode',account:'host'});
});
