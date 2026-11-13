import {test,expect} from 'bun:test';
import path from 'node:path';
// Evaluate the production procedure with deterministic clock/filesystem dependencies.
async function fixture(nativeFailure=false){
 const source=await Bun.file(import.meta.dir+'/watch.ts').text();
 const js=new Bun.Transpiler({loader:'ts'}).transformSync(source.replace(/^import .*;\n/gm,'').replace('export default async function','async function watch'));
 let now=0,id=0;const timers=new Map<number,any>(),native:any[]=[],events:any[]=[],calls:any[]=[];
 const schedule=(fn:any,ms:number,repeat=false)=>{const t={id:++id,at:now+ms,fn,ms,repeat,unref(){}};timers.set(t.id,t);return t;};
 const clear=(t:any)=>timers.delete(t?.id);
 const watchFs=(dir:string,_opts:any,fn:any)=>{if(nativeFailure)throw Error('recursive watch unavailable');const w={dir,fn,closed:false,error:()=>{},close(){this.closed=true;},unref(){},on(_e:string,f:any){this.error=f;}};native.push(w);return w;};
 let value='a',refsValue='refs/heads/main\0c1\0',refsFail=false,fail=false,gate:Promise<void>|undefined,release:(()=>void)|undefined;
 const fsCalls:string[]=[];
 // Poison tree: even listing the root is forbidden, including huge ignored/unreadable directories.
 const forbiddenFs=(dir:string)=>{fsCalls.push(dir);throw Error('EACCES: /repo/node_modules/build/cache (huge ignored tree)');};
 const ctx:any={state:{gitUi:{}},fns:{gitUi:{command:async(o:any)=>{calls.push(o);if(gate)await gate;if(fail)throw Error('SSH offline');return o.args[0]==='for-each-ref'?{code:refsFail?128:0,stdout:refsFail?'':refsValue}:{code:0,stdout:o.args.includes('--absolute-git-dir')?'/repo/.git':o.args.includes('--git-common-dir')?'.git':value};}},procs:{events:{emit:({event}:any)=>events.push(event)}}}};
 const fn=new Function('watchFs','path','setTimeout','clearTimeout','setInterval','clearInterval','readdirSync','lstatSync',js+';return watch;')(watchFs,path,(f:any,m:number)=>schedule(f,m),clear,(f:any,m:number)=>schedule(f,m,true),clear,forbiddenFs,forbiddenFs);
 const tick=async(ms:number)=>{const end=now+ms;while(true){const t=[...timers.values()].filter(t=>t.at<=end).sort((a,b)=>a.at-b.at)[0];if(!t)break;now=t.at;if(t.repeat)t.at+=t.ms;else timers.delete(t.id);t.fn();for(let i=0;i<8;i++)await Promise.resolve();}now=end;};
 return {ctx,native,events,calls,timers,tick,fsCalls,pause:()=>{gate=new Promise<void>(r=>{release=r;});},resume:()=>{gate=undefined;release?.();},reload:()=>new Function('watchFs','path','setTimeout','clearTimeout','setInterval','clearInterval',js+';return watch;')(watchFs,path,(f:any,m:number)=>schedule(f,m),clear,(f:any,m:number)=>schedule(f,m,true),clear)(ctx,null,{host:'local',dir:'/repo'}),watch:(host='local',dir='/repo')=>fn(ctx,null,{host,dir}),value:(s:string)=>value=s,refs:(s:string)=>refsValue=s,refsFail:(b:boolean)=>refsFail=b,fail:(b:boolean)=>fail=b};
}
test('shared watchers, debounce, ignored objects/logs, idle touch and cleanup',async()=>{
 const f=await fixture(),a=await f.watch();expect(a.state).toBe('watching');expect((await f.watch()).key).toBe(a.key);expect(f.native.length).toBe(2);
 expect(a.key).toBe(new Bun.CryptoHasher('sha256').update(JSON.stringify(['local','/repo'])).digest('hex').slice(0,16));
 f.native[0].fn('change','.git/objects/abc');f.native[0].fn('change','.git/logs/HEAD');await f.tick(300);expect(f.events).toHaveLength(0);
 f.native[0].fn('change','a');await f.tick(299);f.native[0].fn('change','b');await f.tick(299);expect(f.events).toHaveLength(0);await f.tick(1);expect(f.events).toEqual([{type:'gitUi.changed',key:a.key}]);
 await f.tick(500000);await f.watch();await f.tick(599999);expect(f.ctx.state.gitUi.watchers.size).toBe(1);await f.tick(1);expect(f.ctx.state.gitUi.watchers.size).toBe(0);expect(f.native.every(w=>w.closed)).toBe(true);expect(f.timers.size).toBe(0);
});
test('SSH bounded transport polling, recovery, distinct hosts and no local fallback',async()=>{
 const f=await fixture();await f.watch('ssh-box');expect(f.native).toHaveLength(0);expect(f.calls.map(c=>c.args)).toEqual([['rev-parse','--verify','HEAD'],['status','--porcelain=v2','-z','--untracked-files=all'],['for-each-ref','--count=2001','--format=%(refname)%00%(objectname)%00%(symref)','refs/heads','refs/remotes','refs/tags']]);
 f.value('b');await f.tick(3000);await f.tick(300);expect(f.events.length).toBe(1);
 f.fail(true);await f.tick(3000);expect((await f.watch('ssh-box')).state).toBe('error');expect(f.native).toHaveLength(0);
 f.fail(false);await f.tick(3000);expect((await f.watch('ssh-box')).state).toBe('polling');expect((await f.watch('other')).key).not.toBe((await f.watch('ssh-box')).key);
 for(const e of f.ctx.state.gitUi.watchers.values())e.close();expect(f.timers.size).toBe(0);
});
test('local watcher error falls back to polling and stop releases archive timer too',async()=>{
 const f=await fixture();await f.watch();f.native[0].error();await f.tick(1);expect((await f.watch()).state).toBe('polling');expect(f.native.every(w=>w.closed)).toBe(true);
 const stop=(await import('./$stop.ts')).default;await stop(f.ctx,null);expect(f.ctx.state.gitUi.watchers.size).toBe(0);expect(f.timers.size).toBe(0);
});
test('snapshot watch is touched only after HTTP and item authorization',async()=>{
 const handle=(await import('./handle.ts')).default;let touched=0;
 const ctx:any={fns:{canvas:{authorizeHttp:async()=>new Response('',{status:403})},gitUi:{ownedItem:async()=>{throw Error('not owned');},watch:async()=>{touched++;return {key:'key',state:'polling'};},snapshot:async()=>({head:'head'})}}};
 const req=new Request('http://localhost/gitUi?agentId=fixture&itemId=1');expect((await handle(ctx,null,{req})).status).toBe(403);expect(touched).toBe(0);
 ctx.fns.canvas.authorizeHttp=async()=>null;await handle(ctx,null,{req});expect(touched).toBe(0);
 ctx.fns.gitUi.ownedItem=async()=>({host:'ssh-box',dir:'/pinned'});const data=await (await handle(ctx,null,{req})).json();expect(touched).toBe(1);expect(data.liveKey).toBe('key');expect(data.liveState).toBe('polling');
});
test('local unsupported watcher uses Git-only fallback, never traverses huge ignored/unreadable trees',async()=>{
 const f=await fixture(true);expect((await f.watch()).state).toBe('polling');
 expect(f.calls.slice(2).map(c=>c.args)).toEqual([['rev-parse','--verify','HEAD'],['status','--porcelain=v2','-z','--untracked-files=all'],['for-each-ref','--count=2001','--format=%(refname)%00%(objectname)%00%(symref)','refs/heads','refs/remotes','refs/tags']]);
 expect(f.fsCalls).toEqual([]);expect(f.native).toEqual([]);
 // Unchanged porcelain, including successive dirty edits, is not content tracking.
 await f.tick(3300);expect(f.events).toHaveLength(0);expect(f.fsCalls).toEqual([]);
 f.value('new HEAD or status');await f.tick(3000);await f.tick(300);expect(f.events).toHaveLength(1);
 const calls=f.calls.length;await f.reload();expect(f.calls).toHaveLength(calls);expect(f.ctx.state.gitUi.watchers.size).toBe(1);
 for(const e of f.ctx.state.gitUi.watchers.values())e.close();expect(f.timers.size).toBe(0);
});
test('pending polls do not overlap; close cancels follow-up commands and late events',async()=>{
 for(const host of ['local','ssh-box']){
 const f=await fixture(true);await f.watch(host);f.pause();const before=f.calls.length;
 await f.tick(9000);expect(f.calls).toHaveLength(before+1);
 for(const e of f.ctx.state.gitUi.watchers.values())e.close();f.resume();await f.tick(9000);
 expect(f.calls).toHaveLength(before+1);expect(f.events).toHaveLength(0);expect(f.timers.size).toBe(0);expect(f.fsCalls).toEqual([]);
 }
});
test('close during pending status suppresses results; both transports enforce command bounds',async()=>{
 const f=await fixture(true);await f.watch();const original=f.ctx.fns.gitUi.command;
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 f.ctx.fns.gitUi.command=async(o:any)=>{const result=await original(o);if(o.args[0]==='status')await gate;return result;};
 f.value('changed');await f.tick(3000);const before=f.calls.length;
 for(const e of f.ctx.state.gitUi.watchers.values())e.close();release();await f.tick(6000);
 expect(f.calls).toHaveLength(before);expect(f.events).toHaveLength(0);expect(f.timers.size).toBe(0);
 const command=(await import('./command.ts')).default;const transports:any[]=[];
 for(const host of ['local','ssh-box'])for(const args of [['rev-parse','--verify','HEAD'],['status','--porcelain=v2','-z','--untracked-files=all']]){
 await command({fns:{git:{run:async(o:any)=>{transports.push(o);return {code:0,stdout:'',stderr:''};}}}} as any,null,{host,dir:'/repo',args});
 }
 expect(transports).toHaveLength(4);for(const o of transports){expect(o.timeout).toBe(12);expect(o.maxOutput).toBe(1048576);expect(o.args).toContain('--no-optional-locks');}
});
test('ref-only moves refresh polling on local fallback and SSH; ref lookup failure is change, not fatal; no fetch or writes',async()=>{
 for(const host of ['local','ssh-box']){
 const f=await fixture(true);await f.watch(host);
 await f.tick(3300);expect(f.events).toHaveLength(0);
 f.refs('refs/heads/main\0c2\0');await f.tick(3000);await f.tick(300);expect(f.events).toHaveLength(1);
 f.refs('refs/heads/main\0c2\0\nrefs/tags/v1\0c2\0');await f.tick(3000);await f.tick(300);expect(f.events).toHaveLength(2);
 f.refsFail(true);await f.tick(3000);await f.tick(300);expect(f.events).toHaveLength(3);expect((await f.watch(host)).state).toBe('polling');
 await f.tick(3300);expect(f.events).toHaveLength(3);
 // Polling is bounded to one HEAD, status and ref command per three-second tick on the pinned host only.
 const before=f.calls.length;await f.tick(30000);expect(f.calls.length-before).toBe(30);
 expect(new Set(f.calls.map(c=>c.host))).toEqual(new Set([host]));
 expect(new Set(f.calls.map(c=>c.args[0]))).toEqual(new Set(['rev-parse','status','for-each-ref']));
 for(const e of f.ctx.state.gitUi.watchers.values())e.close();expect(f.timers.size).toBe(0);
 }
});
