import {test,expect} from 'bun:test';
import remove from './remove';
import lease from './lease';
import registry from '../sshAccount/registry';
import removeAccount from '../llm/removeAccount';
import confirm from '../llms/confirmRemoveAccount';
import popup from '../llms/removeAccount';
import activate from './activate';
import dispatch from './dispatch';

function fixture(){
 const d={instance:'any-host',provider:'codex',account:'any-slot'};
 let records=new Map<string,any>([['current',{revision:1,value:{owner:'owner',binding:'pin',provider:'codex',mode:'socks',tokens:{refresh:'synthetic'}}}],['old',{revision:2,value:{owner:'owner',binding:'old-pin',mode:'socks',tokens:{refresh:'synthetic-old'}}}],['unrelated',{revision:1,value:{mode:'socks'}}]]);
 let metadata=true,fail=false,denied=false,reads=0;
 const ctx:any={state:{},fns:{}};
 ctx.fns.sshProvider={remove:(o:any)=>remove(ctx,null,o),binding:async()=>({name:'current',owner:'owner',fingerprint:'pin'}),lease:(o:any)=>lease(ctx,null,o)};
 ctx.fns.codexAccount={binding:async()=>({name:'old',owner:'owner',fingerprint:'old-pin'})};
 ctx.fns.sshAccount={requireOwner:async()=>{if(denied)throw Error('Owner required')},registry:(o:any)=>registry(ctx,null,o)};
 ctx.fns.codexTunnel={mutationRun:async(o:any)=>{if(o.action!=='list')throw Error('old guard');return o.work()},encryptedStore:({name}:any)=>({read:async()=>{reads++;return records.get(name)??null},save:async(revision:any,value:any)=>{if((records.get(name)?.revision??null)!==revision)throw Error('CAS');records.set(name,{revision:(revision??0)+1,value});return (revision??0)+1}})};
 ctx.fns.settings={remove:async()=>{if(fail)throw Error('db failure');metadata=false},set:async()=>{throw Error('list wrote')}};
 ctx.fns.procs={db:{transaction:async({fn}:any)=>{const before=structuredClone(records),meta=metadata;try{return await fn()}catch(e){records=before;metadata=meta;throw e}},run:async()=>({}),select:async()=>metadata?[{value:{...d,status:'pending',updatedAt:0}}]:[]},events:{refresh:()=>{}},ui:{escape:({text}:any)=>Bun.escapeHTML(text)}};
 ctx.fns.llm={accountUsers:async()=>[],removeAccount:(o:any)=>removeAccount(ctx,null,o)};
 ctx.fns.ui={popupContent:async(o:any)=>o.html};ctx.fns.llms={popupButton:()=>'<button>Confirm</button>'};
 return {ctx,d,records:()=>records,metadata:()=>metadata,fail:()=>fail=true,deny:()=>denied=true,reads:()=>reads};
}
test('UI confirmation is read-only; confirmed removal uses registry and tombstones only selected local slots',async()=>{const f=fixture(),o={provider:'codex' as const,account:'ssh.any-host.any-slot'};const html=await popup(f.ctx,null,o);expect(html).toContain('llms.confirmRemoveAccount');expect(html).toContain('Remote CLI credentials stay');expect(f.reads()).toBe(0);await confirm(f.ctx,null,o);expect(f.metadata()).toBe(false);for(const key of ['current','old']){expect(f.records().get(key).value.mode).toBe('removed');expect(f.records().get(key).value.tokens).toBeUndefined()}expect(f.records().get('unrelated').value.mode).toBe('socks');});
test('cross-owner removal fails before credentials are read',async()=>{const f=fixture();f.deny();await expect(registry(f.ctx,null,{action:'remove',...f.d} as any)).rejects.toThrow('Owner');expect(f.reads()).toBe(0);expect(f.metadata()).toBe(true)});
test('binding mismatch rolls back tombstones and metadata',async()=>{const f=fixture();f.records().get('old').value.owner='another';await expect(remove(f.ctx,null,f.d)).rejects.toThrow('binding');expect(f.records().get('current').value.mode).toBe('socks');expect(f.metadata()).toBe(true)});
test('metadata deletion failure rolls back both credential writes',async()=>{const f=fixture();f.fail();await expect(remove(f.ctx,null,f.d)).rejects.toThrow('db failure');expect(f.records().get('old').value.tokens.refresh).toBe('synthetic-old');expect(f.records().get('current').value.mode).toBe('socks');expect(f.metadata()).toBe(true)});
test('removal drains active response lease while unrelated accounts remain available',async()=>{const f=fixture();const release=await lease(f.ctx,null,{key:'current'});let done=false;const job=remove(f.ctx,null,f.d).then(()=>done=true);await Bun.sleep(10);expect(done).toBe(false);const other=await lease(f.ctx,null,{key:'unrelated'});other();expect(f.metadata()).toBe(true);release();await job;expect(done).toBe(true)});
test('removed tokens cannot dispatch, resume, activate or legacy transfer',async()=>{const f=fixture();await remove(f.ctx,null,f.d);for(const action of ['activate','resume','suspend'] as const)await expect(activate(f.ctx,null,{...f.d,action,confirmed:true,drained:true})).rejects.toThrow();await expect(dispatch(f.ctx,null,{ssh:f.d as any,url:'https://chatgpt.com/backend-api/wham/usage',init:{}})).rejects.toThrow('no fallback')});
test('pending login is busy only for the selected provider account',async()=>{const f=fixture();f.ctx.state.sshAccount={flows:new Map([['x',{...f.d,status:'pending'}]])};await expect(remove(f.ctx,null,f.d)).rejects.toThrow('busy');f.ctx.state.sshAccount.flows.get('x').provider='kimi-coding';await remove(f.ctx,null,f.d);expect(f.metadata()).toBe(false)});
test('registry list bypasses mutation guard and never writes expired pending status',async()=>{const f=fixture();const rows=await registry(f.ctx,null,{action:'list'});expect(rows[0].status).toBe('failed');expect(f.reads()).toBe(0);expect(f.metadata()).toBe(true)});
