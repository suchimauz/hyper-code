import {test,expect} from 'bun:test';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
// Raw procedures against an isolated temporary repository; no live session or shared fixture is touched.
const load=async(path:string)=>(await import(path)).default;
const root=resolve(import.meta.dir,'../../../..');
async function setup(){
 const base=resolve(root,'.mauzcode/tmp/refs-tests');await mkdir(base,{recursive:true});const dir=await mkdtemp(base+'/repo-');
 const calls:{host:string;args:string[]}[]=[];
 const ctx:any={fns:{git:{},gitUi:{},remote:{quote:({value}:any)=>"'"+value.replaceAll("'","'\\''")+"'"}},state:{}};
 const run=await load(root+'/src/git/run.ts');ctx.fns.git.run=(o:any)=>{calls.push({host:o.host,args:o.args});return run(ctx,null,o);};
 for(const name of ['command','snapshot','refs']){const fn=await load(import.meta.dir+'/'+name+'.ts');ctx.fns.gitUi[name]=(o:any)=>fn(ctx,null,o);}
 const git=async(...args:string[])=>{const p=Bun.spawn(['git','-c','user.email=t@example.invalid','-c','user.name=Fixture',...args],{cwd:dir,stdout:'pipe',stderr:'pipe'});const text=await new Response(p.stdout).text();const err=await new Response(p.stderr).text();if(await p.exited)throw new Error(err);return text.trim();};
 await git('init','-q','-b','main');
 return {ctx,dir,git,calls,opts:{dir,host:'local'},cleanup:()=>rm(dir,{recursive:true,force:true})};
}
const pick=(refs:any[]|undefined)=>(refs??[]).map(r=>r.kind+':'+r.name);
// Git subcommands (after global -c options) used by a call.
const subcommand=(args:string[])=>{for(let i=0;i<args.length;i++){if(args[i]==='-c'){i++;continue;}if(!args[i]!.startsWith('-'))return args[i];}return '';};

test('symbolic HEAD, branches, remotes with alias, lightweight/annotated/nested tags, non-commit tags and collisions',async()=>{
 const f=await setup();try{
 await writeFile(f.dir+'/a','1\n');await f.git('add','.');await f.git('commit','-q','-m','one');const one=await f.git('rev-parse','HEAD');
 await f.git('tag','light');await f.git('tag','-a','ann','-m','annotated');await f.git('tag','-a','nested','-m','tag of tag','ann');
 await f.git('tag','treetag','HEAD^{tree}');const blob=await f.git('hash-object','-w','a');await f.git('tag','-a','blobtag','-m','blob',blob);
 await f.git('commit','-q','--allow-empty','-m','two');const two=await f.git('rev-parse','HEAD');
 // Colliding short names: branch "dup", tag "dup" and remote "origin/dup" vs local branch "origin/dup".
 await f.git('branch','dup',one);await f.git('tag','dup',one);await f.git('branch','origin/dup',one);
 await f.git('update-ref','refs/remotes/origin/dup',one);await f.git('update-ref','refs/remotes/origin/main',two);
 await f.git('symbolic-ref','refs/remotes/origin/HEAD','refs/remotes/origin/main');
 await f.git('symbolic-ref','refs/remotes/up/HEAD','refs/remotes/up/gone');
 const long='feature/'+'x'.repeat(180)+'/<b>&"q\'';await f.git('branch',long,one);
 const s=await f.ctx.fns.gitUi.snapshot({...f.opts,decorate:true});
 expect(s.refsError).toBeUndefined();expect(s.refsKey).toMatch(/^[a-f0-9]{16}$/);
 const top=s.commits.find((c:any)=>c.hash===two),first=s.commits.find((c:any)=>c.hash===one);
 expect(top.refs[0]).toEqual({kind:'head',name:'HEAD',ref:'HEAD',branch:'main'});
 expect(top.refs.find((r:any)=>r.ref==='refs/heads/main')).toEqual({kind:'branch',name:'main',ref:'refs/heads/main',current:true});
 expect(top.refs.find((r:any)=>r.ref==='refs/remotes/origin/HEAD')).toEqual({kind:'remote',name:'origin/HEAD',ref:'refs/remotes/origin/HEAD',alias:'origin/main'});
 expect(pick(top.refs)).toEqual(['head:HEAD','branch:main','remote:origin/HEAD','remote:origin/main']);
 // Annotated and nested tags are peeled to the commit; non-commit tags and the dangling alias never appear.
 expect(first.refs.filter((r:any)=>r.kind==='tag').map((r:any)=>[r.name,r.annotated])).toEqual([['ann',true],['dup',false],['light',false],['nested',true]]);
 const all=s.commits.flatMap((c:any)=>c.refs.map((r:any)=>r.name));
 for(const n of ['treetag','blobtag','up/HEAD','up/gone'])expect(all).not.toContain(n);
 expect(first.refs.filter((r:any)=>r.name==='dup').map((r:any)=>r.ref)).toEqual(['refs/heads/dup','refs/tags/dup']);
 expect(first.refs.filter((r:any)=>r.name==='origin/dup').map((r:any)=>r.ref)).toEqual(['refs/heads/origin/dup','refs/remotes/origin/dup']);
 expect(first.refs.find((r:any)=>r.kind==='branch'&&r.name===long)?.ref).toBe('refs/heads/'+long);
 expect(first.refs.some((r:any)=>r.kind==='head')).toBe(false);
 // Only bounded read-only inspection subcommands were executed, all on the pinned host.
 expect(new Set(f.calls.map(c=>subcommand(c.args)))).toEqual(new Set(['rev-parse','status','log','for-each-ref']));
 expect(f.calls.every(c=>c.host==='local')).toBe(true);
 }finally{await f.cleanup();}
});

test('detached HEAD with annotated tag, unborn repository, undecorated snapshot and HEAD-only scope',async()=>{
 const f=await setup();try{
 const unborn=await f.ctx.fns.gitUi.refs(f.opts);expect(unborn).toEqual({byCommit:{},key:expect.stringMatching(/^[a-f0-9]{16}$/),truncated:false});
 await f.git('commit','-q','--allow-empty','-m','base');const base=await f.git('rev-parse','HEAD');
 await f.git('tag','-a','v1','-m','release');
 await f.git('checkout','-q','-b','side');await f.git('commit','-q','--allow-empty','-m','side only');const side=await f.git('rev-parse','HEAD');
 await f.git('checkout','-q','--detach',base);
 const s=await f.ctx.fns.gitUi.snapshot({...f.opts,decorate:true});
 expect(s.commits.map((c:any)=>c.hash)).toEqual([base]);
 expect(s.commits[0].refs).toEqual([{kind:'head',name:'HEAD',ref:'HEAD',detached:true},{kind:'branch',name:'main',ref:'refs/heads/main'},{kind:'tag',name:'v1',ref:'refs/tags/v1',annotated:true}]);
 // Side-branch history is not added even though the ref lookup knows it.
 expect(s.commits.some((c:any)=>c.hash===side)).toBe(false);
 expect((await f.ctx.fns.gitUi.refs(f.opts)).byCommit[side]).toEqual([{kind:'branch',name:'side',ref:'refs/heads/side'}]);
 const plain=await f.ctx.fns.gitUi.snapshot(f.opts);expect(plain.refsKey).toBeUndefined();expect(plain.commits[0].refs).toBeUndefined();
 }finally{await f.cleanup();}
});

test('ref-only moves change the key; paging with the same anchor keeps pagination and decorations per page',async()=>{
 const f=await setup();try{
 for(let i=0;i<55;i++)await f.git('commit','-q','--allow-empty','-m','c'+i);
 const a=await f.ctx.fns.gitUi.snapshot({...f.opts,decorate:true});expect(a.commits).toHaveLength(50);expect(a.hasMore).toBe(true);
 const old=await f.git('rev-parse','HEAD~52');await f.git('tag','deep',old);
 const b=await f.ctx.fns.gitUi.snapshot({...f.opts,decorate:true});expect(b.head).toBe(a.head);expect(b.refsKey).not.toBe(a.refsKey);
 expect(b.commits.map((c:any)=>c.hash)).toEqual(a.commits.map((c:any)=>c.hash));
 const page=await f.ctx.fns.gitUi.snapshot({...f.opts,page:1,anchor:a.head,decorate:true});
 expect(page.commits).toHaveLength(5);expect(page.hasMore).toBe(false);
 expect(page.commits.find((c:any)=>c.hash===old).refs).toEqual([{kind:'tag',name:'deep',ref:'refs/tags/deep',annotated:false}]);
 await f.git('update-ref','refs/heads/main',old);// branch moves backwards while HEAD stays symbolic on main
 const c=await f.ctx.fns.gitUi.snapshot({...f.opts,decorate:true});expect(c.head).toBe(old);expect(c.refsKey).not.toBe(b.refsKey);
 }finally{await f.cleanup();}
});

test('lookup failure keeps commits, reports refsError distinctly and never falls back to another host',async()=>{
 const calls:any[]=[];
 const command=await load(import.meta.dir+'/command.ts'),snapshot=await load(import.meta.dir+'/snapshot.ts'),refs=await load(import.meta.dir+'/refs.ts');
 const ctx:any={fns:{gitUi:{},git:{run:async(o:any)=>{calls.push(o);const sub=subcommand(o.args);
  if(sub==='for-each-ref'){if(!o.allowFailure)throw Error('fatal');return {ok:false,code:255,stdout:'',stderr:'ssh: connection reset'};}
  if(sub==='rev-parse'){const a=o.args.slice(-1)[0];return {ok:true,code:0,stdout:a==='--show-toplevel'?'/srv/repo':a==='--is-shallow-repository'?'false':a==='HEAD'&&o.args.includes('--abbrev-ref')?'main':'a'.repeat(40),stderr:''};}
  if(sub==='log')return {ok:true,code:0,stdout:'a'.repeat(40)+'\0\0A\0'+'2024-01-01T00:00:00Z\0s\0',stderr:''};
  return {ok:true,code:0,stdout:'',stderr:''};}}}};
 for(const [n,fn] of [['command',command],['snapshot',snapshot],['refs',refs]] as const)ctx.fns.gitUi[n]=(o:any)=>fn(ctx,null,o);
 const s=await ctx.fns.gitUi.snapshot({dir:'/srv/repo',host:'ssh-box',decorate:true});
 expect(s.commits).toHaveLength(1);expect(s.commits[0].refs).toEqual([]);expect(s.refsError).toBe('ssh: connection reset');expect(s.refsKey).toBe('');
 expect(calls.every(c=>c.host==='ssh-box')).toBe(true);
 expect(calls.map(c=>subcommand(c.args)).every(s=>['rev-parse','status','log','for-each-ref'].includes(s))).toBe(true);
 await expect(ctx.fns.gitUi.refs({dir:'relative',host:'ssh-box'})).rejects.toThrow('Invalid repository target');
 await expect(ctx.fns.gitUi.refs({dir:'/srv/repo',host:'box;rm'})).rejects.toThrow('Invalid repository target');
 await expect(ctx.fns.gitUi.command({dir:'/srv/repo',host:'ssh-box',args:['fetch']})).rejects.toThrow('Unsupported');
 await expect(ctx.fns.gitUi.command({dir:'/srv/repo',host:'ssh-box',args:['update-ref','refs/heads/x','HEAD']})).rejects.toThrow('Unsupported');
});

test('op=refs is served only after HTTP and item authorization, on the item-pinned host and directory',async()=>{
 const handle=await load(import.meta.dir+'/handle.ts');const seen:any[]=[];
 const ctx:any={fns:{canvas:{authorizeHttp:async()=>new Response('',{status:403})},gitUi:{ownedItem:async()=>{throw Error('not owned');},refs:async(o:any)=>{seen.push(o);return {byCommit:{},key:'k',truncated:false};}}}};
 const req=()=>new Request('http://localhost/gitUi?agentId=fixture&itemId=1&op=refs&host=local&dir=/elsewhere');
 expect((await handle(ctx,null,{req:req()})).status).toBe(403);expect(seen).toHaveLength(0);
 ctx.fns.canvas.authorizeHttp=async()=>null;expect((await handle(ctx,null,{req:req()})).status).toBe(400);expect(seen).toHaveLength(0);
 ctx.fns.gitUi.ownedItem=async()=>({host:'ssh-box',dir:'/pinned'});const r=await handle(ctx,null,{req:req()});
 expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(await r.json()).toEqual({byCommit:{},key:'k',truncated:false});
 expect(seen).toEqual([{dir:'/pinned',host:'ssh-box'}]);
});

test('nested annotated tags at any depth decorate the final commit; nested tags of trees are skipped (real repository)',async()=>{
 const f=await setup();try{
 await f.git('commit','-q','--allow-empty','-m','base');const base=await f.git('rev-parse','HEAD');
 await f.git('tag','-a','t1','-m','1');await f.git('tag','-a','t2','-m','2','t1');await f.git('tag','-a','t3','-m','3','t2');
 await f.git('tag','-a','tree1','-m','t','HEAD^{tree}');await f.git('tag','-a','tree2','-m','t','tree1');
 const r=await f.ctx.fns.gitUi.refs(f.opts);
 expect(r.error).toBeUndefined();
 expect(r.byCommit[base]!.filter((x:any)=>x.kind==='tag').map((x:any)=>[x.name,x.annotated])).toEqual([['t1',true],['t2',true],['t3',true]]);
 expect(JSON.stringify(r)).not.toContain('tree1');expect(JSON.stringify(r)).not.toContain('tree2');
 }finally{await f.cleanup();}
});

/** Mocked Git transport: real-shaped outputs, optional overrides per subcommand. */
async function mocked(over:Record<string,(args:string[])=>any>){
 const calls:string[][]=[];const C='c'.repeat(40),T='e'.repeat(40);
 const command=await load(import.meta.dir+'/command.ts'),refs=await load(import.meta.dir+'/refs.ts');
 const ctx:any={fns:{gitUi:{},git:{run:async(o:any)=>{const args=o.args.slice(o.args.findIndex((a:string)=>['rev-parse','for-each-ref','log'].includes(a)));calls.push(args);
  const fn=over[args[0]==='rev-parse'?(args.includes('--symbolic-full-name')?'sym':args.includes('--verify')?'head':'peel'):args[0]!];if(fn)return fn(args);
  if(args[0]==='rev-parse'&&args.includes('--verify'))return {ok:true,code:0,stdout:C+'\n',stderr:''};
  if(args[0]==='rev-parse'&&args.includes('--symbolic-full-name'))return {ok:true,code:0,stdout:'refs/heads/main\n',stderr:''};
  return {ok:true,code:0,stdout:'',stderr:''};}}}};
 ctx.fns.gitUi.command=(o:any)=>command(ctx,null,o);ctx.fns.gitUi.refs=(o:any)=>refs(ctx,null,o);
 return {ctx,calls,C,T,run:()=>ctx.fns.gitUi.refs({dir:'/srv/repo',host:'ssh-box'})};
}

test('older Git one-layer dereference: all nested tags peeled with one rev-parse and one log, non-commits dropped',async()=>{
 const n1='1'.repeat(40),n2='2'.repeat(40),n3='3'.repeat(40),i1='4'.repeat(40),i2='5'.repeat(40),i3='6'.repeat(40);
 const m=await mocked({
  'for-each-ref':()=>({ok:true,code:0,stderr:'',stdout:[['refs/heads/main',m.C,'commit','',''],['refs/tags/a',n1,'tag',i1,'tag'],['refs/tags/b',n2,'tag',i2,'tag'],['refs/tags/c',n3,'tag',i3,'tag'],['refs/tags/d',n1,'tag',i1,'tag']].map(r=>[...r,''].join('\0')).join('\n')+'\n'}),
  peel:args=>({ok:true,code:0,stderr:'',stdout:args.slice(1).map(a=>a===n3+'^{}'?m.T:m.C).join('\n')+'\n'}),
  log:()=>({ok:true,code:0,stderr:'',stdout:m.C+'\n'}),
 });
 const r=await m.run();
 expect(r.error).toBeUndefined();
 expect(r.byCommit[m.C].filter((x:any)=>x.kind==='tag').map((x:any)=>x.name)).toEqual(['a','b','d']);
 const peel=m.calls.filter(c=>c[0]==='rev-parse'&&!c.includes('--verify')&&!c.includes('--symbolic-full-name'));
 expect(peel).toEqual([['rev-parse',n1+'^{}',n2+'^{}',n3+'^{}']]);// deduplicated, one call for all
 expect(m.calls.filter(c=>c[0]==='log')).toEqual([['log','--no-walk=unsorted','--format=%H',m.C,m.T,'--']]);
 // A failing peel is a reported lookup error, never a silent drop.
 const bad=await mocked({'for-each-ref':()=>({ok:true,code:0,stderr:'',stdout:['refs/tags/a',n1,'tag',i1,'tag',''].join('\0')+'\n'}),peel:()=>({ok:false,code:128,stdout:'',stderr:'fatal: bad object'})});
 expect((await bad.run()).error).toBe('fatal: bad object');
 // Current Git needs no extra commands.
 const plain=await mocked({'for-each-ref':()=>({ok:true,code:0,stderr:'',stdout:['refs/tags/a',n1,'tag',m.C,'commit',''].join('\0')+'\n'})});
 await plain.run();expect(plain.calls.map(c=>c[0])).toEqual(['rev-parse','rev-parse','for-each-ref']);
});

test('HEAD lookup failures are reported as refsError, not shown as detached or missing HEAD; unborn stays error-free',async()=>{
 const refsLine={'for-each-ref':()=>({ok:true,code:0,stderr:'',stdout:''})};
 const transport=await mocked({...refsLine,head:()=>({ok:false,code:255,stdout:'',stderr:'ssh: connection reset'})});
 expect(await transport.run()).toEqual({byCommit:{},key:'',truncated:false,error:'ssh: connection reset'});
 const corrupt=await mocked({...refsLine,head:()=>({ok:false,code:128,stdout:'',stderr:''})});
 expect((await corrupt.run()).error).toBe('HEAD lookup failed');
 const sym=await mocked({...refsLine,sym:()=>({ok:false,code:-1,stdout:'',stderr:'timeout'})});
 const s=await sym.run();expect(s.error).toBe('timeout');expect(JSON.stringify(s)).not.toContain('detached');
 // Unborn: verify exits 1 silently and the symbolic lookup exits 128 — no badge, no error.
 const unborn=await mocked({...refsLine,head:()=>({ok:false,code:1,stdout:'',stderr:''}),sym:()=>({ok:false,code:128,stdout:'HEAD\n',stderr:'fatal: ambiguous argument'})});
 const u=await unborn.run();expect(u.error).toBeUndefined();expect(u.byCommit).toEqual({});
});
