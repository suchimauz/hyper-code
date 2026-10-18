import {describe,test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';

// Isolated SQL fixture: exercises real project procedures, no live agents or model calls.
async function mkTestCtx() {
 const db=new Database(':memory:');
 db.exec(`CREATE TABLE projects(id TEXT PRIMARY KEY,host TEXT,dir TEXT,title TEXT,created_at INTEGER,UNIQUE(host,dir));CREATE TABLE project_members(principal TEXT,project_id TEXT,title TEXT,archived_at INTEGER,PRIMARY KEY(principal,project_id));CREATE TABLE project_tabs(principal TEXT,project_id TEXT,tab_ids TEXT DEFAULT '[]',active_id TEXT,revision INTEGER DEFAULT 0,PRIMARY KEY(principal,project_id));CREATE TABLE agents(id TEXT,title TEXT,model TEXT,icon TEXT,run_state TEXT,workspace_dir TEXT,workspace_host TEXT,archived_at INTEGER,created_at INTEGER,visibility TEXT,last_notifiable_at INTEGER);CREATE TABLE user_agent_state(user_id TEXT,agent_id TEXT,seen_at INTEGER,PRIMARY KEY(user_id,agent_id));CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE messages(agent_id TEXT,idx INTEGER,ts INTEGER);`);
 const registry:any={auth:{viewerId:async()=>null,listUsers:async()=>[]},projects:{},workspace:{},agent:{},settings:{modelDefault:async()=> 'mock:echo'},procs:{db:{
 select:async(_c:any,_s:any,o:any)=>db.query(o.sql.replaceAll('::jsonb','')).all(...o.params).map((r:any)=>r.tab_ids?{...r,tab_ids:JSON.parse(r.tab_ids)}:r),
 run:async(_c:any,_s:any,o:any)=>db.query(o.sql.replaceAll('::jsonb','')).run(...o.params),
 },events:{emit:()=>{}}}};
 const ctx:any={state:{registry}};
 const proxy=(r:any):any=>new Proxy({}, {get:(_t,k:string)=> typeof r[k]==='function' ? (o:any)=>r[k](ctx,null,o) : proxy(r[k])});
 ctx.fns=proxy(registry);
 for(const name of ['identity','list','get','create','materialize','setArchived','chats','tabs','updateTabs','open','closeTab','reorder','createChat','resolve'])registry.projects[name]=(await import('./'+name+'.ts')).default;
 return ctx;
}

async function fixture() {
 const ctx=await mkTestCtx();
 let principal='user:alice';
 ctx.state.registry.auth.viewerId=async()=>principal.startsWith('user:')?principal.slice(5):null;
 ctx.state.registry.projects.principal=async()=>principal;
 ctx.state.registry.workspace.normalize=async (_c:unknown,_s:unknown,o:{dir:string})=>o.dir;
 return {ctx,as:(value:string)=>{principal=value;}};
}

describe('projects persistent backend',()=>{
 test('project archive is personal, preserves agents and tabs, and newer nav creation reactivates exact workspace',async()=>{
  const {ctx,as}=await fixture();
  await ctx.fns.procs.db.run({sql:"INSERT INTO agents(id,workspace_dir,visibility,run_state,created_at) VALUES('a','/archive','nav','calling',1)",params:[]});
  const id=(await ctx.fns.projects.identity({dir:'/archive'})).id;
  await ctx.fns.projects.open({projectId:id,agentId:'a'});
  const agents=await ctx.fns.procs.db.select({sql:'SELECT * FROM agents',params:[]});
  const tabs=await ctx.fns.projects.tabs({projectId:id});
  await ctx.fns.projects.setArchived({projectId:id,archived:true});
  expect((await ctx.fns.projects.get({projectId:id})).archived).toBe(true);
  expect(await ctx.fns.projects.tabs({projectId:id})).toEqual(tabs);
  expect(await ctx.fns.procs.db.select({sql:'SELECT * FROM agents',params:[]})).toEqual(agents);
  as('user:bob');expect((await ctx.fns.projects.get({projectId:id})).archived).not.toBe(true);as('user:alice');
  await ctx.fns.projects.setArchived({projectId:id,archived:false});expect((await ctx.fns.projects.get({projectId:id})).archived).toBe(false);
  await ctx.fns.projects.setArchived({projectId:id,archived:true});
  const after=Date.now()+100;
  for(const [aid,dir,host,visibility] of [['team','/archive','','team'],['hidden','/archive','','hidden'],['sub','/archive/sub','','nav'],['remote','/archive','ssh','nav']])await ctx.fns.procs.db.run({sql:'INSERT INTO agents(id,workspace_dir,workspace_host,visibility,created_at) VALUES(?,?,?,?,?)',params:[aid,dir,host,visibility,after]});
  expect((await ctx.fns.projects.get({projectId:id})).archived).toBe(true);
  await ctx.fns.procs.db.run({sql:"INSERT INTO agents(id,workspace_dir,visibility,created_at) VALUES('new','/archive/','nav',?)",params:[after]});
  expect((await ctx.fns.projects.get({projectId:id})).archived).toBe(false);
  await expect(ctx.fns.projects.setArchived({projectId:'missing',archived:true})).rejects.toThrow('Project not found');
 });
 test('principal denies background and anonymous multiuser; validates zero-user HTTP',async()=>{
  const principal=(await import('./principal')).default;
  const ctx:any={fns:{auth:{viewerId:async()=>null,listUsers:async()=>[],currentUser:async()=>({user:null,required:false})}}};
  await expect(principal(ctx,null,{})).rejects.toThrow();
  expect(await principal(ctx,{req:new Request('http://localhost/')},{})).toBe('instance:legacy');
  ctx.fns.auth.listUsers=async()=>[{id:'someone'}];
  await expect(principal(ctx,{req:new Request('http://localhost/')},{})).rejects.toThrow();
  ctx.fns.auth.viewerId=async()=> 'alice';
  expect(await principal(ctx,null,{})).toBe('user:alice');
 });
 test('identity is lexical exact host and directory; rejects relative',async()=>{
  const {ctx}=await fixture();
  const a=await ctx.fns.projects.identity({dir:'/work/a/../b/',host:' local '});
  expect(a).toEqual(await ctx.fns.projects.identity({dir:'/work/b'}));
  expect(a.id).not.toBe((await ctx.fns.projects.identity({dir:'/work/b',host:'remote'})).id);
  expect(a.id).not.toBe((await ctx.fns.projects.identity({dir:'/work/b/sub'})).id);
  await expect(ctx.fns.projects.identity({dir:'relative'})).rejects.toThrow();
 });
 test('discovery exceeds 500 and shared chats remain visible without writes',async()=>{
  const {ctx,as}=await fixture();
  for(let i=0;i<505;i++)await ctx.fns.procs.db.run({sql:'INSERT INTO agents(id,workspace_dir,workspace_host,visibility,created_at) VALUES(?,?,?,?,?)',params:['fixture'+i,'/legacy/'+i,'','nav',i]});
  await ctx.fns.procs.db.run({sql:'INSERT INTO agents(id,workspace_dir,visibility) VALUES(?,?,?)',params:['unassigned',null,'nav']});
  const all=await ctx.fns.projects.list({});
  expect(all.length).toBe(505);
  expect(all.every((p:any)=>p.virtual)).toBe(true);
  as('user:bob');
  expect((await ctx.fns.projects.list({})).length).toBe(505);
  expect(await ctx.fns.procs.db.select({sql:'SELECT * FROM projects',params:[]})).toEqual([]);
  const p=await ctx.fns.projects.resolve({agentId:'fixture1'});
  expect(p.dir).toBe('/legacy/1');
  expect(await ctx.fns.projects.resolve({agentId:'unassigned'})).toBeNull();
 });
 test('empty projects and custom titles isolated between viewers',async()=>{
  const {ctx,as}=await fixture();
  const p=await ctx.fns.projects.create({dir:'/isolated/project',title:'Alice private'});
  expect((await ctx.fns.projects.list({})).some((x:any)=>x.id===p.id)).toBe(true);
  as('user:bob');
  expect(await ctx.fns.projects.get({projectId:p.id})).toBeNull();
  await expect(ctx.fns.projects.open({projectId:p.id})).rejects.toThrow();
  const bob=await ctx.fns.projects.create({dir:'/isolated/project',title:'Bob title'});
  expect(bob.id).toBe(p.id);
  as('user:alice');
  expect((await ctx.fns.projects.get({projectId:p.id})).title).toBe('Alice private');
 });
 test('tabs CAS preserves competing opens, personal selection, order and close only',async()=>{
  const {ctx,as}=await fixture();
  const p=await ctx.fns.projects.create({dir:'/isolated/tabs'});
  ctx.state.registry.projects.chats=async()=>['a','b','c'].map(id=>({id}));
  await Promise.all(['a','b','c'].map(agentId=>ctx.fns.projects.open({projectId:p.id,agentId})));
  const state=await ctx.fns.projects.tabs({projectId:p.id});
  expect([...state.tabIds].sort()).toEqual(['a','b','c']);
  await ctx.fns.projects.reorder({projectId:p.id,tabIds:['c','b','a']});
  await ctx.fns.projects.open({projectId:p.id,agentId:'b'});
  expect((await ctx.fns.projects.closeTab({projectId:p.id,agentId:'b'})).activeId).toBe('c');
  expect((await ctx.fns.projects.tabs({projectId:p.id})).tabIds).toEqual(['c','a']);
  as('user:bob');
  await ctx.fns.projects.create({dir:'/isolated/tabs'});
  expect((await ctx.fns.projects.tabs({projectId:p.id})).tabIds).toEqual([]);
  as('user:alice');
  expect((await ctx.fns.projects.tabs({projectId:p.id})).tabIds).toEqual(['c','a']);
 });
 test('archive/move filtering is read-only and restored ID can reopen',async()=>{
  const {ctx}=await fixture();
  const p=await ctx.fns.projects.create({dir:'/isolated/filter'});
  let available=['a','b'];
  ctx.state.registry.projects.chats=async()=>available.map(id=>({id}));
  await ctx.fns.projects.open({projectId:p.id,agentId:'a'});
  await ctx.fns.projects.open({projectId:p.id,agentId:'b'});
  available=['a'];
  const filtered=await ctx.fns.projects.tabs({projectId:p.id});
  expect(filtered.tabIds).toEqual(['a']);expect(filtered.activeId).toBe('a');
  available=['a','b'];
  expect((await ctx.fns.projects.open({projectId:p.id,agentId:'b'})).activeId).toBe('b');
 });
 test('custom icons are returned for both active and archived project chats',async()=>{
  const {ctx}=await fixture();const svg='<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  for(const archived of [false,true])await ctx.fns.procs.db.run({sql:'INSERT INTO agents(id,workspace_dir,visibility,icon,archived_at) VALUES(?,?,?,?,?)',params:[archived?'archived-icon':'active-icon','/icons','nav',svg,archived?1:null]});
  const projectId=(await ctx.fns.projects.identity({dir:'/icons'})).id;
  for(const archived of [false,true])expect(await ctx.fns.projects.chats({projectId,archived})).toMatchObject([{id:archived?'archived-icon':'active-icon',icon:svg}]);
 });
 test('native counts and unread are exact, active-only and viewer-specific',async()=>{
  const {ctx,as}=await fixture();
  for(const [id,dir,host,visibility,archived,run] of [
   ['a','/counts/','','nav',null,'calling'],['b','/counts','','nav',null,'idle'],
   ['team','/counts','','team',null,'calling'],['hidden','/counts','','hidden',null,'calling'],
   ['old','/counts','','nav',1,'calling'],['sub','/counts/sub','','nav',null,'calling'],
   ['remote','/counts','ssh','nav',null,'calling']]) {
   await ctx.fns.procs.db.run({sql:'INSERT INTO agents(id,workspace_dir,workspace_host,visibility,archived_at,run_state,last_notifiable_at) VALUES(?,?,?,?,?,?,?)',params:[id,dir,host,visibility,archived,run,100]});
  }
  await ctx.fns.procs.db.run({sql:'INSERT INTO user_agent_state VALUES(?,?,?)',params:['alice','a',100]});
  const id=(await ctx.fns.projects.identity({dir:'/counts'})).id;
  const before=await ctx.fns.procs.db.select({sql:'SELECT * FROM agents',params:[]});
  expect(await ctx.fns.projects.get({projectId:id})).toMatchObject({runningCount:1,unreadCount:1});
  const chats=await ctx.fns.projects.chats({projectId:id});
  expect(chats.map((c:any)=>[c.id,c.hasUnread])).toEqual([['a',false],['b',true]]);
  as('user:bob');expect(await ctx.fns.projects.get({projectId:id})).toMatchObject({runningCount:1,unreadCount:2});
  as('instance:legacy');expect(await ctx.fns.projects.get({projectId:id})).toMatchObject({runningCount:1,unreadCount:2});
  expect(await ctx.fns.procs.db.select({sql:'SELECT * FROM agents',params:[]})).toEqual(before);
 });
 test('native legacy watermarks support zero users, per-viewer precedence and concurrent running',async()=>{
  const {ctx,as}=await fixture();
  as('instance:legacy');
  await ctx.fns.procs.db.run({sql:"INSERT INTO agents(id,workspace_dir,visibility,run_state,last_notifiable_at) VALUES('a','/legacy','nav','calling',100)",params:[]});
  const id=(await ctx.fns.projects.identity({dir:'/legacy'})).id;
  const check=async(unread:boolean)=>{
   expect(await ctx.fns.projects.get({projectId:id})).toMatchObject({runningCount:1,unreadCount:unread?1:0});
   expect(await ctx.fns.projects.chats({projectId:id})).toMatchObject([{id:'a',runState:'calling',hasUnread:unread}]);
  };
  await check(true);
  await ctx.fns.procs.db.run({sql:"INSERT INTO kv VALUES('seen-at:a','100')",params:[]});
  await check(false);
  as('user:alice');ctx.state.registry.auth.listUsers=async()=>[{id:'alice'}];
  await check(false);
  await ctx.fns.procs.db.run({sql:"INSERT INTO user_agent_state VALUES('alice','a',50)",params:[]});
  await check(true); // Per-user watermark takes precedence, even over a newer legacy value.
  ctx.state.registry.auth.listUsers=async()=>[{id:'alice'},{id:'bob'}];as('user:bob');
  await check(true); // Multi-user instances never inherit shared seen-at.
  await ctx.fns.procs.db.run({sql:"INSERT INTO kv VALUES('seen:a','2')",params:[]});
  await ctx.fns.procs.db.run({sql:"INSERT INTO messages VALUES('a',2,100)",params:[]});
  await check(false); // Native old index watermark remains a compatibility fallback.
 });
 test('default landing restores filtered personal tabs without writes and preserves explicit indexes',async()=>{
  const {ctx,as}=await fixture();
  const route=(await import('./$route_view_GET')).default;
  const p=await ctx.fns.projects.create({dir:'/landing'});
  let available=['a','b'];
  ctx.state.registry.projects.chats=async()=>available.map(id=>({id,title:id,runState:'idle'}));
  ctx.state.registry.auth.pinnedIds=async()=>new Set();
  ctx.state.registry.nav={chatItems:(await import('../nav/chatItems')).default,rows:(await import('../nav/rows')).default};
  ctx.state.registry.ui={popup:(await import('../ui/popup')).default,modelLogo:(await import('../ui/modelLogo')).default};
  ctx.state.registry.chat={icon:(await import('../chat/icon')).default};
  ctx.state.registry.procs.ui={escape:(_c:any,_s:any,o:any)=>o.text,attr:()=>'',button:(await import('../procs/ui/button')).default};
  for(const agentId of available)await ctx.fns.projects.open({projectId:p.id,agentId});
  const before=await ctx.fns.procs.db.select({sql:'SELECT * FROM project_tabs',params:[]});
  const request=(suffix='',hx=false)=>route(ctx,null,{req:new Request('http://localhost/projects/view?projectId='+p.id+suffix,{headers:hx?{'HX-Request':'true'}:{}})});
  const normal=await request();expect(normal).toBeInstanceOf(Response);expect((normal as Response).headers.get('Location')).toBe('/agent/b');
  const htmx=await request('',true) as Response;expect(htmx.status).toBe(200);expect(JSON.parse(htmx.headers.get('HX-Location')!).path).toBe('/agent/b');
  for(const suffix of ['&list=1','&archive=1'])expect(await request(suffix)).not.toBeInstanceOf(Response);
  available=['a'];expect(((await request()) as Response).headers.get('Location')).toBe('/agent/a');
  expect(await ctx.fns.procs.db.select({sql:'SELECT * FROM project_tabs',params:[]})).toEqual(before);
  as('user:bob');await ctx.fns.projects.create({dir:'/landing'});expect(await request()).not.toBeInstanceOf(Response);
  const missing=await route(ctx,null,{req:new Request('http://localhost/projects/view?projectId=missing')});expect(missing).toMatchObject({status:404});
 });
 test('new root chat receives exact project and no parent or generation',async()=>{
  const {ctx}=await fixture();
  const p=await ctx.fns.projects.create({dir:'/isolated/new',host:'remote'});
  let received:any;
  ctx.state.registry.agent.start=async (_c:unknown,_s:unknown,o:any)=>{received=o;return {id:'new'};};
  ctx.state.registry.projects.chats=async()=>[{id:'new'}];
  await ctx.fns.projects.createChat({projectId:p.id,model:'mock:echo'});
  expect(received).toMatchObject({workspaceDir:p.dir,workspaceHost:'remote',parentId:null,forkOffset:null,visibility:'nav'});
 });
});
