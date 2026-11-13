import {test,expect} from 'bun:test';
import {testCtx} from '../../../../src/$test';
import migration from './$migration_20291016000000_review_comments';
const names=['commentPath','commentOutdated','ownedItem','commentLines','commentView','commentsChanged','commentMutate','commentCreate','commentUpdate','commentDelete','commentResolve','commentReopen','commentsList','handle'];
async function fixture(){
 const dbctx=await testCtx();const db=dbctx.fns.procs.db;
 await migration.up(dbctx);
 await db.run({sql:"INSERT INTO agents(id,model,created_at,updated_at) VALUES ('review-a','test',1,1),('review-b','test',1,1)"});
 const events:any[]=[];let calls=0;let closed=false;
 const ctx:any={fns:{procs:{db,events:{emit:({event}:any)=>events.push(event)}},canvas:{list:async({agentId}:any)=>closed?[]:[{id:agentId==='review-a'?1:2,kind:'gitUi.repository',args:{host:'local',dir:'/fixture'}}],authorizeHttp:async()=>null,show:async()=>({id:1})},auth:{verifyCsrf:async()=>true},gitUi:{snapshot:async()=>({files:[{path:'a',group:'unstaged'}]}),commit:async()=>({files:[{path:'a'}]}),checkPath:async({path}:any)=>{if(typeof path!=='string'||path.includes('..'))throw new Error('Invalid path');},diff:async()=>{calls++;return {patch:'@@ -1,2 +1,2 @@\n-old\n+new\n context\n',state:'ok'};}}}};
 for(const name of names){const fn=(await import('./'+name+'.ts')).default;ctx.fns.gitUi[name]=(opts:any)=>fn(ctx,null,opts);}
 return {ctx,db,events,calls:()=>calls,close:()=>{closed=true;},target:{agentId:'review-a',itemId:1},anchor:{scope:'worktree',commit_hash:null,worktree_group:'unstaged',path:'a',old_path:null,side:'new',line_start:1,line_end:1,line_text:'new'}};
}
test('CRUD, byte limits, timestamps, resolution idempotency, reopen and mutation events',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;
 const {comment:c}=await g.commentCreate({...f.target,anchor:f.anchor,body:'hello'});
 expect(typeof c.created_at).toBe('number');expect(c.outdated).toBe(false);
 await expect(g.commentCreate({...f.target,anchor:f.anchor,body:'я'.repeat(4097)})).rejects.toThrow('UTF-8');
 await expect(g.commentCreate({...f.target,anchor:{...f.anchor,line_text:'wrong'},body:'x'})).rejects.toThrow('Anchor');
 await expect(g.commentCreate({...f.target,anchor:{...f.anchor,line_end:3},body:'x'})).rejects.toThrow('Anchor');
 await g.commentUpdate({...f.target,id:c.id,body:'edited'});
 const first=(await g.commentResolve({...f.target,id:c.id,note:'done',resolvedBy:'agent'})).comment;
 const again=(await g.commentResolve({...f.target,id:c.id,note:'changed'})).comment;expect(again.resolution_note).toBe('done');expect(again.resolved_at).toBe(first.resolved_at);
 await f.db.run({sql:'UPDATE git_review_comments SET sent_at=1 WHERE id=?',params:[c.id]});
 const reopened=(await g.commentReopen({...f.target,id:c.id})).comment;expect(reopened.sent_at).toBeNull();expect(reopened.resolved_by).toBeNull();
 expect((await g.commentsList(f.target)).openCount).toBe(1);
 await g.commentDelete({...f.target,id:c.id});expect((await g.commentsList(f.target)).comments).toHaveLength(0);
 expect(f.events).toHaveLength(6);expect(f.events.every(e=>e.type==='gitUi.comments.changed'&&e.key===f.events[0].key)).toBe(true);
});
test('foreign, closed and archived guards cover every entry point',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;const {comment:c}=await g.commentCreate({...f.target,anchor:f.anchor,body:'x'});
 await expect(g.commentUpdate({agentId:'review-b',itemId:2,id:c.id,body:'steal'})).rejects.toThrow('not found');
 expect((await g.commentsList({agentId:'review-b',itemId:2})).comments).toHaveLength(0);
 await expect(g.commentsList({...f.target,itemId:2})).rejects.toThrow('unavailable');
 await f.db.run({sql:'UPDATE agents SET archived_at=1 WHERE id=?',params:['review-a']});
 for(const name of ['commentCreate','commentUpdate','commentDelete','commentResolve','commentReopen','commentsList'])await expect(g[name]({...f.target,id:c.id,anchor:f.anchor,body:'x'})).rejects.toThrow('unavailable');
 await f.db.run({sql:'UPDATE agents SET archived_at=NULL WHERE id=?',params:['review-a']});f.close();await expect(g.commentsList(f.target)).rejects.toThrow('unavailable');
});
test('outdated compares the correct side and range, caches per group, preserves commit anchors',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;
 await g.commentCreate({...f.target,anchor:f.anchor,body:'one'});await g.commentCreate({...f.target,anchor:{...f.anchor,side:'old',line_text:'old'},body:'two'});
 const before=f.calls();expect((await g.commentsList(f.target)).comments.every((c:any)=>!c.outdated)).toBe(true);expect(f.calls()-before).toBe(1);
 g.diff=async()=>({patch:'@@ -1 +1 @@\n-old\n+changed\n'});const list=await g.commentsList(f.target);expect(list.comments.map((c:any)=>c.outdated)).toEqual([true,false]);
 g.diff=async()=>{throw new Error('Changes are stale; refresh');};expect((await g.commentsList(f.target)).comments.every((c:any)=>c.outdated)).toBe(true);
 await f.db.run({sql:"UPDATE git_review_comments SET scope='commit',commit_hash=?,worktree_group=NULL",params:['a'.repeat(40)]});expect((await g.commentsList(f.target)).comments.every((c:any)=>!c.outdated)).toBe(true);
});
test('500-open limit serializes concurrent create and reopen using the agent row lock',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;const {comment:c}=await g.commentCreate({...f.target,anchor:f.anchor,body:'x'});await g.commentResolve({...f.target,id:c.id});
 await f.db.run({sql:"INSERT INTO git_review_comments SELECT md5(n::text)::uuid,agent_id,host,dir,scope,commit_hash,worktree_group,path,old_path,side,line_start,line_end,line_text,body,'open',NULL,NULL,NULL,NULL,created_at,updated_at FROM git_review_comments CROSS JOIN generate_series(1,499) AS n WHERE id=?",params:[c.id]});
 const otherDb=await testCtx();const other:any={fns:{...f.ctx.fns,procs:{...f.ctx.fns.procs,db:otherDb.fns.procs.db},gitUi:{...g}}};
 for(const name of names){const fn=(await import('./'+name+'.ts')).default;other.fns.gitUi[name]=(opts:any)=>fn(other,null,opts);}
 const results=await Promise.allSettled([g.commentCreate({...f.target,anchor:f.anchor,body:'race'}),other.fns.gitUi.commentReopen({...f.target,id:c.id})]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);expect((await g.commentsList(f.target)).openCount).toBe(500);
 await expect(g.commentCreate({...f.target,anchor:f.anchor,body:'overflow'})).rejects.toThrow('500');
});
test('HTTP JSON errors, CSRF, trusted targets and no-op POST opening contract',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;
 const req=(op:string,body?:object)=>new Request('http://localhost/gitUi?agentId=review-a&itemId=1'+(op?'&op='+op:''),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 f.ctx.fns.auth.verifyCsrf=async()=>false;let r=await g.handle({req:req('commentCreate',{})});expect(r.status).toBe(403);expect(await r.json()).toHaveProperty('error');expect(r.headers.get('cache-control')).toBe('no-store');
 f.ctx.fns.auth.verifyCsrf=async()=>true;r=await g.handle({req:req('commentCreate',{anchor:f.anchor,body:'x',host:'evil',dir:'/evil'})});expect(r.status).toBe(200);expect((await r.json()).comment.host).toBe('local');
 r=await g.handle({req:req('',{})});expect(r.status).toBe(200);
 r=await g.handle({req:req('comments')});expect((await r.json()).openCount).toBe(1);
 f.close();r=await g.handle({req:req('comments')});expect(r.status).toBe(403);expect(await r.json()).toHaveProperty('error');
});
test('bounded pages reach all resolved history and newer open comments with stable global counts',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;const {comment:c}=await g.commentCreate({...f.target,anchor:f.anchor,body:'x'});await g.commentResolve({...f.target,id:c.id});
 await f.db.run({sql:"INSERT INTO git_review_comments SELECT md5(n::text)::uuid,agent_id,host,dir,scope,commit_hash,worktree_group,path,old_path,side,line_start,line_end,line_text,body,'resolved',NULL,NULL,NULL,NULL,created_at,updated_at FROM git_review_comments CROSS JOIN generate_series(1,501) AS n WHERE id=?",params:[c.id]});
 const {comment:newest}=await g.commentCreate({...f.target,anchor:f.anchor,body:'new'});
 const ids=new Set<string>();let page:number|null=0;
 while(page!==null){const r=await g.commentsList({...f.target,status:'all',page,limit:100});expect(r.comments.length).toBeLessThanOrEqual(100);expect(r.openCount).toBe(1);expect(r.unsentCount).toBe(1);r.comments.forEach((c:any)=>ids.add(c.id));page=r.nextPage;}
 expect(ids.size).toBe(503);expect(ids.has(newest.id)).toBe(true);
 const last=await g.commentsList({...f.target,status:'resolved',page:1,limit:500});expect(last.comments).toHaveLength(2);expect(last.nextPage).toBeNull();
 const response=await g.handle({req:new Request('http://localhost/gitUi?agentId=review-a&itemId=1&op=comments&status=all&page=1&limit=500')});expect((await response.json()).comments).toHaveLength(3);
 await expect(g.commentsList({...f.target,page:-1})).rejects.toThrow('pagination');await expect(g.commentsList({...f.target,limit:501})).rejects.toThrow('pagination');
});
test('saved comments survive directory and symlink-ancestor paths; all mutation responses compute outdated',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;
 for(const message of ['Not a regular file','Symlink ancestor refused']){
  g.diff=async()=>({patch:'@@ -1 +1 @@\n-old\n+new\n'});const {comment:c}=await g.commentCreate({...f.target,anchor:f.anchor,body:'x'});
  g.checkPath=async()=>{throw new Error(message);};g.diff=async()=>{throw new Error(message);};
  expect((await g.commentsList({...f.target,path:'a'})).comments[0].outdated).toBe(true);
  expect((await g.commentUpdate({...f.target,id:c.id,body:'updated'})).comment.outdated).toBe(true);
  expect((await g.commentResolve({...f.target,id:c.id})).comment.outdated).toBe(true);
  expect((await g.commentReopen({...f.target,id:c.id})).comment.outdated).toBe(true);
  expect((await g.commentDelete({...f.target,id:c.id})).comment).toBeNull();
  g.checkPath=async()=>true;
 }
});
test('SSH unsafe paths become outdated but SSH transport failures propagate',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;const {comment:c}=await g.commentCreate({...f.target,anchor:f.anchor,body:'x'});
 const check=(await import('./checkPath')).default;
 const remote:any={fns:{gitUi:g,remote:{quote:({value}:any)=>value,exec:async()=>({exitCode:42,timedOut:false,stdout:'',stderr:''})}}};
 g.diff=async()=>{await check(remote,null,{host:'fixture-ssh',dir:'/fixture',path:'a/b'});return {patch:''};};
 expect((await g.commentsList(f.target)).comments[0].outdated).toBe(true);expect((await g.commentUpdate({...f.target,id:c.id,body:'safe'})).comment.outdated).toBe(true);
 remote.fns.remote.exec=async()=>({exitCode:255,timedOut:false,stdout:'',stderr:'Connection refused'});
 await expect(g.commentsList(f.target)).rejects.toThrow('transport failed');await expect(g.commentUpdate({...f.target,id:c.id,body:'rollback'})).rejects.toThrow('transport failed');
 expect((await f.db.select({sql:'SELECT body FROM git_review_comments WHERE id=?',params:[c.id]}))[0].body).toBe('safe');
 remote.fns.remote.exec=async()=>({exitCode:42,timedOut:true,stdout:'',stderr:''});await expect(g.commentsList(f.target)).rejects.toThrow('transport failed');
});
test('old_path must equal actual worktree or commit rename metadata',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;
 await expect(g.commentCreate({...f.target,anchor:{...f.anchor,old_path:'fake'},body:'x'})).rejects.toThrow('rename source');
 g.snapshot=async()=>({files:[{path:'a',oldPath:'real',group:'unstaged'}]});
 await expect(g.commentCreate({...f.target,anchor:{...f.anchor,old_path:'fake'},body:'x'})).rejects.toThrow('rename source');
 await expect(g.commentCreate({...f.target,anchor:f.anchor,body:'x'})).rejects.toThrow('rename source');
 expect((await g.commentCreate({...f.target,anchor:{...f.anchor,old_path:'real'},body:'x'})).comment.old_path).toBe('real');
 const anchor={...f.anchor,scope:'commit',commit_hash:'a'.repeat(40),worktree_group:null,old_path:'fake'};
 g.commit=async()=>({files:[{path:'a',oldPath:'real'}]});await expect(g.commentCreate({...f.target,anchor,body:'x'})).rejects.toThrow('rename source');
 expect((await g.commentCreate({...f.target,anchor:{...anchor,old_path:'real'},body:'x'})).comment.outdated).toBe(false);
});
test('real local directory and symlink ancestor never read escaped content during saved CRUD',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;
 const fs=await import('node:fs/promises');const path=await import('node:path');
 const base=path.resolve('.mauzcode/tmp',String(process.pid),'comment-paths');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(base+'/repo-');
 const {comment:c}=await g.commentCreate({...f.target,anchor:f.anchor,body:'x'});
 const check=(await import('./checkPath')).default;
 await fs.mkdir(dir+'/a');g.diff=async()=>{await check(f.ctx,null,{host:'local',dir,path:'a'});throw new Error('must not read directory');};
 expect((await g.commentUpdate({...f.target,id:c.id,body:'directory'})).comment.outdated).toBe(true);
 await fs.symlink(dir,dir+'/link');await f.db.run({sql:'UPDATE git_review_comments SET path=? WHERE id=?',params:['link/a',c.id]});
 g.diff=async()=>{await check(f.ctx,null,{host:'local',dir,path:'link/a'});throw new Error('must not follow symlink');};
 expect((await g.commentsList({...f.target,path:'link/a'})).comments[0].outdated).toBe(true);
 expect((await g.commentResolve({...f.target,id:c.id})).comment.outdated).toBe(true);
 expect((await g.commentDelete({...f.target,id:c.id})).comment).toBeNull();
});
test('real commit and index anchors ignore worktree obstacles, including rename sources',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;
 const fs=await import('node:fs/promises');const path=await import('node:path');
 const base=path.resolve('.mauzcode/tmp',String(process.pid),'comment-history');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(base+'/repo-');
 f.ctx.fns.canvas.list=async()=>[{id:1,kind:'gitUi.repository',args:{host:'local',dir}}];
 const run=(await import('../../../../src/git/run')).default;f.ctx.fns.git={run:(o:any)=>run(f.ctx,null,o)};
 for(const name of ['command','snapshot','commit','diff','checkPath','blobSize']){const fn=(await import('./'+name+'.ts')).default;g[name]=(o:any)=>fn(f.ctx,null,o);}
 const git=async(...args:string[])=>{const p=Bun.spawn(['git',...args],{cwd:dir,stdout:'pipe',stderr:'pipe'});const out=await new Response(p.stdout).text();const err=await new Response(p.stderr).text();if(await p.exited)throw new Error(err);return out.trim();};
 await git('init','-b','main');await git('config','user.email','test@example.invalid');await git('config','user.name','Fixture');
 await fs.mkdir(dir+'/old');await fs.writeFile(dir+'/old/a','one\ntwo\nthree\nfour\nfive\n');await git('add','.');await git('commit','-m','base');
 await fs.mkdir(dir+'/new');await git('mv','old/a','new/a');await fs.appendFile(dir+'/new/a','six\n');await git('add','.');await git('commit','-m','rename');const hash=await git('rev-parse','HEAD');
 const anchor={...f.anchor,scope:'commit',commit_hash:hash,worktree_group:null,path:'new/a',old_path:'old/a',line_start:6,line_end:6,line_text:'six'};
 await fs.rm(dir+'/new',{recursive:true});await fs.mkdir(dir+'/new/a',{recursive:true});await fs.rm(dir+'/old',{recursive:true,force:true});await fs.symlink(dir+'/new',dir+'/old');
 expect((await g.commentCreate({...f.target,anchor,body:'historical rename'})).comment.outdated).toBe(false);
 await fs.rm(dir+'/new',{recursive:true});await fs.symlink(dir+'/old',dir+'/new');
 expect((await g.commentCreate({...f.target,anchor,body:'historical symlink ancestor'})).comment.outdated).toBe(false);
 await fs.rm(dir+'/new');await fs.rm(dir+'/old');await git('reset','--hard','HEAD');
 await fs.mkdir(dir+'/next');await git('mv','new/a','next/a');await fs.appendFile(dir+'/next/a','seven\n');await git('add','.');
 const staged={...anchor,scope:'worktree',commit_hash:null,worktree_group:'staged',path:'next/a',old_path:'new/a',line_start:7,line_end:7,line_text:'seven'};
 await fs.rm(dir+'/next',{recursive:true});await fs.mkdir(dir+'/next/a',{recursive:true});await fs.rm(dir+'/new',{recursive:true,force:true});await fs.symlink(dir+'/next',dir+'/new');
 const c=(await g.commentCreate({...f.target,anchor:staged,body:'indexed rename'})).comment;expect(c.outdated).toBe(false);
 await fs.rm(dir+'/next',{recursive:true});await fs.symlink(dir+'/new',dir+'/next');
 expect((await g.commentCreate({...f.target,anchor:staged,body:'indexed symlink ancestor'})).comment.outdated).toBe(false);
 expect((await g.commentsList(f.target)).comments.every((c:any)=>!c.outdated)).toBe(true);
 for(const field of ['path','old_path'])for(const unsafe of ['../escape','/absolute','a/../b'])await expect(g.commentCreate({...f.target,anchor:{...staged,[field]:unsafe},body:'unsafe'})).rejects.toThrow('Invalid repository path');
 await expect(g.checkPath({host:'local',dir,path:'next/a'})).rejects.toThrow('Symlink ancestor refused');
 await expect(g.commentCreate({...f.target,anchor:{...staged,worktree_group:'unstaged',old_path:null},body:'unsafe worktree'})).rejects.toThrow();
 await fs.rm(dir+'/next');await fs.mkdir(dir+'/next/a',{recursive:true});
 await expect(g.checkPath({host:'local',dir,path:'next/a'})).rejects.toThrow('Not a regular file');
 await expect(g.commentCreate({...f.target,anchor:{...staged,worktree_group:'unstaged',old_path:null},body:'directory worktree'})).rejects.toThrow();
 await git('reset','HEAD','--','next/a','new/a');
 expect((await g.commentUpdate({...f.target,id:c.id,body:'index changed'})).comment.outdated).toBe(true);
});
