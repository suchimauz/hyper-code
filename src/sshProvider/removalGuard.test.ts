import {test,expect} from 'bun:test';
import guard from '../codexTunnel/guard';
import runtime from '../codexTunnel/runtime';
const hash=(parts:string[])=>new Bun.CryptoHasher('sha256').update(JSON.stringify(parts)).digest('hex');
test('guard scopes login to exact provider/account and descriptor to instance; list is free of reads',async()=>{
 const removed=hash(['ssh-provider-v1','host','codex','removed']);const read:string[]=[];
 const ctx:any={fns:{sshAccount:{requireOwner:async()=>{},registry:async()=>[{instance:'host',provider:'kimi-coding',account:'working'}]},codexTunnel:{encryptedStore:({name}:any)=>({read:async()=>{read.push(name);return name===removed?{value:{version:1,mode:'removed'}}:null}})}}};
 await guard(ctx,null,{operation:'registry',action:'list'});expect(read).toHaveLength(0);
 await guard(ctx,null,{operation:'login',instance:'host',provider:'kimi-coding',account:'working'});
 await guard(ctx,null,{operation:'descriptor',instance:'host'});
 await expect(guard(ctx,null,{operation:'login',instance:'host',provider:'codex',account:'removed'})).rejects.toThrow('recovery');
 expect(read).not.toContain(hash(['ssh-provider-v1','another-host','codex','removed']));
});
test('legacy rollback cannot turn removed tombstone into reusable legacy credentials',async()=>{
 let writes=0;const ctx:any={state:{},fns:{codexTunnel:{mutation:()=>({run:(fn:any)=>fn()}),encryptedStore:()=>({read:async()=>({revision:1,value:{version:1,owner:'o',binding:'b',mode:'removed'}}),save:async()=>writes++})},codexAccount:{binding:async()=>({name:'old',owner:'o',fingerprint:'b'})}}};
 const r=runtime(ctx,{user:{id:'o'}} as any,{options:{protectedSlot:'none'}});
 await expect(r.rollback({instance:'host',provider:'codex',account:'removed'})).rejects.toThrow('prohibited');expect(writes).toBe(0);
});
