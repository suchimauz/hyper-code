import {test,expect} from 'bun:test';
import dispatch from './dispatch';
for(const provider of ['codex','claude-code','kimi-coding','zai-coding','minimax-coding','opencode'])test(`${provider}: missing record never uses legacy`,async()=>{
 let opened=0,released=0; const ctx:any={state:{},fns:{sshProvider:{binding:async()=>({name:'slot',owner:'o',fingerprint:'pin'}),lease:async()=>()=>released++,policy:()=>{},request:async()=>new Response('ok')},codexTunnel:{encryptedStore:()=>({read:async()=>null}),openProduction:async()=>{opened++;return {port:1,signal:new AbortController().signal,close:async()=>{}}},dispatch:()=>{throw Error('LEGACY CALLED')}}}};
 const call=dispatch(ctx,null,{ssh:{provider,instance:'i',account:'a'} as any,url:'https://example.com',init:{headers:{authorization:'Bearer caller'}}});
 if(['codex','claude-code','kimi-coding'].includes(provider)){await expect(call).rejects.toThrow('secure onboarding');expect(opened).toBe(0)}else expect(await (await call).text()).toBe('ok');expect(released).toBe(1);
});
for(const mode of ['suspended','recovery'])test(`${mode} caller-token record fails closed`,async()=>{
 const ctx:any={state:{},fns:{sshProvider:{binding:async()=>({name:'slot',owner:'o',fingerprint:'pin'}),lease:async()=>()=>{}},codexTunnel:{encryptedStore:()=>({read:async()=>({value:{owner:'o',binding:'pin',provider:'opencode',mode}})}),openProduction:()=>{throw Error('must not open')}}}};
 await expect(dispatch(ctx,null,{ssh:{provider:'opencode',instance:'i',account:'a'},url:'https://opencode.ai/inference/go/v1/models',init:{}})).rejects.toThrow('no fallback');
});
test('inference streams use a 90 s idle deadline under a 30 min total ceiling',async()=>{
 let seen:any; const ctx:any={state:{},fns:{sshProvider:{binding:async()=>({name:'slot',owner:'o',fingerprint:'pin'}),lease:async()=>()=>{},policy:()=>{},request:async(o:any)=>{seen=o;return new Response('ok')}},codexTunnel:{encryptedStore:()=>({read:async()=>null}),openProduction:async()=>({port:9,signal:new AbortController().signal,close:async()=>{}})}}};
 await (await dispatch(ctx,null,{ssh:{provider:'opencode',instance:'i',account:'a'},url:'https://opencode.ai/inference/go/v1/models',init:{}})).text();
 expect(seen.idleTimeoutMs).toBe(90000);expect(seen.timeoutMs).toBe(1800000);
});
