import { expect, test } from 'bun:test';
import endpoint from '../$middleware_ui-lab-api';
import navigation from './navigationData';
import search from './searchData';
const session = {user:{id:'visitor'}} as any;
const req=(path:string,method='GET')=>new Request('http://local/ui-lab-api/'+path,{method});
test('navigation API refuses missing authentication and write methods before calling data',async()=>{
 const ctx={fns:{frontendBridge:{navigationData:()=>{throw new Error('must not run')}}}} as any;
 expect((await endpoint(ctx,null,{req:req('navigation')})).status).toBe(401);
 expect((await endpoint(ctx,session,{req:req('navigation','POST')})).status).toBe(405);
 expect((await endpoint(ctx,session,{req:req('unknown')})).status).toBe(404);
 expect((await endpoint(ctx,session,{req:req('search?q='+('x'.repeat(501)))})).status).toBe(400);
});
test('fixed endpoints return private JSON only and bounded failure messages',async()=>{
 const ctx={fns:{frontendBridge:{navigationData:async()=>({projects:[]}),searchData:async()=>({mode:'home'})}}} as any;
 const r=await endpoint(ctx,session,{req:req('navigation')});expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(await r.json()).toEqual({projects:[]});
 expect(await (await endpoint(ctx,session,{req:req('search')})).json()).toEqual({mode:'home'});
});
test('navigation preserves native project identity/archive and uses native titles plus actual reply times',async()=>{
 const ctx={fns:{projects:{list:async()=>[{id:'p',title:'Project',dir:'/a',host:'remote'}],chats:async({archived}:any)=>[{id:archived?'old':'a',title:'a',model:'m',archived:!!archived,runState:'idle',hasUnread:true}]},session:{list:async()=>[{id:'a',title:'Real title'}]},procs:{db:{select:async({sql}:any)=>sql.startsWith('SELECT m.')?[{agent_id:'a',ts:'12345'}]:[]}}}} as any;
 const data=await navigation(ctx,session,{});expect(data.projects[0].host).toBe('remote');expect(data.projects[0].chats[0]).toMatchObject({title:'Real title',lastReplyAt:12345,hasUnread:true});expect(data.projects[0].chats[1]).toMatchObject({archived:true,lastReplyAt:null});
 await expect(navigation(ctx,null,{})).rejects.toThrow('Unauthorized');
});
test('search uses native tabs/providers, strips actions/SVG and unsafe links',async()=>{
 const ctx={state:{nav:{widgets:{plain:{title:'Native',render:async()=>[{id:'agent:a',label:'New chat',href:'/agent/a',icon:'<svg/>',action:'bad'}]},html:{title:'HTML',render:async()=>'<div>private widget</div>'}}}},fns:{session:{list:async()=>[{id:'a',title:'Actual title'}]},nav:{tabs:async()=>({tabs:[{id:'home',title:'Overview',widgets:[{id:'p',widget:'plain'},{id:'h',widget:'html'}]}]}),searchAll:async()=>({groups:[{id:'g',title:'G',items:[{label:'Bad',href:'javascript:alert(1)'},{label:'Good',href:'/files'}]}]})}}} as any;
 const home:any=await search(ctx,session,{});expect(home.widgets[0].items[0]).toMatchObject({label:'Actual title',href:'/agent/a'});expect(home.widgets[0].items[0].icon).toBeUndefined();expect(home.widgets[0].items[0].action).toBeUndefined();expect(home.widgets[1].status).toBe('unsupported');
 const results:any=await search(ctx,session,{q:'test'});expect(results.groups[0].items[0].href).toBeNull();expect(results.groups[0].items[1].href).toBe('/files');
 await expect(search(ctx,null,{})).rejects.toThrow('Unauthorized');
});
test('navigation projects personal native pins for project and unassigned chats',async()=>{
 const ctx:any={fns:{projects:{list:async()=>[{id:'p'}],chats:async({archived}:any)=>archived?[]:[{id:'a',archived:false}]},session:{list:async()=>[]},procs:{db:{select:async({sql,params}:any)=>{
  if(sql.includes('user_agent_state')){expect(params).toEqual(['visitor']);return [{agent_id:'a',updated_at:'100'},{agent_id:'b',updated_at:'200'}];}
  if(sql.includes('workspace_dir IS NULL'))return [{id:'b',archived_at:42},{id:'c',archived_at:null}];
  return [];
 }}}}};
 const data=await navigation(ctx,session,{});
 expect(data.projects[0].chats[0]).toMatchObject({pinned:true,pinnedAt:100});
 expect(data.projects[1].chats[0]).toMatchObject({id:'b',archived:true,pinned:true,pinnedAt:200});
 expect(data.projects[1].chats[1]).toMatchObject({id:'c',pinned:false,pinnedAt:null});
});
