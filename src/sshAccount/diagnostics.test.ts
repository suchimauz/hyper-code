import {test,expect,spyOn} from 'bun:test';
import startLogin from './startLogin';
import status from './status';
import cancel from './cancel';
import progress from './progressPopup';

for(const provider of ['codex','claude-code'] as const) for(const failure of ['login','credentials','status','success','cancel'] as const) test(`${provider} safe diagnostics ${failure}`,async()=>{
 let out!:ReadableStreamDefaultController<Uint8Array>,err!:ReadableStreamDefaultController<Uint8Array>,resolve!:(n:number)=>void,command='';
 const exited=new Promise<number>(r=>resolve=r);
 const fake:any={stdout:new ReadableStream({start(c){out=c;}}),stderr:new ReadableStream({start(c){err=c;}}),stdin:{},exited,kill:()=>{}};
 const spawn=spyOn(Bun,'spawn').mockImplementation(((cmd:string[])=>{command=cmd[3]!;return fake;}) as any);
 const ctx:any={state:{},fns:{sshInstance:{connection:async()=>({bin:'ssh',args:[],host:'test'})},sshAccount:{requireOwner:async()=>{},registry:async()=>{}},procs:{events:{refresh:()=>{}},ui:{}},ui:{popupContent:({html}:any)=>html}}};
 ctx.fns.sshAccount.status=(o:any)=>status(ctx,null,o);
 const send=(c:ReadableStreamDefaultController<Uint8Array>,s:string)=>c.enqueue(new TextEncoder().encode(s));
 try {
  const id=await startLogin(ctx,null,{instance:'test',provider,account:'test'});
  // SSH command location depends on empty args in this fixture.
  command=String((spawn.mock.calls[0]![0] as string[])[2]);
  const marker=command.match(/HYPER_LOGIN_[a-f0-9]+/)![0];
  send(err,`${marker}:login-status:0\nBearer SECRET_TOKEN auth.json {"refresh_token":"SECRET_TOKEN"} https://evil.test/SECRET_TOKEN HTTP 401\n`);
  send(out,`junk ${marker}:login-status:0\n${marker}:cli-login:999\n${marker}:login-status:0\n${marker}:SECRET_TOKEN:0\n`);
  send(out,marker.slice(0,10)); send(out,marker.slice(10)+':cli-login:0\n');
  await Bun.sleep(5);
  expect((await status(ctx,null,id)).diagnostics!.stages.map(s=>s.phase)).toEqual(['ssh-preflight','cli-login']);
  if(failure!=='login'&&failure!=='cancel')send(out,`${marker}:credential-check:0\n`);
  if(failure==='status'||failure==='success')send(out,`${marker}:login-status:0\n`);
  if(failure==='cancel')await cancel(ctx,null,id);
  send(out,`${marker}:exit:${failure==='success'?0:1}\n`);out.close();err.close();resolve(failure==='success'?0:1);
  await Bun.sleep(10);
  const flow=await status(ctx,null,id);const d=flow.diagnostics!;
  expect(d.stages.length).toBeLessThanOrEqual(4);expect(d.endedAt).toBeNumber();expect(d.exitCode).toBe(failure==='success'?0:1);
  expect(JSON.stringify(flow)).not.toContain('SECRET_TOKEN');expect(JSON.stringify(d)).not.toContain('auth.json');expect(JSON.stringify(d)).not.toContain('https:');
  expect(d.reason).toBe(failure==='success'?null:failure==='credentials'?'missing-credentials':'http');
  expect(d.stages.at(-1)!.endedAt).toBeNumber();
  const html=await progress(ctx,null,id);expect(html).toContain('Safe login diagnostics');expect(html).toContain('Process exit:');expect(html).not.toContain('SECRET_TOKEN');
  expect(await progress(ctx,null,id)).toContain(new Date(d.endedAt!).toISOString());
  expect(command).toContain(provider==='codex'?'login --device-auth':'auth login --claudeai');
 }finally{resolve(1);spawn.mockRestore();}
});
