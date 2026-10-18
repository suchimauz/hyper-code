import { test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import search from './searchHistory';
import route from './$route_$id_search_GET';

function fixture(viewer:string|null='u') {
 const db=new Database(':memory:');
 db.exec('CREATE TABLE agents(id TEXT,parent_id TEXT,fork_offset INTEGER,created_by TEXT); CREATE TABLE messages(agent_id TEXT,idx INTEGER,role TEXT,content TEXT,message_type TEXT)');
 db.exec("INSERT INTO agents VALUES ('p',NULL,NULL,'u'),('c','p',2,'u'),('other',NULL,NULL,'v'),('bad','other',2,'u')");
 for(const [id,idx,text] of [['p',5,'literal %_ [x] <b>'],['p',10,'second match'],['p',15,'secret beyond fork'],['c',0,'match child'],['c',9,'x'.repeat(170)+'literal %_ [x] <b>'+'z'.repeat(1600)],['other',0,'private']]) db.query('INSERT INTO messages(agent_id,idx,role,content) VALUES(?,?,?,?)').run(id as string,idx as number,'user',text as string);
 const calls:Array<{sql:string;params:any[]}>=[];
 const ctx:any={fns:{auth:{viewerId:async()=>viewer},procs:{db:{select:async({sql,params=[]}:any)=>{
 calls.push({sql,params});
 // Execute the PostgreSQL statement against an isolated SQL engine with only spelling adaptations.
 sql=sql.replaceAll('strpos(', 'instr(').replace('substring(content FROM greatest(1,hit-160) FOR 1200)','substr(content,max(1,hit-160),1200)').replace(/\(SELECT agent_id,idx,role,content,message_type,rn \+ \? AS ordinal/g,'SELECT agent_id,idx,role,content,message_type,rn + ? AS ordinal').replaceAll('WHERE rn < ?)','WHERE rn < ?');
 // JSON extraction has separate PostgreSQL smoke coverage; SQLite fixtures here are prose.
 sql=sql.replace(/, parsed AS .*?, matches AS/s, ", readable AS (SELECT * FROM scoped WHERE role IN ('user','assistant') AND COALESCE(message_type,'message') IN ('message','agent_message')), matches AS");
 return db.query(sql).all(...params);
 }}}}};
 ctx.fns.chat={searchHistory:(opts:any)=>search(ctx,null,opts)};
 return {ctx,calls,db};
}
test('literal metacharacters and HTML stay literal, bounded snippets and cursor pages',async()=>{
 const {ctx,calls}=fixture();
 const first=await search(ctx,null,{agentId:'c',query:'%_ [x] <b>',limit:1});
 expect(first.results).toHaveLength(1);expect(first.results[0]!.idx).toBe(5);expect(first.next).toBe(0);
 const second=await search(ctx,null,{agentId:'c',query:'%_ [x] <b>',limit:1,after:first.next!});
 expect(second.results[0]!.idx).toBe(9);expect(second.results[0]!.snippet.length).toBeLessThanOrEqual(1200);expect(second.next).toBeNull();
 expect(calls.at(-1)!.sql).not.toContain('%_ [x]');expect(calls.at(-1)!.params).toContain('%_ [x] <b>');
});
test('fork prefix is array-position based, not idx; searches full persisted own and inherited history',async()=>{
 const {ctx}=fixture();
 expect((await search(ctx,null,{agentId:'c',query:'MATCH'})).results.map(r=>r.idx)).toEqual([10,0]);
 expect((await search(ctx,null,{agentId:'c',query:'beyond fork'})).results).toEqual([]);
});
test('ownership and ancestor checks precede any message query',async()=>{
 for(const id of ['other','bad','missing']){const {ctx,calls}=fixture();await expect(search(ctx,null,{agentId:id,query:'private'})).rejects.toThrow();expect(calls.some(c=>c.sql.includes('FROM messages'))).toBe(false);}
 const {ctx,calls}=fixture(null);await expect(search(ctx,null,{agentId:'c',query:'x'})).rejects.toThrow();expect(calls).toHaveLength(0);
});
test('invalid cursors and limits reject, routes have no-store and generic forbidden responses',async()=>{
 const {ctx}=fixture();
 for(const after of [-2,NaN,1.2]) await expect(search(ctx,null,{agentId:'c',query:'x',after})).rejects.toThrow();
 await expect(search(ctx,null,{agentId:'c',query:'x',limit:51})).rejects.toThrow();
 const bad=await route(ctx,null,{req:new Request('http://localhost/chat/c/search?q=x&after=no'),params:{id:'c'}});expect(bad.status).toBe(400);
 const denied=await route(ctx,null,{req:new Request('http://localhost/chat/other/search?q=x'),params:{id:'other'}});expect(denied.status).toBe(403);expect(denied.headers.get('cache-control')).toBe('no-store');
});
