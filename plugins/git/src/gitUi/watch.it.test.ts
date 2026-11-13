import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
test('real recursive local edit and linked worktree Git metadata subscriptions',async()=>{
 const base=resolve(import.meta.dir,'../../../../.mauzcode/tmp/git-watch-tests');await mkdir(base,{recursive:true});const dir=await mkdtemp(base+'/repo-');
 const git=async(cwd:string,...args:string[])=>{const p=Bun.spawn(['git',...args],{cwd,stdout:'pipe',stderr:'pipe'});const stdout=await new Response(p.stdout).text(),stderr=await new Response(p.stderr).text();const code=await p.exited;if(code)throw Error(stderr);return {code,stdout,stderr};};
 const ctx:any={state:{gitUi:{}},fns:{gitUi:{command:({dir,args}:any)=>git(dir,...args)},procs:{events:{emit:()=>{events++;}}}}};let events=0;
 const watch=(await import('./watch.ts')).default;
 try{
 await git(dir,'init','-b','main');await git(dir,'config','user.email','fixture@example.invalid');await git(dir,'config','user.name','Fixture');await writeFile(dir+'/a','one');await git(dir,'add','.');await git(dir,'commit','-m','fixture');
 const linked=dir+'/linked';await git(dir,'worktree','add','-b','linked',linked);
 const live=await watch(ctx,null,{dir:linked,host:'local'});expect(live.state).toBe('watching');
 await writeFile(linked+'/a','two');const wait=async()=>{const end=Date.now()+5000;while(!events&&Date.now()<end)await Bun.sleep(30);expect(events).toBeGreaterThan(0);};await wait();
 await Bun.sleep(400);events=0;await git(linked,'add','a');await wait();
 // Ref-only moves (tag create, branch move) in shared metadata notify without worktree edits or fetch.
 await Bun.sleep(400);events=0;await git(linked,'tag','refs-only');await wait();
 await Bun.sleep(400);events=0;await git(dir,'branch','-f','linked-copy','HEAD');await wait();
 expect(ctx.state.gitUi.watchers.size).toBe(1);
 }finally{for(const e of ctx.state.gitUi.watchers?.values()??[])e.close();await rm(dir,{recursive:true,force:true});}
},15000);
