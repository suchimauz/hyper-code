import {test, expect, spyOn} from 'bun:test';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import startLogin from './startLogin';
import status from './status';

// Local synthetic CLI only: no SSH, provider requests, credentials or live flows.
test('captures browser helper URL when launcher discards output; isolates protocol and cleans FIFO', async()=>{
 const home=await mkdtemp(join(tmpdir(),'hyper-browser-capture-'));
 await mkdir(join(home,'bin'));
 await writeFile(join(home,'bin','claude'), '#!/bin/sh\n"$BROWSER" "https://claude.ai/oauth/authorize?state=synthetic" >/dev/null 2>&1\nprintf "One-time browser code\\n"\nsleep 0.05\nexit 1\n', {mode:0o700});
 const spawnReal=Bun.spawn.bind(Bun);
 const ctx:any={state:{},fns:{codexTunnel:{mutationRun:({work}:any)=>work()},sshInstance:{connection:async()=>({bin:'ssh',args:[],host:'synthetic'})},sshAccount:{requireOwner:async()=>{},registry:async()=>{}},procs:{events:{refresh:()=>{}}}}};
 let child:any;
 const spawn=spyOn(Bun,'spawn').mockImplementation(((cmd:string[], options:any)=>{
  child=spawnReal(['sh','-c',cmd[2]!],{...options,env:{HOME:home,PATH:join(home,'bin')+':/usr/bin:/bin'}});
  return child;
 }) as any);
 try {
  const id=await startLogin(ctx,null,{instance:'synthetic',provider:'claude-code',account:'test'});
  await child.exited;
  for(let i=0;i<100 && ctx.state.sshAccount.flows.get(id.id).process;i++) await Bun.sleep(5);
  const flow=await status(ctx,null,id);
  expect(flow.verificationUri==='https://claude.ai/oauth/authorize?state=synthetic').toBe(true);
  expect(flow.status).toBe('failed');
  expect(flow.diagnostics!.stages.map(s=>s.phase)).toEqual(['ssh-preflight','cli-login']);
  expect(await Bun.file(join(home,'.hyper/ssh-accounts/claude-code/test/no-browser.url-pipe')).exists()).toBe(false);
 } finally { child?.kill();spawn.mockRestore();await rm(home,{recursive:true,force:true}); }
},10000);

test('parses split ANSI and URL chunks on stderr without accepting non-allowlisted origins',async()=>{
 let err!:ReadableStreamDefaultController<Uint8Array>,resolve!:(n:number)=>void;
 const exited=new Promise<number>(r=>resolve=r);
 const fake:any={stdout:new ReadableStream({start(c){c.close();}}),stderr:new ReadableStream({start(c){err=c;}}),stdin:{},exited,kill:()=>resolve(1)};
 const ctx:any={state:{},fns:{codexTunnel:{mutationRun:({work}:any)=>work()},sshInstance:{connection:async()=>({bin:'ssh',args:[],host:'synthetic'})},sshAccount:{requireOwner:async()=>{},registry:async()=>{}},procs:{events:{refresh:()=>{}}}}};
 const spawn=spyOn(Bun,'spawn').mockImplementation((()=>fake) as any);
 try {
  const id=await startLogin(ctx,null,{instance:'synthetic',provider:'claude-code',account:'test'});
  for(const chunk of ['https://evil.test/nope\n\x1b[','32mhttps://claude.','ai/oauth/authorize?state=synthetic','\x1b[0m\n'])err.enqueue(new TextEncoder().encode(chunk));
  err.close();resolve(1);await Bun.sleep(20);
  expect((await status(ctx,null,id)).verificationUri==='https://claude.ai/oauth/authorize?state=synthetic').toBe(true);
 }finally{resolve(1);spawn.mockRestore();}
});
