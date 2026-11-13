import {test,expect} from 'bun:test';
import {mkTestCtx} from '../../../../src/_testCtx.entry';
import {reqCtx} from '../../../../src/$test';
import handle from './handle';
import repositoryKind from './$canvas_repository';

// One-step launcher endpoint against the real canvas.show/locked/list on the test database.
async function fixture(){
 const ctx:any=await mkTestCtx();const r:any=reqCtx(ctx);
 ctx.state.canvas??={};ctx.state.canvas.kinds??={};
 ctx.state.canvas.kinds['gitUi.repository']={...repositoryKind,name:'gitUi.repository',module:'gitUi',rel:'gitUi/$canvas_repository.ts'};
 const agent=async(dir:string,host:string)=>{const a=await r.fns.agent.start({model:'mock:echo'});await r.fns.session.save({agent:a});
  await ctx.fns.procs.db.run({sql:'UPDATE agents SET workspace_dir=?, workspace_host=? WHERE id=?',params:[dir,host,a.id]});return a.id as string;};
 const token=await ctx.fns.auth.csrfToken({req:new Request('http://localhost/')});
 const post=(agentId:string,csrf=token)=>handle(ctx,null,{req:new Request('http://localhost/gitUi?agentId='+encodeURIComponent(agentId),{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:'{}'})});
 const items=async(agentId:string)=>(await ctx.fns.canvas.list({agentId})).map((i:any)=>({id:i.id,kind:i.kind,args:i.args,active:i.active}));
 return {ctx,agent,post,items};
}

test('first launch returns the final pinned repository item; repeat and concurrent launches reuse it',async()=>{
 const f=await fixture();const a=await f.agent('/srv/project-a','local');
 const other=await f.ctx.fns.canvas.show({agentId:a,kind:'html',title:'Unrelated',args:{html:'<p>x</p>'}});
 const first=await f.post(a);expect(first.status).toBe(200);
 const item=await first.json() as any;
 expect(item).toMatchObject({kind:'gitUi.repository',args:{dir:'/srv/project-a',host:'local'},title:'Git · project-a',active:true});
 expect(Number.isSafeInteger(item.id)).toBe(true);
 const again=await (await f.post(a)).json() as any;expect(again.id).toBe(item.id);
 const concurrent=await Promise.all(Array.from({length:6},()=>f.post(a).then(r=>r.json() as any)));
 expect(new Set(concurrent.map(i=>i.id))).toEqual(new Set([item.id]));
 const tabs=await f.items(a);
 expect(tabs.filter((t:any)=>t.kind==='gitUi.repository')).toEqual([{id:item.id,kind:'gitUi.repository',args:{dir:'/srv/project-a',host:'local'},active:true}]);
 // The unrelated tab stays open; no launcher placeholder kind exists.
 expect(tabs.map((t:any)=>t.id).sort()).toEqual([other.id,item.id].sort());
});

test('SSH target identity is pinned per host and directory, never falling back to local',async()=>{
 const f=await fixture();const a=await f.agent('/home/dev/app','dev-box');
 const ssh=await (await f.post(a)).json() as any;
 expect(ssh.args).toEqual({dir:'/home/dev/app',host:'dev-box'});
 // Changing the chat workspace opens a second, distinct target and leaves the first tab untouched.
 await f.ctx.fns.procs.db.run({sql:'UPDATE agents SET workspace_dir=?, workspace_host=? WHERE id=?',params:['/home/dev/app','local',a]});
 const local=await (await f.post(a)).json() as any;
 expect(local.id).not.toBe(ssh.id);expect(local.args).toEqual({dir:'/home/dev/app',host:'local'});
 const repos=(await f.items(a)).filter((t:any)=>t.kind==='gitUi.repository');
 expect(repos.map((t:any)=>t.args.host).sort()).toEqual(['dev-box','local']);
 // Same host+dir on another agent is that agent's own item, never shared.
 const b=await f.agent('/home/dev/app','dev-box');const own=await (await f.post(b)).json() as any;
 expect(own.id).not.toBe(ssh.id);expect(await f.items(a)).toHaveLength(2);
});

test('opening errors create no item and close nothing',async()=>{
 const f=await fixture();const a=await f.agent('/srv/keep','local');
 const kept=await (await f.post(a)).json() as any;
 const before=await f.items(a);
 expect((await f.post(a,'wrong-token')).status).toBe(403);
 // An invalid pinned target fails in prepare without a fallback directory or host.
 await f.ctx.fns.procs.db.run({sql:'UPDATE agents SET workspace_dir=?, workspace_host=? WHERE id=?',params:['relative/dir','local',a]});
 const bad=await f.post(a);expect(bad.status).toBe(400);expect(await bad.json()).toEqual({error:'Invalid pinned repository'});
 await f.ctx.fns.procs.db.run({sql:'UPDATE agents SET workspace_dir=?, workspace_host=? WHERE id=?',params:['/srv/x','bad host;rm',a]});
 expect((await f.post(a)).status).toBe(400);
 expect((await f.post('missing-agent')).status).toBe(404);
 expect(await f.items(a)).toEqual(before);expect(before.map((t:any)=>t.id)).toEqual([kept.id]);
});
