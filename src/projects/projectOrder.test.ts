import {describe,test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';

// Isolated SQLite fixture: never mutates the running viewer's preferences.
async function fixture() {
 const db=new Database(':memory:');
 db.exec(`CREATE TABLE projects(id TEXT PRIMARY KEY,dir TEXT,host TEXT); CREATE TABLE project_members(principal TEXT,project_id TEXT,title TEXT,archived_at INTEGER,icon TEXT); CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE agents(id TEXT,workspace_dir TEXT,workspace_host TEXT,created_at INTEGER,archived_at INTEGER,run_state TEXT,last_notifiable_at INTEGER,visibility TEXT); CREATE TABLE user_agent_state(agent_id TEXT,user_id TEXT,seen_at INTEGER); CREATE TABLE messages(agent_id TEXT,idx INTEGER,ts INTEGER);`);
 let principal='user:alice',events=0;
 const ctx:any={fns:{projects:{principal:async()=>principal},auth:{viewerId:async()=>principal.slice(5),listUsers:async()=>[{},{}]},agent:{teamActivity:async()=>({})},procs:{db:{select:async(o:any)=>db.query(o.sql).all(...(o.params??[])),run:async(o:any)=>db.query(o.sql).run(...(o.params??[]))},events:{emit:()=>{events++;}}}}};
 for (const name of ['list','identity','reorderProjects']) {
  const fn=(await import('./'+name+'.ts')).default;
  ctx.fns.projects[name]=(opts:any)=>fn(ctx,null,opts);
 }
 const add=(id:string,title=id,archived:number|null=null,owner='user:alice')=>{
  db.query('INSERT OR IGNORE INTO projects VALUES(?,?,?)').run(id,'/'+id,'');
  db.query('INSERT INTO project_members VALUES(?,?,?,?,NULL)').run(owner,id,title,archived);
 };
 const ids=async()=> (await ctx.fns.projects.list({})).map((p:any)=>p.id);
 return {db,ctx,add,ids,as:(p:string)=>{principal=p;},events:()=>events};
}

describe('personal project order',()=>{
 test('saved order survives repeated reads; newcomers append deterministically; viewers isolated',async()=>{
  const f=await fixture();try {
   f.add('a');f.add('b');f.add('a','a',null,'user:bob');f.add('b','b',null,'user:bob');
   expect(await f.ids()).toEqual(['a','b']);
   expect(await f.ctx.fns.projects.reorderProjects({projectIds:['b','a']})).toEqual(['b','a']);
   expect(await f.ids()).toEqual(['b','a']);expect(await f.ids()).toEqual(['b','a']);
   f.add('d','Same');f.add('c','Same');expect(await f.ids()).toEqual(['b','a','c','d']);
   f.as('user:bob');expect(await f.ids()).toEqual(['a','b']);expect(f.events()).toBe(1);
  } finally {f.db.close();}
 });
 test('rejects omitted, duplicate, foreign, archived and malformed IDs without writes',async()=>{
  const f=await fixture();try {
   f.add('a');f.add('b');f.add('archived','archived',10);f.add('foreign','foreign',null,'user:bob');
   for(const projectIds of [[],['a'],['a','a'],['a','foreign'],['a','archived'],['a','b','extra'],['a',2],null,'ab']) {
    await expect(f.ctx.fns.projects.reorderProjects({projectIds})).rejects.toThrow('exactly once');
   }
   expect(f.db.query('SELECT * FROM kv').all()).toEqual([]);expect(f.events()).toBe(0);
  } finally {f.db.close();}
 });
 test('archived slots and relative order survive reorder and restoration',async()=>{
  const f=await fixture();try {
   for(const id of ['a','b','c','d'])f.add(id);
   await f.ctx.fns.projects.reorderProjects({projectIds:['d','c','b','a']});
   f.db.run("UPDATE project_members SET archived_at=10 WHERE project_id IN ('c','b')");
   await f.ctx.fns.projects.reorderProjects({projectIds:['a','d']});
   expect(await f.ids()).toEqual(['a','c','b','d']);
   f.db.run('UPDATE project_members SET archived_at=NULL');expect(await f.ids()).toEqual(['a','c','b','d']);
  } finally {f.db.close();}
 });
 test('virtual projects persist order without materialization',async()=>{
  const f=await fixture();try {
   for(const dir of ['/z','/a'])f.db.query("INSERT INTO agents VALUES(?,?,NULL,1,NULL,'idle',NULL,'nav')").run(dir,dir);
   const original=await f.ids();const reversed=[...original].reverse();
   await f.ctx.fns.projects.reorderProjects({projectIds:reversed});expect(await f.ids()).toEqual(reversed);
   expect(f.db.query('SELECT * FROM projects').all()).toEqual([]);expect(f.db.query('SELECT * FROM project_members').all()).toEqual([]);
  } finally {f.db.close();}
 });
 test('empty active permutation is valid; corrupt preference falls back; unknown and duplicate saved IDs are harmless',async()=>{
  const f=await fixture();try {
   expect(await f.ctx.fns.projects.reorderProjects({projectIds:[]})).toEqual([]);
   f.add('a');f.add('b');
   for(const value of ['not json','{}','null']) {
    f.db.query('UPDATE kv SET value=?').run(value);expect(await f.ids()).toEqual(['a','b']);
   }
   f.db.query('UPDATE kv SET value=?').run(JSON.stringify(['missing','b','b',null,'a']));expect(await f.ids()).toEqual(['b','a']);
  } finally {f.db.close();}
 });
 test('unauthorized principal cannot read or mutate order',async()=>{
  const f=await fixture();try {
   f.ctx.fns.projects.principal=async()=>{throw new Error('Projects require an authorized viewer');};
   await expect(f.ids()).rejects.toThrow('authorized');
   await expect(f.ctx.fns.projects.reorderProjects({projectIds:[]})).rejects.toThrow('authorized');
   expect(f.db.query('SELECT * FROM kv').all()).toEqual([]);
  } finally {f.db.close();}
 });
});
