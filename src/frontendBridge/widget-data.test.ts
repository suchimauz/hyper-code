import { test, expect } from 'bun:test';
import chats from '../nav/$widget_chats';
import mentions from '../mentions/rowsData';
import pages from '../nav/$widget_pluginPages';
import inbox from '../../plugins/inbox/src/inbox/$widget_unread';
import calendar from '../../plugins/google/src/gcal/$widget_today';
import search from './searchData';
const opts = {size:'M',config:{}} as any;
test('chat and mention providers return plain data, no HTML or popup calls', async()=>{
 const mention={id:1,agentId:'abc',agentTitle:'<title>',messageIdx:3,from:'person',excerpt:'<script>alert(1)</script>',createdAt:0,readAt:null};
 const ctx:any={fns:{mentions:{people:async()=>[{id:'person',name:'<author>'}],list:async()=>[mention]},nav:{agents:async()=>[],chatItems:async()=>[]},auth:{pinnedIds:async()=>new Set()}}};
 ctx.fns.mentions.rowsData=(o:any)=>mentions(ctx,null,o);
 const rows=await mentions(ctx,null,{items:[mention]});
 expect(rows).toEqual([{id:'mention:1',label:'<author> in <title>',href:'/agent/abc#m-3',detail:mention.excerpt,hint:new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(0)),icon:'ph-at',unread:true,pin:'agent:abc'}]);
 const out=await chats.render(ctx,null,opts);
 expect(out.items).toEqual([{id:'new-chat',label:'Новый чат',href:'/?newSession=1',icon:'ph-plus-circle'}]);
 expect(out.sections?.[0].items).toEqual(rows);expect(JSON.stringify(out)).not.toContain('"html"');
 expect((await chats.render(ctx,null,{...opts,config:{hideNewChat:true}})).items).toEqual([]);
});
test('inbox count, empty calendar and plugin catalogue are structured without network access',async()=>{
 const ctx:any={fns:{inbox:{list:async()=>[{id:'mail-1',subject:'Subject',text:'Text',from:'a@host',verified:true,readAt:null}]},gcal:{agenda:async()=>({events:[]})},nav:{items:async()=>[]}}};
 expect(await inbox.render(ctx,null,opts)).toEqual({items:[{id:'inbox:unread',label:'1 unread',href:'/inbox',unreadCount:1},{id:'inbox:mail-1',label:'Subject',href:'/inbox/mail-1',icon:'ph-envelope',hint:'a'}]});
 expect(await calendar.render(ctx,null,opts)).toEqual({items:[{id:'gcal:empty',label:'Nothing more today',href:'/gcal/',icon:'ph-calendar-blank'}]});
 expect((await pages.render(ctx)).items?.[0]).toEqual({id:'plugins:catalogue',label:'All plugins',href:'/plugins',hint:'catalogue',icon:'ph-squares-four'});
 ctx.fns.gcal.agenda=async()=>({events:[{id:'e',calendarId:'c',summary:'Event',allDay:true,start:'2099-01-01',htmlLink:'https://evil.example/'}]});
 expect((await calendar.render(ctx,null,opts)).items?.[0].href).toBe('/gcal/');
});
test('bridge allows exact native destinations, refuses external URLs and unknown HTML even when empty',async()=>{
 const good=['/?newSession=1','/agent/abc#m-3','/inbox/mail-1','/gcal/','/gcal'];
 const bad=['/?newSession=2','/?newSession=1&next=evil','//evil.example','https://calendar.google.com/event','/agent/abc#evil','/inbox/../settings','/inbox/a/b','/gcal/\\evil','/gcal/\n'];
 const ctx:any={state:{nav:{widgets:{legacy:{render:async()=>({html:'',items:[{label:'unsafe',href:'/files'}]})}}}},fns:{session:{list:async()=>[]},nav:{tabs:async()=>({tabs:[{id:'home',title:'Home',widgets:[{id:'legacy',widget:'legacy'}]}]}),searchAll:async()=>({groups:[{id:'g',title:'G',items:[...good,...bad].map(href=>({label:href,href}))}]})}}};
 const session:any={user:{id:'u'}};
 const data:any=await search(ctx,session,{q:'x'});
 expect(data.groups[0].items.map((i:any)=>i.href)).toEqual([...good,...bad.map(()=>null)]);
 const home:any=await search(ctx,session,{});expect(home.widgets[0].status).toBe('unsupported');expect(home.widgets[0].items).toEqual([]);
});
