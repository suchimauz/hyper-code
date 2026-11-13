import {test,expect} from 'bun:test';
import { SQL } from 'bun';
import {testCtx} from '../../../../src/$test';
import migration from './$migration_20291016000000_review_comments';
import archiveHook from './$hook_session.archived';
import sweepArchived from './sweepArchived';
import unarchive from '../../../../src/session/unarchive';
import archive from '../../../../src/session/archive';
import restoringHook from './$hook_session.restoring';
import runHooks from '../../../../src/procs/hooks/run';
import deleteSession from '../../../../src/session/delete';
const names=['cleanupArchivedAgent','commentPath','commentOutdated','ownedItem','commentLines','commentView','commentsChanged','commentMutate','commentCreate','commentUpdate','commentDelete','commentResolve','commentReopen','commentsList','handle','commentsSend','commentToolTarget','gitReviewComments','gitResolveComment'];
async function fixture(){
 const dbctx=await testCtx();const db=dbctx.fns.procs.db;
 await migration.up(dbctx);
 await db.run({sql:"INSERT INTO agents(id,model,created_at,updated_at) VALUES ('review-a','test',1,1),('review-b','test',1,1)"});
 const events:any[]=[];let calls=0;let closed=false;
 const ctx:any={fns:{procs:{db,events:{emit:({event}:any)=>events.push(event)}},canvas:{list:async({agentId}:any)=>closed?[]:[{id:agentId==='review-a'?1:2,kind:'gitUi.repository',args:{host:'local',dir:'/fixture'}}],authorizeHttp:async()=>null,show:async()=>({id:1})},auth:{verifyCsrf:async()=>true},gitUi:{snapshot:async()=>({files:[{path:'a',group:'unstaged'}]}),commit:async()=>({files:[{path:'a'}]}),checkPath:async({path}:any)=>{if(typeof path!=='string'||path.includes('..'))throw new Error('Invalid path');},diff:async()=>{calls++;return {patch:'@@ -1,2 +1,2 @@\n-old\n+new\n context\n',state:'ok'};}}}};
 ctx.state={agent:{},procs:{hooks:{points:{'session.archived':{},'session.restoring':{}},handlers:{'session.archived':new Map([['git',archiveHook]]),'session.restoring':new Map([['git',restoringHook]])}}}};
 ctx.fns.procs.hooks={run:(opts:any)=>runHooks(ctx,null,opts)};
 ctx.fns.procs.log={warn:()=>{}};
 ctx.fns.events={emitAgentsChanged:async()=>{}};
 ctx.fns.session={appendUserMessage:(opts:any)=>dbctx.fns.session.appendUserMessage(opts)};
 ctx.fns.agent={current:async()=>({id:'review-a'}),wakeWorker:()=>{}};
 ctx.fns.workspace={get:()=>({agentId:'review-a',host:'',dir:'/fixture'})};
 ctx.fns.procs.events.refresh=()=>{};
 for(const name of names){const fn=(await import('./'+name+'.ts')).default;ctx.fns.gitUi[name]=(opts:any)=>fn(ctx,null,opts);}
 return {ctx,db,dbctx,events,calls:()=>calls,close:()=>{closed=true;},target:{agentId:'review-a',itemId:1},anchor:{scope:'worktree',commit_hash:null,worktree_group:'unstaged',path:'a',old_path:null,side:'new',line_start:1,line_end:1,line_text:'new'}};
}
test('exact IDs intersect ownership and filters, preserve paging and require an open workspace tab',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;const ids:string[]=[];
 for(let i=0;i<12;i++)ids.push((await g.commentCreate({...f.target,anchor:f.anchor,body:'selected '+i})).comment.id);
 const unrelated=(await g.commentCreate({...f.target,anchor:f.anchor,body:'unrelated'})).comment.id;
 const foreign=(await g.commentCreate({agentId:'review-b',itemId:2,anchor:f.anchor,body:'private'})).comment.id;
 await g.commentResolve({...f.target,id:ids[0]});
 const requested=[...ids,ids[0].toUpperCase(),foreign,Bun.randomUUIDv7()];
 const first=await g.gitReviewComments({ids:requested,status:'all'});
 const second=await g.gitReviewComments({ids:requested,status:'all',page:first.nextPage});
 expect(first.comments).toHaveLength(10);expect(first.nextPage).toBe(1);expect(second.nextPage).toBeNull();
 expect([...first.comments,...second.comments].map((c:any)=>c.id).sort()).toEqual([...ids].sort());
 expect(first.openCount).toBe(12);expect(first.unsentCount).toBe(12);
 expect((await g.commentsList({...f.target,ids:requested,status:'resolved'})).comments.map((c:any)=>c.id)).toEqual([ids[0]]);
 expect((await g.commentsList({...f.target,ids:requested})).comments).toHaveLength(11);
 expect((await g.commentsList({...f.target,ids:requested,status:'all',path:'missing'})).comments).toEqual([]);
 expect((await g.commentsList({...f.target,ids:[]})).comments).toEqual([]);
 expect((await g.gitReviewComments({ids:[],status:'all'})).nextPage).toBeNull();
 expect((await g.commentsList({...f.target,status:'all'})).comments.map((c:any)=>c.id)).toContain(unrelated);
 for(const invalid of [null,'all',[null],['bad'],[1],Array(501).fill(ids[0])])await expect(g.commentsList({...f.target,ids:invalid})).rejects.toThrow('Invalid comment IDs');
 await g.commentDelete({...f.target,id:ids[1]});
 expect((await g.gitReviewComments({ids:[ids[1],foreign],status:'all'})).comments).toEqual([]);
 f.ctx.fns.workspace.get=()=>({agentId:'review-a',host:'',dir:'/other'});
 await expect(g.gitReviewComments({ids})).rejects.toThrow('workspace Git tab');
 f.ctx.fns.workspace.get=()=>({agentId:'review-a',host:'',dir:'/fixture'});f.close();
 await expect(g.gitReviewComments({ids:[]})).rejects.toThrow('workspace Git tab');
 await expect(g.commentsList({...f.target,ids:[]})).rejects.toThrow('unavailable');
});
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
test('HTTP permission and CSRF matrix rejects every comment operation without mutations or events',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;
 const {comment:c}=await g.commentCreate({...f.target,anchor:f.anchor,body:'keep'});
 const operations=['comments','commentCreate','commentUpdate','commentDelete','commentResolve','commentReopen','commentsSend'];
 const request=(op:string)=>new Request(`http://localhost/gitUi?agentId=review-a&itemId=1&op=${op}`,op==='comments'?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:c.id,anchor:f.anchor,body:'changed',note:'done'})});
 for(const guard of ['csrf','foreign','archived','closed']){
  f.ctx.fns.auth.verifyCsrf=async()=>guard!=='csrf';
  f.ctx.fns.canvas.authorizeHttp=async()=>guard==='foreign'?new Response(null,{status:403}):null;
  await f.db.run({sql:'UPDATE agents SET archived_at=? WHERE id=?',params:[guard==='archived'?1:null,'review-a']});
  if(guard==='closed')f.close();
  f.events.length=0;
  for(const op of operations){
   if(guard==='csrf'&&op==='comments')continue;
   const response=await g.handle({req:request(op)});
   expect(response.status).toBe(403);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.json()).toHaveProperty('error');
  }
  const rows=await f.db.select({sql:'SELECT body,status,sent_at FROM git_review_comments WHERE id=?',params:[c.id]});
  expect(rows).toEqual([{body:'keep',status:'open',sent_at:null}]);expect(f.events).toHaveLength(0);
 }
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
 const response=await g.handle({req:new Request('http://localhost/gitUi?agentId=review-a&itemId=1&op=commentCreate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({anchor:f.anchor,body:'overflow'})})});
 expect(response.status).toBe(409);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.json()).toHaveProperty('error');
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

test('delivery commits transcript, scheduling and receipts once under concurrent sends; reopen resends',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;const {comment:c}=await g.commentCreate({...f.target,anchor:f.anchor,body:'fix this'});
 const results=await Promise.all([g.commentsSend(f.target),g.commentsSend(f.target)]);expect(results.map(r=>r.sent).sort()).toEqual([0,1]);
 const messages=await f.db.select({sql:"SELECT * FROM messages WHERE agent_id='review-a' AND message_type='git_review_comments'"});expect(messages).toHaveLength(1);expect(messages[0].role).toBe('user');expect(messages[0].content).toContain('Git review comments for local:/fixture (1)');expect(messages[0].content).toContain(c.id);expect(messages[0].content).toContain('   > new');
 expect((await f.db.select({sql:"SELECT next_run_at FROM agents WHERE id='review-a'"}))[0].next_run_at).not.toBeNull();
 expect((await g.commentsList(f.target)).comments[0].sent_at).not.toBeNull();expect(await g.commentsSend(f.target)).toEqual({sent:0});
 await g.gitResolveComment({id:c.id,note:'fixed'});const reopened=(await g.commentReopen({...f.target,id:c.id})).comment;for(const key of ['sent_at','resolved_at','resolved_by','resolution_note'])expect(reopened[key]).toBeNull();expect(await g.commentsSend(f.target)).toEqual({sent:1});
});
test('delivery rolls back appended message, event, schedule and receipts after late failure',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;await g.commentCreate({...f.target,anchor:f.anchor,body:'retry'});
 await f.db.exec({sql:"CREATE FUNCTION reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.sent_at IS NOT NULL THEN RAISE EXCEPTION 'receipt failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_receipt BEFORE UPDATE ON git_review_comments FOR EACH ROW EXECUTE FUNCTION reject_receipt()"});
 await expect(g.commentsSend(f.target)).rejects.toThrow('receipt failure');expect(await f.db.select({sql:'SELECT * FROM messages'})).toHaveLength(0);expect(await f.db.select({sql:'SELECT * FROM events'})).toHaveLength(0);expect((await f.db.select({sql:"SELECT next_run_at FROM agents WHERE id='review-a'"}))[0].next_run_at).toBeNull();expect((await g.commentsList(f.target)).comments[0].sent_at).toBeNull();
 await f.db.exec({sql:'DROP TRIGGER reject_receipt ON git_review_comments'});expect(await g.commentsSend(f.target)).toEqual({sent:1});
});
test('review tools enforce caller, workspace, open tab and foreign comment isolation with bounded pages',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;for(let i=0;i<11;i++)await g.commentCreate({...f.target,anchor:f.anchor,body:'review'});
 await expect(g.gitReviewComments({page:-1})).rejects.toThrow('pagination');
 const first=await g.gitReviewComments({});expect(first.comments).toHaveLength(10);expect(first.nextPage).toBe(1);expect((await g.gitReviewComments({page:1})).comments).toHaveLength(1);
 const other=(await g.commentCreate({agentId:'review-b',itemId:2,anchor:f.anchor,body:'private'})).comment;await expect(g.gitResolveComment({id:other.id})).rejects.toThrow('not found');
 const own=first.comments[0];expect((await g.gitResolveComment({id:own.id,note:'done'})).comment.resolved_by).toBe('agent');expect((await g.gitResolveComment({id:own.id,note:'changed'})).comment.resolution_note).toBe('done');
 f.ctx.fns.workspace.get=()=>({agentId:'review-a',host:'ssh-other',dir:'/fixture'});await expect(g.gitReviewComments({})).rejects.toThrow('workspace Git tab');f.ctx.fns.workspace.get=()=>({agentId:'review-b',host:'',dir:'/fixture'});await expect(g.gitReviewComments({})).rejects.toThrow('Calling workspace');f.ctx.fns.workspace.get=()=>({agentId:'review-a',host:'',dir:'/fixture'});f.close();await expect(g.gitReviewComments({})).rejects.toThrow('workspace Git tab');await expect(g.commentsSend(f.target)).rejects.toThrow('unavailable');
});


test('native review schemas reject injected identities and malformed arguments; dispatch resolves registered functions',async()=>{
 const ctx=await testCtx();
 const loader=(await import('../../../../src/tools/$loader_tool')).default;
 await loader(ctx,null,{entries:['gitReviewComments','gitResolveComment'].map(name=>({name,moduleDir:'gitUi',fileName:'$tool_'+name+'.md',rel:'gitUi/$tool_'+name+'.md',abs:import.meta.dir+'/$tool_'+name+'.md'}))});
 // testCtx loads core only: install the plugin handlers explicitly for native dispatch.
 (ctx.fns as any).gitUi={};for(const name of ['commentToolTarget','gitReviewComments','gitResolveComment']){const fn=(await import('./'+name+'.ts')).default;(ctx.fns as any).gitUi[name]=(opts:any)=>fn(ctx,null,opts);}
 const tools=ctx.fns.tools.list({});
 for(const name of ['gitReviewComments','gitResolveComment']){
  const tool=tools.find((t:any)=>t.wireName===name)!;expect(tool).toBeDefined();expect(tool.parameters.additionalProperties).toBe(false);expect(tool.fn).toBe('gitUi.'+name);
  const args=name==='gitResolveComment'?{id:Bun.randomUUIDv7()}:{};
  expect(ctx.fns.tools.validate({schema:tool.parameters,args}).ok).toBe(true);
  for(const extra of ['agentId','itemId','host','dir','resolvedBy'])expect(ctx.fns.tools.validate({schema:tool.parameters,args:{...args,[extra]:'foreign'}}).ok).toBe(false);
  const rejected=await ctx.fns.tools.call({name,args:{...args,agentId:'foreign'}});expect(rejected.handlerExecuted).toBe(false);expect(rejected.isError).toBe(true);
  const result=await ctx.fns.tools.call({name,args});expect(result.handlerExecuted).toBe(true);expect(result.isError).toBe(true);expect(result.output).toContain('no agent');
 }
 const schema=tools.find((t:any)=>t.wireName==='gitReviewComments')!.parameters;
 // Generic validation handles types, not pattern/maxItems/null. The runtime test above enforces these bounds.
 expect(schema.properties.ids.maxItems).toBe(500);
 const uuidPattern=new RegExp(schema.properties.ids.items.pattern);
 expect(uuidPattern.test(Bun.randomUUIDv7())).toBe(true);expect(uuidPattern.test('bad')).toBe(false);
 expect(ctx.fns.tools.validate({schema,args:{ids:[]}}).ok).toBe(true);
 for(const args of [{page:0.5},{status:'bad'},{ids:'bad'},{ids:[1]}])expect(ctx.fns.tools.validate({schema,args}).ok).toBe(false);
});
test('send HTTP uses authorized target and CSRF; append failure leaves unsent rows',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;await g.commentCreate({...f.target,anchor:f.anchor,body:'review'});
 const request=()=>new Request('http://localhost/gitUi?agentId=review-a&itemId=1&op=commentsSend',{method:'POST',body:'{}'});
 f.ctx.fns.auth.verifyCsrf=async()=>false;expect((await g.handle({req:request()})).status).toBe(403);f.ctx.fns.auth.verifyCsrf=async()=>true;
 const append=f.ctx.fns.session.appendUserMessage;f.ctx.fns.session.appendUserMessage=async()=>{throw new Error('append failed');};await expect(g.commentsSend(f.target)).rejects.toThrow('append failed');expect((await g.commentsList(f.target)).unsentCount).toBe(1);f.ctx.fns.session.appendUserMessage=append;
 const response=await g.handle({req:request()});expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.json()).toEqual({sent:1});
});


test('archive cleanup removes both statuses, deduplicates repository events and preserves foreign agents; restore cannot revive rows',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;
 const a=await g.commentCreate({...f.target,anchor:f.anchor,body:'open'});
 const b=await g.commentCreate({...f.target,anchor:f.anchor,body:'resolved'});await g.commentResolve({...f.target,id:b.comment.id});
 const c=await g.commentCreate({...f.target,anchor:f.anchor,body:'other repository'});
 await f.db.run({sql:'UPDATE git_review_comments SET host=?,dir=? WHERE id=?',params:['remote','/elsewhere',c.comment.id]});
 const foreign=await g.commentCreate({agentId:'review-b',itemId:2,anchor:f.anchor,body:'foreign'});
 await f.db.run({sql:'UPDATE agents SET archived_at=1 WHERE id=?',params:['review-a']});f.events.length=0;
 await archiveHook(f.ctx,null,{agentId:'review-a'});
 expect((await f.db.select({sql:'SELECT id FROM git_review_comments'})).map((r:any)=>r.id)).toEqual([foreign.comment.id]);
 expect(f.events).toHaveLength(2);expect(new Set(f.events.map(e=>e.key)).size).toBe(2);
 expect(f.events.every(e=>e.type==='gitUi.comments.changed')).toBe(true);
 await archiveHook(f.ctx,null,{agentId:'review-a'});expect(f.events).toHaveLength(2);
 f.ctx.fns.events={emitAgentsChanged:async()=>{}};
 expect(await unarchive(f.ctx,null,{id:'review-a'})).toEqual({ok:true});
 expect((await g.commentsList({...f.target,status:'all'})).comments).toEqual([]);
 expect((await g.commentsList({agentId:'review-b',itemId:2})).comments[0].id).toBe(foreign.comment.id);
});

test('sweep repairs missed hooks for both statuses and only archived agents; session delete cascades FK',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;
 await g.commentCreate({...f.target,anchor:f.anchor,body:'open'});
 const b=await g.commentCreate({...f.target,anchor:f.anchor,body:'resolved'});await g.commentResolve({...f.target,id:b.comment.id});
 const foreign=await g.commentCreate({agentId:'review-b',itemId:2,anchor:f.anchor,body:'foreign'});
 await f.db.run({sql:'UPDATE agents SET archived_at=1 WHERE id=?',params:['review-a']});f.events.length=0;
 expect(await sweepArchived(f.ctx,null,{})).toEqual({deleted:2});expect(f.events).toHaveLength(1);
 expect(await sweepArchived(f.ctx,null,{})).toEqual({deleted:0});expect(f.events).toHaveLength(1);
 expect((await f.db.select({sql:'SELECT id FROM git_review_comments'}))[0].id).toBe(foreign.comment.id);
 f.ctx.fns.events={emitAgentsChanged:async()=>{}};f.ctx.fns.attachments={gc:async()=>{}};
 expect(await deleteSession(f.ctx,null,{id:'review-b'})).toEqual({ok:true});
 expect(await f.db.select({sql:'SELECT id FROM git_review_comments'})).toEqual([]);
});

for (const missed of [false,true]) test(`${missed?'missed':'failed'} archive cleanup cannot expose comments on early restore`,async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;
 await g.commentCreate({...f.target,anchor:f.anchor,body:'open'});
 const resolved=await g.commentCreate({...f.target,anchor:f.anchor,body:'resolved'});
 await g.commentResolve({...f.target,id:resolved.comment.id});
 const cleanup=g.cleanupArchivedAgent;
 g.cleanupArchivedAgent=async()=>{throw new Error('cleanup unavailable');};
 if(missed) await f.db.run({sql:'UPDATE agents SET archived_at=1 WHERE id=?',params:['review-a']});
 else expect(await archive(f.ctx,null,{id:'review-a'})).toEqual({ok:true});
 expect((await f.db.select({sql:'SELECT id FROM git_review_comments'}))).toHaveLength(2);
 await expect(unarchive(f.ctx,null,{id:'review-a'})).rejects.toThrow('handler(s) failed');
 expect((await f.db.select({sql:'SELECT archived_at FROM agents WHERE id=?',params:['review-a']}))[0].archived_at).not.toBeNull();
 await expect(g.commentsList(f.target)).rejects.toThrow('unavailable');
 g.cleanupArchivedAgent=cleanup;
 expect(await unarchive(f.ctx,null,{id:'review-a'})).toEqual({ok:true});
 expect(await f.db.select({sql:'SELECT id FROM git_review_comments'})).toEqual([]);
 expect((await g.commentsList({...f.target,status:'all'})).comments).toEqual([]);
});

function gate() {
 let release!: () => void;
 const wait = new Promise<void>(resolve => { release = resolve; });
 return { wait, release };
}

for (const source of ['archive', 'restore', 'sweep'] as const) test(`late ${source} cleanup cannot delete a post-restore comment (Postgres gated interleaving)`, async () => {
 const f=await fixture(),g=f.ctx.fns.gitUi;
 await g.commentCreate({...f.target,anchor:f.anchor,body:'old open'});
 const old=await g.commentCreate({...f.target,anchor:f.anchor,body:'old resolved'});
 await g.commentResolve({...f.target,id:old.comment.id});
 const pool=new SQL(f.db.url({}),{max:3,prepare:false});
 const originalPool=f.dbctx.state.procs.db.sql;
 f.dbctx.state.procs.db.sql=pool;
 const entered=gate(),resume=gate();
 let pending:Promise<any>;
 if(source==='archive') {
  f.ctx.state.procs.hooks.handlers['session.archived']=new Map([
   ['gate',async()=>{entered.release();await resume.wait;}],['git',archiveHook],
  ]);
  pending=archive(f.ctx,null,{id:'review-a'});
 } else {
  await f.db.run({sql:'UPDATE agents SET archived_at=1 WHERE id=?',params:['review-a']});
  // Distinct async transaction scopes reserve distinct real PostgreSQL connections.
  const delayedCtx={...f.ctx,fns:{...f.ctx.fns,procs:{...f.ctx.fns.procs,db:{...f.db,select:async(opts:any)=>{
   if(source==='restore' && opts.sql.includes('FROM agents WHERE id = ? FOR UPDATE')) {
    entered.release();await resume.wait;
   }
   const rows=await f.db.select(opts);
   if(source==='sweep' && opts.sql.includes('ORDER BY id')) {entered.release();await resume.wait;}
   return rows;
  }}}}};
  pending=source==='restore'?unarchive(delayedCtx,null,{id:'review-a'}):sweepArchived(delayedCtx,null,{});
 }
 try {
  await entered.wait;
  expect(await unarchive(f.ctx,null,{id:'review-a'})).toEqual({ok:true});
  expect(await f.db.select({sql:'SELECT id FROM git_review_comments'})).toEqual([]);
  const fresh=await g.commentCreate({...f.target,anchor:f.anchor,body:'post restore'});
  resume.release();await pending;
  expect((await f.db.select({sql:'SELECT id FROM git_review_comments'})).map((r:any)=>r.id)).toEqual([fresh.comment.id]);
 } finally {resume.release();await pending;f.dbctx.state.procs.db.sql=originalPool;await pool.close();}
});

test('restore cleanup rolls back both statuses and notifications when a later handler fails',async()=>{
 const f=await fixture(),g=f.ctx.fns.gitUi;
 await g.commentCreate({...f.target,anchor:f.anchor,body:'open'});
 const old=await g.commentCreate({...f.target,anchor:f.anchor,body:'resolved'});
 await g.commentResolve({...f.target,id:old.comment.id});
 await f.db.run({sql:'UPDATE agents SET archived_at=1 WHERE id=?',params:['review-a']});
 f.events.length=0;
 f.ctx.state.procs.hooks.handlers['session.restoring'].set('failure',async()=>{throw new Error('late failure');});
 await expect(unarchive(f.ctx,null,{id:'review-a'})).rejects.toThrow('handler(s) failed');
 expect((await f.db.select({sql:'SELECT archived_at FROM agents WHERE id=?',params:['review-a']}))[0].archived_at).not.toBeNull();
 expect(await f.db.select({sql:'SELECT id FROM git_review_comments'})).toHaveLength(2);
 expect(f.events).toHaveLength(0);
 f.ctx.state.procs.hooks.handlers['session.restoring'].delete('failure');
 await unarchive(f.ctx,null,{id:'review-a'});
 expect(await f.db.select({sql:'SELECT id FROM git_review_comments'})).toEqual([]);
 expect(f.events).toHaveLength(1);
});
