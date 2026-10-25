import {afterEach,expect,test} from 'bun:test';
import opencodeFetch from './opencodeFetch';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
function fixture(instance='chosen-ssh') {
 const calls: any[]=[];
 const ctx={fns:{settings:{getString:async()=>instance},secrets:{resolveSetting:async()=>{throw new Error('Public docs must not read secrets');}},sshAccount:{fetch:async(opts:any)=>{calls.push(opts);return new Response('docs');}}}} as any;
 return {ctx,calls};
}
test('public docs use selected SSH, strip all caller credentials, and support both plans',async()=>{
 const {ctx,calls}=fixture();
 globalThis.fetch=(async()=>{throw new Error('Local network forbidden');}) as any;
 for(const path of ['go','models']) {
  const signal=new AbortController().signal;
  expect(await (await opencodeFetch(ctx,null,{url:'https://opencode.ai/v2/docs/console/'+path,init:{headers:{Authorization:'Bearer synthetic',Cookie:'synthetic'},signal}})).text()).toBe('docs');
  expect(calls.at(-1)).toEqual({ssh:{instance:'chosen-ssh',provider:'opencode',account:'default'},url:'https://opencode.ai/v2/docs/console/'+path,init:{method:'GET',headers:{Accept:'text/markdown'},signal}});
 }
});
test('public docs retain local transport without SSH and disable redirects',async()=>{
 for(const instance of ['local','']) {
  const {ctx,calls}=fixture(instance);
  globalThis.fetch=(async(url:any,init:any)=>{expect(init).toMatchObject({method:'GET',headers:{Accept:'text/markdown'},redirect:'error'});return new Response('local');}) as any;
  expect(await(await opencodeFetch(ctx,null,{url:'https://opencode.ai/v2/docs/console/go',init:{}})).text()).toBe('local');
  expect(calls).toEqual([]);
 }
});
test('public docs reject writes, bodies, URL lookalikes and SSH redirects',async()=>{
 const {ctx,calls}=fixture();
 const url='https://opencode.ai/v2/docs/console/go';
 for(const init of [{method:'POST'},{method:'HEAD'},{method:'get'},{body:''},{body:'{}'}]) await expect(opencodeFetch(ctx,null,{url,init})).rejects.toThrow();
 for(const bad of [url+'?',url+'#',url+'/',url+'?a=1',url.replace('https:','http:'),url.replace('opencode.ai','opencode.ai:443'),url.replace('/go','/%67o'),url.replace('/go','/../console/go')]) await expect(opencodeFetch(ctx,null,{url:bad,init:{}})).rejects.toThrow('Unsupported OpenCode endpoint');
 expect(calls).toEqual([]);
 ctx.fns.sshAccount.fetch=async()=>new Response(null,{status:302,headers:{Location:url}});
 await expect(opencodeFetch(ctx,null,{url,init:{}})).rejects.toThrow('redirects are forbidden');
});
