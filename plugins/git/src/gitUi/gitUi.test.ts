import {test,expect} from 'bun:test';
import {mkdir,mkdtemp,writeFile,rename,symlink} from 'node:fs/promises';
import {resolve} from 'node:path';
// Tests load raw procedures deliberately to keep repository fixtures isolated from live sessions.
const load=async(path:string)=>(await import(path)).default;
const root=resolve(import.meta.dir,'../../../..');
async function setup(){
 const base=resolve(root,'.mauzcode/tmp/emh/tests');await mkdir(base,{recursive:true});const dir=await mkdtemp(base+'/repo-');
 const ctx:any={fns:{git:{},gitUi:{},remote:{quote:({value}:any)=>"'"+value.replaceAll("'","'\\''")+"'"}},state:{}};
 const run=await load(root+'/src/git/run.ts');ctx.fns.git.run=(o:any)=>run(ctx,null,o);
 for(const name of ['commentPath','command','snapshot','commit','diff','checkPath','blobSize','handle','ownedItem']){const fn=await load(import.meta.dir+'/'+name+'.ts');ctx.fns.gitUi[name]=(o:any)=>fn(ctx,null,o);}
 const git=async(...args:string[])=>{const p=Bun.spawn(['git',...args],{cwd:dir,stdout:'pipe',stderr:'pipe'});const text=await new Response(p.stdout).text();const err=await new Response(p.stderr).text();if(await p.exited)throw new Error(err);return text.trim();};
 await git('init','-b','main');await git('config','user.email','test@example.invalid');await git('config','user.name','Fixture');
 return {ctx,dir,git,opts:{dir,host:'local'}};
}
test('unborn, staged+unstaged, untracked, binary, large and hostile names',async()=>{
 const {ctx,dir,git,opts}=await setup();expect((await ctx.fns.gitUi.snapshot(opts)).head).toBe('');
 await writeFile(dir+'/a.ts','const a = 1;\n');await git('add','a.ts');
 await writeFile(dir+'/a.ts','const a = 2;\n');const name='-quote " ; $x\nfile.txt';await writeFile(dir+'/'+name,'new\n');
 let s=await ctx.fns.gitUi.snapshot(opts);expect(s.files.filter((f:any)=>f.path==='a.ts').map((f:any)=>f.group)).toEqual(['staged','unstaged']);
 expect((await ctx.fns.gitUi.diff({...opts,path:'a.ts',group:'staged'})).patch).toContain('+const a = 1');
 expect((await ctx.fns.gitUi.diff({...opts,path:'a.ts',group:'unstaged'})).patch).toContain('+const a = 2');
 expect((await ctx.fns.gitUi.diff({...opts,path:name,group:'untracked'})).patch).toContain('+new');
 await writeFile(dir+'/binary',Buffer.from([0,1,2]));expect((await ctx.fns.gitUi.diff({...opts,path:'binary',group:'untracked'})).state).toBe('binary');
 await writeFile(dir+'/big','a'.repeat(300000));expect((await ctx.fns.gitUi.diff({...opts,path:'big',group:'untracked'})).state).toBe('large');
 await symlink('/etc',dir+'/escape');await expect(ctx.fns.gitUi.checkPath({...opts,path:'escape/passwd'})).rejects.toThrow('Symlink');
 await expect(ctx.fns.gitUi.diff({...opts,path:'../escape',group:'unstaged'})).rejects.toThrow();
 await expect(ctx.fns.gitUi.commit({...opts,hash:'HEAD; echo nope'})).rejects.toThrow();
 await expect(ctx.fns.gitUi.snapshot({...opts,page:201})).rejects.toThrow();
 await expect(ctx.fns.gitUi.command({...opts,args:['reset','--hard']})).rejects.toThrow();
});
test('initial, rename, delete, merge first parent, detached and history pagination',async()=>{
 const {ctx,dir,git,opts}=await setup();await writeFile(dir+'/a.txt','base\n');await git('add','.');await git('commit','-m','initial');const initial=await git('rev-parse','HEAD');
 const c=await ctx.fns.gitUi.commit({...opts,hash:initial});expect(c.comparison).toContain('Empty tree');expect((await ctx.fns.gitUi.diff({...opts,path:'a.txt',group:'commit',hash:initial})).patch).toContain('+base');
 await rename(dir+'/a.txt',dir+'/b.txt');await git('add','-A');expect((await ctx.fns.gitUi.snapshot(opts)).files[0].oldPath).toBe('a.txt');await git('commit','-m','rename');
 await git('rm','b.txt');expect((await ctx.fns.gitUi.snapshot(opts)).files[0].status).toBe('D');await git('commit','-m','delete');
 await git('checkout','-b','side');await writeFile(dir+'/side','side\n');await git('add','.');await git('commit','-m','side');await git('checkout','main');await writeFile(dir+'/main','main\n');await git('add','.');await git('commit','-m','main');await git('merge','--no-ff','side','-m','merge');const merge=await git('rev-parse','HEAD');expect((await ctx.fns.gitUi.commit({...opts,hash:merge})).comparison).toContain('merge');
 for(let i=0;i<48;i++)await git('commit','--allow-empty','-m','page '+i);
 const first=await ctx.fns.gitUi.snapshot(opts);expect(first.commits.length).toBe(50);expect(first.hasMore).toBe(true);const second=await ctx.fns.gitUi.snapshot({...opts,page:1,anchor:first.head});expect(second.commits.length).toBeGreaterThan(0);expect(second.commits[0].hash).not.toBe(first.commits[0].hash);
 await git('checkout','--detach',initial);expect((await ctx.fns.gitUi.snapshot(opts)).branch).toBe('detached HEAD');
},30000);
test('bounded core command and mocked SSH routing',async()=>{
 const {ctx,opts}=await setup();const r=await ctx.fns.git.run({...opts,args:['-c','alias.spam=!yes x','spam'],maxOutput:1024,timeout:2,allowFailure:true});expect(r.ok).toBe(false);expect(r.stderr).toContain('limit');
 const slow=await ctx.fns.git.run({...opts,args:['-c','alias.slow=!sleep 2','slow'],timeout:.1,allowFailure:true});expect(slow.ok).toBe(false);expect(slow.stderr).toContain('timed out');
 let called:any;ctx.fns.workspace={target:(o:any)=>({host:o.host,path:o.path})};ctx.fns.remote.exec=async(o:any)=>{called=o;return {exitCode:0,stdout:'ok',stderr:'',timedOut:false};};
 await ctx.fns.gitUi.command({...opts,host:'ssh-fixture',args:['status','--porcelain=v2','-z']});expect(called.host).toBe('ssh-fixture');expect(called.timeout).toBe(12);expect(called.maxOutput).toBe(1048576);expect(called.command).toContain('--no-optional-locks');
 ctx.fns.remote.exec=async()=>{throw new Error('SSH unavailable');};await expect(ctx.fns.gitUi.snapshot({...opts,host:'ssh-fixture'})).rejects.toThrow('SSH unavailable');
});
test('HTTP ownership, CSRF, closed item and fixed operation boundary',async()=>{
 const {ctx}=await setup();ctx.fns.canvas={authorizeHttp:async()=>new Response('denied',{status:403})};
 expect((await ctx.fns.gitUi.handle({req:new Request('http://localhost/gitUi?agentId=test')})).status).toBe(403);
 ctx.fns.canvas.authorizeHttp=async()=>null;ctx.fns.canvas.list=async()=>[];ctx.fns.procs={db:{select:async()=>[{id:'test'}]}};
 expect((await ctx.fns.gitUi.handle({req:new Request('http://localhost/gitUi?agentId=test&itemId=1')})).status).toBe(403);
 ctx.fns.auth={verifyCsrf:async()=>false};expect((await ctx.fns.gitUi.handle({req:new Request('http://localhost/gitUi?agentId=test',{method:'POST'})})).status).toBe(403);
 ctx.fns.canvas.list=async()=>[{id:1,kind:'gitUi.repository',args:{dir:'/pinned',host:'local'}}];
 expect((await ctx.fns.gitUi.handle({req:new Request('http://localhost/gitUi?agentId=test&itemId=1&op=run')})).status).toBe(400);
});

test('conflict, submodule marker, shallow parent, nested workspace and blob limit',async()=>{
 const {ctx,dir,git,opts}=await setup();await writeFile(dir+'/a','base\n');await git('add','.');await git('commit','-m','base');const base=await git('rev-parse','HEAD');
 await git('checkout','-b','other');await writeFile(dir+'/a','other\n');await git('commit','-am','other');await git('checkout','main');await writeFile(dir+'/a','main\n');await git('commit','-am','main');
 try{await git('merge','other');}catch{}
 expect((await ctx.fns.gitUi.diff({...opts,path:'a',group:'unstaged'})).state).toBe('conflict');await git('merge','--abort');
 await git('update-index','--add','--cacheinfo','160000,'+base+',sub');
 expect((await ctx.fns.gitUi.diff({...opts,path:'sub',group:'staged'})).state).toBe('submodule');await git('reset','HEAD','sub');
 await mkdir(dir+'/nested');await writeFile(dir+'/nested/new.txt','nested\n');
 expect((await ctx.fns.gitUi.diff({...opts,dir:dir+'/nested',path:'nested/new.txt',group:'untracked'})).patch).toContain('+nested');
 await writeFile(dir+'/big','x'.repeat(300000));await git('add','big');expect((await ctx.fns.gitUi.diff({...opts,path:'big',group:'staged'})).state).toBe('large');await git('commit','-m','big');
 const clone=dir+'-shallow';await git('clone','--depth=1','file://'+dir,clone);
 expect((await ctx.fns.gitUi.snapshot({...opts,dir:clone})).shallow).toBe(true);
 await expect(ctx.fns.gitUi.commit({...opts,dir:clone,hash:await git('rev-parse','HEAD')})).rejects.toThrow('shallow');
},30000);

