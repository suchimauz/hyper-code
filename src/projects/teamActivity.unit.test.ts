import {test,expect} from 'bun:test';
import chats from './chats.ts';
import list from './list.ts';
import render from './renderChrome.ts';
import dock from '../dock/runningAgents.ts';
import menu from '../nav/chatItems.ts';

function fixture(){
 const count={root:2,own:1};
 const ctx:any={fns:{agent:{teamActivity:async()=>count},auth:{viewerId:async()=>null,listUsers:async()=>[]},projects:{get:async()=>({id:'p'}),principal:async()=>'local',identity:async()=>({id:'p',dir:'/work',host:''})},procs:{db:{select:async()=>[]},ui:{escape:({text}:any)=>text,button:(o:any)=>JSON.stringify(o)}},chat:{icon:(o:any)=>JSON.stringify(o)},ui:{live:(o:any)=>o.html,popup:()=>''}}};
 return {ctx,count};
}
test('chat summary carries descendant count without changing own idle state',async()=>{
 const {ctx}=fixture();ctx.fns.procs.db.select=async()=>[{id:'root',title:'Parent',run_state:'idle',archived_at:null,workspace_dir:'/work',has_unread:false}];
 const out=await chats(ctx,null,{projectId:'p'});expect(out[0]?.runState).toBe('idle');expect(out[0]?.teamRunningCount).toBe(2);
});
test('project counts idle team roots once, not each worker or already running root',async()=>{
 const {ctx}=fixture();let i=0;
 ctx.fns.procs.db.select=async(o:any)=>{
  i++;if(i===1)return [];
  if(i===2)return [{dir:'/work',host:'',running_count:1,unread_count:0,latest_created_at:0}];
  expect(o.sql).toContain("run_state IN ('','idle')");return [{id:'root',dir:'/work',host:''}];
 };
 const out=await list(ctx,null,{});expect(out[0]?.runningCount).toBe(2);
});
test('idle ancestors appear active in dock and menu without altering state',async()=>{
 const {ctx}=fixture();ctx.fns.procs.db.select=async()=>[{id:'root',title:'Parent',run_state:'idle'},{id:'idle',title:'Idle',run_state:'idle'}];
 const out=await dock(ctx,null,{});expect(out).toContain('Working subagents: 2');expect(out).toContain('/agent/root');expect(out).not.toContain('/agent/idle');
 const cards=[{id:'root',runState:'idle'},{id:'idle',runState:'idle'},{id:'own',runState:'running'}];
 const items=await menu(ctx,null,{agents:cards});expect(items.map(x=>x.active)).toEqual([true,false,true]);expect(cards[0]?.runState).toBe('idle');expect(items[0]?.detail).toBeUndefined();
});
test('project tabs and mobile icons mark idle parent activity with tooltip only',async()=>{
 const {ctx}=fixture();const out=await render(ctx,null,{projects:[{id:'p',title:'Project',dir:'/work',host:''}],projectId:'p',chats:[{id:'root',title:'Parent',runState:'idle',teamRunningCount:2}],tabIds:['root']});
 expect(out.tabs).toContain('Working subagents: 2');expect(out.tabs).toContain('project-mobile-activity');expect(out.tabs.replaceAll('\\','')).toContain('"active":true');expect(out.tabs).not.toContain('<span>Working subagents');
});
