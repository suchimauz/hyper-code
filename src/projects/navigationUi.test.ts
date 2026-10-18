import {describe,test,expect} from 'bun:test';
import navigation from './navigation.ts';
import pane from '../agent/pane.ts';
import action from './$route_action_POST.ts';
import view from './$route_view_GET.ts';
import projectArchive from './$route_archive_GET.ts';
import button from '../procs/ui/button.ts';
import attr from '../procs/ui/attr.ts';
import chatItems from '../nav/chatItems.ts';
import rows from '../nav/rows.ts';
import popup from '../ui/popup.ts';
import icon from '../chat/icon.ts';
import modelLogo from '../ui/modelLogo.ts';
const fixture=()=>{const calls:string[]=[];const p={id:'p',title:'project',dir:'/same',host:'remote',virtual:false};const ctx:any={fns:{auth:{verifyCsrf:async()=>true},procs:{ui:{escape:({text}:any)=>Bun.escapeHTML(text)}},projects:{list:async()=>[p],resolve:async()=>p,get:async()=>p,chats:async({archived}:any)=>[{id:archived?'archived':'a',title:'chat',runState:'idle'}],tabs:async()=>({tabIds:[],activeId:null}),renderChrome:async(o:any)=>{calls.push(JSON.stringify(o));return {sidebar:'sidebar',tabs:'tabs'}},navigation:async()=>({sidebar:'sidebar',tabs:'tabs'}),closeTab:async()=>({tabIds:[],activeId:null})}}};ctx.fns.procs.ui.button=(o:any)=>button(ctx,null,o);ctx.fns.procs.ui.attr=(o:any)=>attr(ctx,null,o);ctx.fns.auth.pinnedIds=async()=>new Set();ctx.fns.nav={chatItems:(o:any)=>chatItems(ctx,null,o),rows:(o:any)=>rows(ctx,null,o)};ctx.fns.ui={popup:(o:any)=>popup(ctx,null,o),modelLogo:(o:any)=>modelLogo(ctx,null,o)};ctx.fns.chat={icon:(o:any)=>icon(ctx,null,o)};return {ctx,calls};};
describe('project UI boundaries',()=>{
 test('project archive actions are separate from chat archive and archive page offers restore',async()=>{
  const {ctx}=fixture();const calls:any[]=[];ctx.fns.projects.setArchived=async(o:any)=>calls.push(o);
  for(const a of ['archive-project','restore-project']){const r=await action(ctx,null,{req:new Request('http://local/projects/action',{method:'POST',body:JSON.stringify({action:a,projectId:'p'})})});expect(r.status).toBe(200);}
  expect(calls).toEqual([{projectId:'p',archived:true},{projectId:'p',archived:false}]);
  ctx.fns.projects.list=async()=>[{id:'old',title:'Archived workspace',dir:'/old',host:'',archived:true},{id:'active',title:'Active workspace',dir:'/active',host:'',archived:false}];
  const page=await projectArchive(ctx,null,{req:new Request('http://local/projects/archive')});expect(page.main).toContain('Archived workspace');expect(page.main).not.toContain('Active workspace');expect(page.main).toContain('data-project-action="restore-project"');expect(page.main).toContain('data-project-id="old"');
 });
 test('current direct URL projects its tab without persisting or loading transcript',async()=>{const {ctx,calls}=fixture();await navigation(ctx,null,{agentId:'a'});expect(JSON.parse(calls[0]!).tabIds).toEqual(['a']);});
 test('agent pane keeps direct canvas/chat surface, hides navigation in embeds',async()=>{const {ctx}=fixture();const main='<div data-page="agent"><section id="chat-panel"></section></div>';expect(await pane(ctx,null,{main,path:'/agent/a'})).toBe('<div id="project-tabs-host">tabs</div>'+main);for(const query of ['embed=1','presentation=sidebar'])expect(await pane(ctx,{url:new URL('http://local/agent/a?'+query)} as any,{main,path:'/agent/a'})).toBe(main);});
 test('cross-origin action lacking csrf cannot touch project APIs',async()=>{const {ctx}=fixture();ctx.fns.auth.verifyCsrf=async()=>false;ctx.fns.projects.create=()=>{throw Error('must not write')};const r=await action(ctx,null,{req:new Request('http://local/projects/action',{method:'POST',headers:{origin:'http://evil'},body:JSON.stringify({action:'create',dir:'/x'})})});expect(r.status).toBe(403);});
 test('close supplies fallback without assuming another window active chat',async()=>{const {ctx}=fixture();const r=await action(ctx,null,{req:new Request('http://local/projects/action',{method:'POST',body:JSON.stringify({action:'close',projectId:'p',agentId:'a'})})});expect(await r.json()).toEqual({ok:true,fallbackUrl:'/projects/view?projectId=p'});});
 test('archive is scoped and offers restore, not delete or generation',async()=>{const {ctx}=fixture();const result=await view(ctx,null,{req:new Request('http://local/projects/view?projectId=p&archive=1')});if(result instanceof Response)throw new Error('Archive must render index');expect(result.main).toContain('data-project-action="restore"');expect(result.main).toContain('data-chat-id="archived"');expect(result.main).not.toContain('delete');});
 test('active and archived lists preserve custom agent icons through native rows',async()=>{
  const svg='<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1"/></svg>';
  for(const archived of [false,true]){const {ctx}=fixture();let requested=false;ctx.fns.projects.chats=async(o:any)=>{requested=o.archived;return [{id:'custom',title:'Custom',model:'openai:gpt-4o',icon:svg,runState:'idle'}]};
   const result=await view(ctx,null,{req:new Request('http://local/projects/view?projectId=p&'+(archived?'archive=1':'list=1'))});
   if(result instanceof Response)throw Error('Expected list');expect(requested).toBe(archived);expect(result.main).toContain('data:image/svg+xml,'+encodeURIComponent(svg));expect(result.main).not.toContain('<svg xmlns=');
  }
 });
});
