import {describe,expect,test,spyOn} from 'bun:test';
import startLogin from './startLogin';
import registry from './registry';
import status from './status';
import submitCode from './submitCode';
import cancel from './cancel';
import requireOwner from './requireOwner';
import authorize from '../sshInstance/authorize';

function harness(){
 const rows=new Map<string,any>(); const ctx:any={state:{sshAccount:{}},fns:{sshAccount:{},sshInstance:{connection:async()=>({bin:'ssh',args:['--'],host:'example'})},settings:{set:async(o:any)=>{rows.set(o.key,o.value);}},procs:{db:{select:async()=>[...rows.values()].map(value=>({value:JSON.stringify(value)}))},events:{refresh:()=>{}}}}};
 ctx.fns.sshInstance.authorize=()=>authorize(ctx,null,{});
 ctx.fns.sshAccount.requireOwner=()=>requireOwner(ctx,null,{});
 ctx.fns.sshAccount.registry=(opts:any)=>registry(ctx,null,opts);
 return {ctx,rows};
}
describe('isolated SSH account authorization',()=>{
 test('cold-start cancel and code submission handle absent state',async()=>{const {ctx}=harness();delete ctx.state.sshAccount;expect(await cancel(ctx,null,{id:'missing'})).toEqual({ok:true});await expect(submitCode(ctx,null,{id:'missing',code:'code'})).rejects.toThrow('Authorization not pending');});
 test('shares owner policy for HTTP and internal sessions',async()=>{
  const req=new Request('http://localhost/rpc');
  for(const session of [null,{kind:'agent'},{kind:'repl'},{kind:'http',req,user:{role:'owner'}}]){
   const fake:any={fns:{sshInstance:{authorize:()=>authorize({} as Context,session as Session|null,{})}}};
   await requireOwner(fake,session as Session|null,{});
  }
  for(const session of [{},{kind:'http',req},{kind:'agent',req},{kind:'agent',user:{role:'member'}},{kind:'ws'},{user:{role:'member'}}]){
   const fake:any={fns:{sshInstance:{authorize:()=>authorize({} as Context,session as Session,{})}}};
   await expect(requireOwner(fake,session as Session,{})).rejects.toThrow('owners');
  }
 });
 test('registry persists secret-free metadata and validates names',async()=>{const {ctx,rows}=harness();await registry(ctx,null,{action:'begin',instance:'host.test',provider:'codex',account:'work'});expect(rows.size).toBe(1);expect(JSON.stringify([...rows.values()])).not.toContain('token');await expect(registry(ctx,null,{action:'begin',instance:'host',provider:'codex',account:'..'})).rejects.toThrow();await expect(registry(ctx,null,{action:'begin',instance:'host',provider:'codex',account:'a'.repeat(41)})).rejects.toThrow();});
 test('reconciles interrupted durable pending authorization without initialized state',async()=>{const {ctx,rows}=harness();delete ctx.state.sshAccount;rows.set('host:codex:work',{instance:'host',provider:'codex',account:'work',status:'pending',updatedAt:1});expect((await registry(ctx,null,{action:'list'}))[0]!.status).toBe('failed');await expect(status(ctx,null,{id:'missing'})).rejects.toThrow('restarted');});
 test('streams browser codes through stdin, rejects line injection and cancels',async()=>{const {ctx}=harness();let written='';let killed=false;ctx.state.sshAccount.flows=new Map([['flow',{id:'flow',instance:'host',provider:'claude-code',account:'work',status:'pending',expiresAt:Date.now()+60000,process:{stdin:{write:(s:string)=>written+=s,flush:async()=>{}},kill:()=>{killed=true;}}}]]);await submitCode(ctx,null,{id:'flow',code:'once#state'});expect(written).toBe('once#state\n');await expect(submitCode(ctx,null,{id:'flow',code:'one\ntwo'})).rejects.toThrow();await cancel(ctx,null,{id:'flow'});expect(killed).toBe(true);});
 test('first login initializes missing state; SSH receives command not script stdin with no ambient auth or false success',async()=>{const {ctx}=harness();delete ctx.state.sshAccount;let command:string[]=[];let resolveExit!:(n:number)=>void;const exited=new Promise<number>(r=>resolveExit=r);const fake:any={stdin:{write:()=>{},flush:async()=>{}},stdout:new ReadableStream({start(c){c.close();}}),stderr:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('https://evil.test/token SECRET https://auth.openai.com/codex/device ABCDE-FGHIJ'));c.close();}}),exited,kill:()=>resolveExit(1)};const spawn=spyOn(Bun,'spawn').mockImplementation(((cmd:string[])=>{command=cmd;return fake;}) as any);try{const flow=await startLogin(ctx,null,{instance:'host',provider:'codex',account:'work'});expect(command.slice(0,3)).toEqual(['ssh','--','example']);expect(command[3]).toContain('env -i');expect(command[3]).toContain('CODEX_HOME');expect(command[3]).toContain('test ! -L');expect(command[3]).toContain('login status');await Bun.sleep(5);const pending=await status(ctx,null,flow);expect(pending.verificationUri).toBe('https://auth.openai.com/codex/device');expect(pending.userCode).toBe('ABCDE-FGHIJ');expect(JSON.stringify(pending)).not.toContain('SECRET');resolveExit(1);await Bun.sleep(10);expect((await status(ctx,null,flow)).status).toBe('failed');}finally{resolveExit(1);spawn.mockRestore();}});
});
