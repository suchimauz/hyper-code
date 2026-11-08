import { expect, test } from 'bun:test';
import navigation from './navigationData';

test('navigation projects durable model/effort and creation dates without per-chat catalogue requests', async () => {
 const rows = [
  {id:'high',model:'codex:gpt-6-astra',reasoning_effort:'high',created_at:'123'},
  {id:'same',model:'codex:gpt-6-astra',reasoning_effort:'high',created_at:'124'},
  {id:'auto',model:'codex:gpt-6-astra',reasoning_effort:'auto',created_at:'125'},
  {id:'max',model:'codex:gpt-6-astra',reasoning_effort:'xhigh'},
  {id:'down',model:'codex:gpt-6-astra',reasoning_effort:'off'},
  {id:'none',model:'lmstudio:local',reasoning_effort:'high'},
 ];
 let resolutions=0;
 const ctx:any={fns:{
  projects:{list:async()=>[{id:'p',title:'P'},{id:'virtual',virtual:true}],chats:async({projectId,archived}:any)=>projectId==='p'&&!archived?rows.map(row=>({...row,runState:'idle'})):[]},
  session:{list:async()=>[]}, frontendBridge:{iconData:async()=>null},
  llm:{resolveReasoningEffort:async({model,effort}:any)=>{
   resolutions++;
   const none=model==='lmstudio:local';
   return {requested:effort,applied:none?'off':effort==='auto'?'medium':effort==='off'?'low':effort,mode:none?'none':'openai-effort',downgraded:none||effort==='off'};
  }}, 
  procs:{db:{select:async({sql,params}:any)=>{
   if(sql.startsWith('SELECT id,icon,model,'))return rows;
   if(sql.startsWith('SELECT id,created_at FROM projects')) {expect(params).toEqual(['p','virtual']);return [{id:'p',created_at:'100'}]}
   if(sql.includes('workspace_dir IS NULL'))return [rows[0]];
   return [];
  }}}
 }};
 const data=await navigation(ctx,{user:{id:'visitor'}} as any,{});
 const chats=data.projects[0].chats;
 expect(chats.find(c=>c.id==='high')).toMatchObject({modelLabel:'gpt-6-astra',createdAt:123,effort:{requested:'high',applied:'high',label:'High',downgraded:false}});
 expect(chats.find(c=>c.id==='auto')?.effort).toMatchObject({requested:'auto',applied:'medium',label:'Default'});
 expect(chats.find(c=>c.id==='max')?.effort?.label).toBe('Max');
 expect(chats.find(c=>c.id==='down')?.effort).toMatchObject({requested:'off',applied:'low',label:'Low',downgraded:true});
 expect(chats.find(c=>c.id==='none')?.effort?.label).toBeNull();
 expect(data.projects[0].createdAt).toBe(100);
 expect(data.projects[1].createdAt).toBeNull();
 expect(data.projects[2].createdAt).toBeNull();
 expect(data.projects[2].chats[0]).toMatchObject({modelLabel:'gpt-6-astra',createdAt:123,effort:{label:'High'}});
 expect(resolutions).toBe(5);
});
