import {test,expect,spyOn} from 'bun:test';
import submit from './submitCode';
import popupSubmit from './submitFromPopup';
import status from './status';
const callback='http://localhost:45678/callback?code=synthetic-secret&state=synthetic-state';
function fixture(){
 const flow:any={callbackConnection:{bin:'ssh',args:['--'],host:'pinned'},id:'f',instance:'host',provider:'claude-code',account:'test',status:'pending',expiresAt:Date.now()+60000,process:{},verificationUri:'https://claude.com/cai/oauth/authorize?'+new URLSearchParams({state:'synthetic-state',redirect_uri:'http://localhost:45678/callback'})};
 const ctx:any={state:{sshAccount:{flows:new Map([['f',flow]])}},fns:{sshAccount:{requireOwner:async()=>{}},sshInstance:{connection:async()=>({bin:'ssh',args:['--'],host:'pinned'})}}};
 return {flow,ctx};
}
test('valid callback uses private stdin with fixed loopback, no redirects/proxies/output; HTTP result does not connect',async()=>{
 const {ctx,flow}=fixture();let args:any,options:any,input='';
 const spawn=spyOn(Bun,'spawn').mockImplementation(((a:any,o:any)=>{args=a;options=o;return {stdin:{write:(s:string)=>input+=s,flush:async()=>{},end:()=>{}},exited:Promise.resolve(0),kill:()=>{}};}) as any);
 try{expect(await submit(ctx,null,{id:'f',code:callback})).toEqual({ok:true});expect(input).toContain('http://127.0.0.1:45678/callback?');expect(input).toContain('synthetic-secret');expect(JSON.stringify(args)).not.toContain('synthetic-secret');expect(args.at(-1)).toContain('env -i');expect(args.at(-1)).toContain('--max-redirs 0');expect(args.at(-1)).toContain("--noproxy '*'");expect(options.stdout).toBe('ignore');expect(options.stderr).toBe('ignore');expect(flow.status).toBe('pending');expect(flow.callbackSubmission).toBe('sent');expect(JSON.stringify(await status(ctx,null,{id:'f'}))).not.toContain('synthetic-secret');await expect(submit(ctx,null,{id:'f',code:callback})).rejects.toThrow('already submitted');expect(spawn).toHaveBeenCalledTimes(1);
 // The existing CLI watcher is the sole authority for this transition.
 flow.status='connected';expect((await status(ctx,null,{id:'f'})).status).toBe('connected');
 }finally{spawn.mockRestore();}
});
test('rejects forged and ambiguous callback inputs without any SSH',async()=>{
 const invalid=[callback.replace('synthetic-state','forged'),callback.replace('45678','45679'),callback.replace('localhost','evil.test'),callback.replace('http:','https:'),callback.replace('localhost','localhost@evil.test'),callback.replace('/callback','/callback/extra'),callback.replace('/callback','/x/../callback'),callback+'&redirect_uri=http://evil.test',callback+'&code=second',callback+'&state=second',callback+'#fragment',callback.replace('45678','80'),callback.replace('45678','65536'),callback.replace('localhost','127.1'),callback.replace('/callback','/%63allback'),callback+'\n',callback.replace('synthetic-secret',''),callback.replace('synthetic-secret','%0a')];
 for(const code of invalid){const {ctx}=fixture();let called=false;ctx.fns.sshInstance.connection=async()=>{called=true;throw new Error('not reached');};await expect(submit(ctx,null,{id:'f',code})).rejects.toThrow('Invalid callback URL');expect(called).toBe(false);}
});
test('rejects owner denial, cancelled/expired/non-Claude flows, and invalid trusted redirect',async()=>{
 for(const patch of [{status:'cancelled'},{status:'failed'},{status:'connected'},{expiresAt:0},{provider:'codex'},{process:null}]){const {ctx,flow}=fixture();Object.assign(flow,patch);await expect(submit(ctx,null,{id:'f',code:callback})).rejects.toThrow('Authorization not pending');}
 const {ctx}=fixture();ctx.fns.sshAccount.requireOwner=async()=>{throw new Error('owners only');};await expect(submit(ctx,null,{id:'f',code:callback})).rejects.toThrow('owners only');
 for(const redirect of ['http://evil.test:45678/callback','http://localhost:45678/callback?next=evil','http://localhost:80/callback']){const {ctx,flow}=fixture();flow.verificationUri='https://claude.com/cai/oauth/authorize?'+new URLSearchParams({state:'synthetic-state',redirect_uri:redirect});await expect(submit(ctx,null,{id:'f',code:callback})).rejects.toThrow('Invalid callback URL');}
});
test('concurrent submissions lock before SSH and ambiguous delivery never permits replay',async()=>{
 const {ctx,flow}=fixture();let release!:(n:number)=>void;const exited=new Promise<number>(r=>release=r);
 const spawn=spyOn(Bun,'spawn').mockImplementation((()=>({stdin:{write:()=>{},flush:async()=>{},end:()=>{}},exited,kill:()=>{}})) as any);
 try{const first=submit(ctx,null,{id:'f',code:callback});await Bun.sleep(1);await expect(submit(ctx,null,{id:'f',code:callback})).rejects.toThrow('already submitted');release(7);await expect(first).rejects.toThrow('uncertain');expect(flow.callbackSubmission).toBe('uncertain');await expect(submit(ctx,null,{id:'f',code:callback})).rejects.toThrow('already submitted');}finally{release(7);spawn.mockRestore();}
});
test('safe pre-transport failure permits retry, rechecks cancellation after connection await',async()=>{
 const {ctx,flow}=fixture();ctx.fns.sshInstance.connection=async()=>{throw new Error(callback);};try{await submit(ctx,null,{id:'f',code:callback});throw new Error('expected failure');}catch(e){expect(String(e)).not.toContain('synthetic-secret');expect(String(e)).toContain('not sent');}expect(flow.callbackSubmission).toBeUndefined();
 ctx.fns.sshInstance.connection=async()=>{flow.status='cancelled';return {bin:'ssh',args:[],host:'pinned'};};await expect(submit(ctx,null,{id:'f',code:callback})).rejects.toThrow('not sent');expect(flow.callbackSubmission).toBeUndefined();
});
test('popup forwarding returns only safe progress and never echoes callback',async()=>{
 const {ctx}=fixture();let forwarded=false;ctx.fns.sshAccount.submitCode=async(o:any)=>{forwarded=o.code===callback;};ctx.fns.sshAccount.progressPopup=async(o:any)=>{expect(o).toEqual({id:'f'});return '<p>pending</p>';};expect(await popupSubmit(ctx,null,{id:'f',code:callback})).toBe('<p>pending</p>');expect(forwarded).toBe(true);
});
test('older flows require restart and changed pinned SSH destinations cannot receive callbacks',async()=>{
 const {ctx,flow}=fixture();delete flow.callbackConnection;await expect(submit(ctx,null,{id:'f',code:callback})).rejects.toThrow('Start a new login');flow.callbackConnection={bin:'ssh',args:['--'],host:'original'};await expect(submit(ctx,null,{id:'f',code:callback})).rejects.toThrow('not sent');expect(flow.callbackSubmission).toBeUndefined();
});
