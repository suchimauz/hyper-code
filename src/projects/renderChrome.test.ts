import {describe,test,expect} from 'bun:test';
import {Window} from 'happy-dom';
import render from './renderChrome.ts';
import button from '../procs/ui/button.ts';
import popup from '../ui/popup.ts';
import chatIcon from '../chat/icon.ts';
import modelLogo from '../ui/modelLogo.ts';
const ctx:any={fns:{procs:{ui:{escape:({text}:any)=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')}}}};
ctx.fns.procs.ui.attr=()=>'';
ctx.fns.procs.ui.button=(opts:any)=>button(ctx,null,opts);
ctx.fns.ui={popup:(opts:any)=>popup(ctx,null,opts),modelLogo:(opts:any)=>modelLogo(ctx,null,opts)};
ctx.fns.chat={icon:(opts:any)=>chatIcon(ctx,null,opts)};
const base={projects:[{id:'p',title:'<Project>',dir:'/work',host:''}],projectId:'p',activeId:'a',chats:[{id:'a',title:'<Chat>',runState:'running',hasUnread:true}],tabIds:['a','gone']};
describe('project navigation markup',()=>{
 test('escapes titles and preserves semantic links, selected and close vs archive',async()=>{
  const out=await render(ctx,null,base);
  expect(out.sidebar).toContain('&lt;Project>'); expect(out.tabs).toContain('&lt;Chat>');
  expect(out.tabs).toContain('aria-current="page"'); expect(out.tabs).toContain('hx-target="#main"');
  expect(out.tabs).toContain('(does not archive)'); expect(out.tabs).toContain('data-project-action="archive"');
  expect(out.tabs).not.toContain('/agent/gone'); expect(out.tabs).toContain('aria-label="running"');
 });
 test('empty projects remain selectable and new chats are independent',async()=>{
  const out=await render(ctx,null,{...base,chats:[],tabIds:[]});
  expect(out.sidebar).toContain('/projects/view?projectId=p'); expect(out.tabs).toContain('Новый независимый чат');
  expect(out.tabs).not.toContain('/fork');
  expect(out.tabs).toContain('hx-popup="ui.newAgentPopup"');
  expect(out.tabs).toContain('hx-popup-params="{&quot;projectId&quot;:&quot;p&quot;}"');
  expect(out.tabs).not.toContain('data-project-action="new-chat"');
 });
 test('projects show activity and unread independently with native icons',async()=>{
  const out=await render(ctx,null,{...base,projects:[{...base.projects[0]!,runningCount:2,unreadCount:3}]});
  expect(out.sidebar).toContain('2 running chats');expect(out.sidebar).toContain('3 unread chats');
  expect(out.sidebar).toContain('ph-folder-open');expect(out.tabs).toContain('&amp;list=1');
  expect(out.tabs).toContain('aria-label="running"');expect(out.tabs).toContain('aria-label="Unread messages"');
 });
 test('custom icon stays visible alongside running and unread; missing icon uses model logo',async()=>{
  const svg='<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
  const out=await render(ctx,null,{...base,chats:[{...base.chats[0]!,icon:svg,model:'openai:gpt-4o'}]});
  expect(out.tabs).toContain('data:image/svg+xml,'+encodeURIComponent(svg));
  expect(out.tabs).toContain('chat-icon-ring');expect(out.tabs).toContain('Unread messages');expect(out.tabs).not.toContain('<svg xmlns=');
  const fallback=await render(ctx,null,{...base,chats:[{...base.chats[0]!,model:'openai:gpt-4o',runState:'idle'}]});
  expect(fallback.tabs).toContain('chat-icon');expect(fallback.tabs).not.toContain('chat-icon-ring');expect(fallback.tabs).not.toContain('data:image/svg+xml,');
 });
 test('sidebar keeps active projects and archive without duplicating the primary new chat action',async()=>{
  const out=await render(ctx,null,{...base,projects:[...base.projects,{id:'old',title:'Hidden archived',dir:'/old',host:'',archived:true}]});
  expect(out.sidebar).not.toContain('Hidden archived');expect(out.sidebar).toContain('/projects/archive');expect(out.sidebar).not.toContain('hx-popup="ui.newAgentPopup"');expect(out.sidebar).not.toContain('data-project-action="new-project"');expect(out.sidebar).not.toContain('data-project-action="archive-project"');expect(out.tabs).toContain('data-project-action="archive-project"');expect(out.tabs).not.toContain('archive-current');expect(out.tabs).toContain('Архивировать проект');expect(out.tabs).not.toContain('title="Project archive"');
 });
 test('archived selected project offers restore instead of archive',async()=>{
  const out=await render(ctx,null,{...base,projects:base.projects.map(p=>({...p,archived:true}))});
  expect(out.tabs).toContain('data-project-action="restore-project"');expect(out.tabs).toContain('Восстановить проект');expect(out.tabs).not.toContain('data-project-action="archive-project"');expect(out.tabs).toContain('data-project-id="p"');
 });
 test('no selected project yields no stray tabs',async()=>{
  const out=await render(ctx,null,{...base,projectId:undefined}); expect(out.tabs).toBe('');
 });
});

test('project labels expose local or actual SSH host and only archive in heading', async()=>{
 const out=await render(ctx,null,{...base,projects:[...base.projects,{id:'remote',title:'Remote',dir:'/srv',host:'ssh<&host'}]});
 expect(out.sidebar).toContain('class="project-copy"');
 expect(out.sidebar).toContain('class="project-host">Локально</span>');
 expect(out.sidebar).toContain('ssh&lt;&amp;host');
 expect(out.sidebar).toContain('/projects/archive');
 expect(out.sidebar).not.toContain('ui.newAgentPopup');
 expect(out.sidebar).toContain('aria-current="page"');
});

test('project logos use inert image URLs in expanded and mobile navigation with a reset editor',async()=>{
 const svg='<svg viewBox="0 0 8 8"><path d="M0 0"/></svg>';
 const out=await render(ctx,null,{...base,projects:[{...base.projects[0]!,icon:svg,unreadCount:2}]});
 expect(out.sidebar).toContain('class="project-logo"');expect(out.sidebar).toContain(Buffer.from(svg).toString('base64'));
 expect(out.sidebar).not.toContain(svg);expect(out.sidebar).toContain('project-unread-badge');
 expect(out.tabs).toContain('class="project-logo"');expect(out.tabs).toContain('hx-popup="projects.iconPopup"');
});

test('management remains inert until opened and exposes escaped authorized project details and scoped popups',async()=>{
 const w=new Window();try{
  w.document.body.innerHTML=(await render(ctx,null,{...base,projects:[{id:'p',title:'<img src=x onerror=alert(1)>',dir:'/work/<private>',host:'ssh<&host',runningCount:4,unreadCount:2}]})).tabs;
  const d=w.document,menu=(d.querySelector('template[data-project-template="manage"]') as any).content;
  expect(d.querySelectorAll('template')).toHaveLength(2);
  expect(d.querySelector('.project-panel-dialog')).toBeNull();expect(d.querySelector('[data-project-action="archive-project"]')).toBeNull();
  expect(menu.querySelector('h2')?.textContent).toBe('<img src=x onerror=alert(1)>');expect(menu.querySelector('img')).toBeNull();
  expect(menu.querySelector('.project-panel-workspace')?.textContent).toContain('/work/<private>');expect(menu.querySelector('.project-panel-workspace')?.textContent).toContain('ssh<&host');
  expect(menu.querySelector('a[href="/projects/view?projectId=p&list=1"] small')?.textContent).toBe('1');
  expect(menu.querySelector('a[href="/projects/view?projectId=p&archive=1"]')).not.toBeNull();
  for(const name of ['ui.newAgentPopup','projects.iconPopup']) expect(JSON.parse(menu.querySelector('[hx-popup="'+name+'"]')!.getAttribute('hx-popup-params')!)).toEqual({projectId:'p'});
  expect(menu.querySelector('[data-project-action="archive-project"]')?.getAttribute('data-project-title')).toBe('<img src=x onerror=alert(1)>');
  for(const selector of ['.project-mobile-toggle','.project-mobile-manage','.project-manage-trigger']){
   const trigger=d.querySelector(selector)!;expect(trigger.tagName).toBe('BUTTON');expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');expect(trigger.getAttribute('aria-expanded')).toBe('false');expect(trigger.getAttribute('data-project-panel')).toBe(selector==='.project-mobile-toggle'?'chats':'manage');
  }
 }finally{await w.happyDOM.close();}
});

test('archive permissions and running guards never disable closing a personal tab',async()=>{
 const w=new Window();try{
  w.document.body.innerHTML=(await render(ctx,null,{...base,chats:[
   {id:'denied',title:'Denied',runState:'idle',canArchive:false,archiveBlockedReason:'scheduled'},
   {id:'running',title:'Running',runState:'running',canArchive:true},
   {id:'allowed',title:'Allowed',runState:'idle',canArchive:true},
  ],tabIds:['denied','running','allowed']})).tabs;
  for(const id of ['denied','running','allowed']){
   const archive=w.document.querySelector('[data-project-action="archive"][data-chat-id="'+id+'"]') as any;
   expect(archive.disabled).toBe(id!=='allowed');
   expect((w.document.querySelector('[data-project-action="close"][data-chat-id="'+id+'"]') as any).disabled).toBe(false);
  }
  expect(w.document.querySelector('[data-project-action="archive"][data-chat-id="denied"]')?.getAttribute('title')).toBe('Нельзя архивировать работающий или запланированный чат');
 }finally{await w.happyDOM.close();}
});
