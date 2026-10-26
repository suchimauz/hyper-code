import { describe, test, expect } from 'bun:test';
import renderPage from './renderPage.ts';
import view from './$route_view_GET.ts';
import archive from './$route_archive_GET.ts';
import rows from '../nav/rows.ts';
import chatItems from '../nav/chatItems.ts';
const fixture = () => {
 const p={id:'p',title:'Проект <one>',dir:'/exact',host:'',virtual:false};
 const chats=[{id:'idle',title:'Quiet <chat>',model:'provider:model',runState:'idle',teamRunningCount:0,hasUnread:true},{id:'busy',title:'Busy',model:'p:m',runState:'running',teamRunningCount:0},{id:'scheduled',title:'Later',model:'p:m',runState:'idle',canArchive:false,archiveBlockedReason:'scheduled',teamRunningCount:0},{id:'team',title:'Team',model:'p:m',runState:'idle',teamRunningCount:2}];
 const ctx:any={fns:{procs:{ui:{escape:({text}:any)=>Bun.escapeHTML(text)}},auth:{pinnedIds:async()=>new Set(['idle'])},agent:{teamActivity:async()=>({team:2})},chat:{icon:()=>'<i data-model-icon></i>'},ui:{popup:()=>'<button>Новый чат</button>'},projects:{get:async()=>p,list:async()=>[p,{...p,id:'old',title:'Old',archived:true}],tabs:async()=>({tabIds:['idle'],activeId:'idle'}),chats:async({archived}:any)=>archived?[{...chats[0],id:'oldchat'}]:chats}}};
 ctx.fns.nav={rows:(o:any)=>rows(ctx,null,o),chatItems:(o:any)=>chatItems(ctx,null,o)};
 ctx.fns.projects.renderPage=(o:any)=>renderPage(ctx,null,o);
 return {ctx,p,chats};
};
describe('searchable project pages',()=>{
 test('active list has searchable metadata, filters, native pins, IDs and disabled busy archive',async()=>{
  const {ctx}=fixture(); const result=await view(ctx,null,{req:new Request('http://local/projects/view?projectId=p&list=1')});
  if(result instanceof Response)throw Error('Expected page');
  expect(result.main).toContain('Чаты проекта');expect(result.main).toContain('Quiet &lt;chat&gt;');expect(result.main).not.toContain('Quiet <chat>');
  expect(result.main).toContain('data-search="Quiet &lt;chat&gt; provider:model idle"');
  for(const filter of ['all','open','running','unread'])expect(result.main).toContain('data-page-filter="'+filter+'"');
  expect(result.main).toContain('hx-post="/nav/agent/idle/pin"');expect(result.main).toContain('data-open="true"');expect(result.main).toContain('data-unread="true"');
  for(const id of ['busy','scheduled','team'])expect(result.main).toMatch(new RegExp('data-project-action="archive" data-chat-id="'+id+'"[^>]+ disabled'));
  expect(result.main).not.toMatch(/data-project-action="archive" data-chat-id="idle"[^>]+ disabled/);
  expect(result.main).toContain('data-project-action="close"');expect(result.main).toContain('prefers-reduced-motion');
 });
 test('archive has direct restore and no destructive controls',async()=>{
  const {ctx}=fixture();const page=await view(ctx,null,{req:new Request('http://local/projects/view?projectId=p&archive=1')});
  if(page instanceof Response)throw Error('Expected page');
  expect(page.main).toContain('data-project-action="restore" data-chat-id="oldchat"');expect(page.main).not.toContain('data-project-action="archive"');expect(page.main).not.toContain('data-page-filter=');expect(page.main).toContain('агент не запустится');
 });
 test('personal project archive does not include active projects',async()=>{
  const {ctx}=fixture();const page=await archive(ctx,null,{req:new Request('http://local/projects/archive')});
  expect(page.main).toContain('data-project-action="restore-project" data-project-id="old"');expect(page.main).not.toContain('Проект &lt;one&gt;');expect(page.main).toContain('только из вашей навигации');
 });
 test('default navigation restores last tab read-only and HTMX uses location response',async()=>{
  const {ctx}=fixture();ctx.fns.projects.chats=()=>{throw Error('No index query on restore')};ctx.fns.projects.renderPage=()=>{throw Error('No rendering on restore')};
  for(const hx of [false,true]){const result=await view(ctx,null,{req:new Request('http://local/projects/view?projectId=p',{headers:hx?{'HX-Request':'true'}:{}})});expect(result).toBeInstanceOf(Response);const response=result as Response;expect(response.status).toBe(hx?200:302);expect(response.headers.get(hx?'HX-Location':'Location')).toContain('/agent/idle');}
 });
});
