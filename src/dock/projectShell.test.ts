import {test,expect} from 'bun:test';
import render from './render';
import button from '../procs/ui/button';
import popup from '../ui/popup';
import attr from '../procs/ui/attr';
const fixture=()=>{
 const entry=(id:string,html:string,pinned?:string)=>({id,label:id,render:()=>html,pinned});
 const ctx:any={fns:{procs:{ui:{escape:({text}:any)=>Bun.escapeHTML(String(text)),attr:()=>''},log:{warn:()=>{}}},dock:{items:async()=>({top:[entry('theme','<button id="theme-toggle">Theme</button>'),entry('agent:idle','Pinned idle','agent'),entry('page:/files','Files','page')],bottom:[entry('update.update','<a id="hyper-update-badge">Update</a>'),entry('llms.quota','Quota')],hidden:[]}),runningAgents:async()=>'<div id="dock-running-agents"><a href="/agent/run">Running</a></div>'},auth:{meBadge:async()=>''}}};
 ctx.fns.ui={popup:(o:any)=>popup(ctx,null,o)};
 ctx.fns.procs.ui.attr=(o:any)=>attr(ctx,null,o);
 ctx.fns.procs.ui.button=(o:any)=>button(ctx,null,o);return ctx;
};
test('header offers search/new chat/collapse; footer owns theme/update and visible quotas',async()=>{
 const html=await render(fixture(),null,{});
 const header=html.slice(html.indexOf('project-shell-header'),html.indexOf('id="project-sidebar"'));
 expect(header).toContain('Open global menu');expect(header).toContain('sidebar-search');expect(header).toContain('ui.newAgentPopup');expect(header).toContain('toggle-sidebar');
 const footer=html.slice(html.indexOf('class="dock-footer"'));
 expect(footer).toContain('theme-toggle');expect(footer).toContain('hyper-update-badge');expect(footer).toContain('id="dock-limits"');
 expect(header).not.toContain('dock-item');expect(html).not.toContain('project-brand');expect(html).not.toContain('open-all-chats');expect(html).not.toContain('Pinned idle');
 expect(html).toContain('dock-running-agents');expect(html).not.toContain('>Files<');expect(html).not.toContain('project-shortcuts');expect(html).not.toContain('Shortcuts');expect(html).not.toContain('id="dock-top"');expect(html).toContain('Quota');
 expect((html.match(/id="theme-toggle"/g)||[]).length).toBe(1);expect((html.match(/id="hyper-update-badge"/g)||[]).length).toBe(1);
});
test('fixed utilities remain available even when old dock layout hid them',async()=>{
 const ctx=fixture();const items=await ctx.fns.dock.items({});
 items.hidden=items.top.filter((i:any)=>i.id==='theme');items.top=items.top.filter((i:any)=>i.id!=='theme');
 ctx.fns.dock.items=async()=>items;const html=await render(ctx,null,{});
 expect(html).toContain('id="theme-toggle"');expect(html).toContain('data-dock-hidden="[]"');
});

test('new-chat is an accessible plus beside search and utilities share the account row',async()=>{
 const ctx=fixture();ctx.fns.auth.meBadge=async()=>'<button class="account-trigger">Person</button>';
 const html=await render(ctx,null,{});
 const actions=html.slice(html.indexOf('class="dock-primary-actions"'),html.indexOf('class="dock-navigation-scroll"'));
 expect(actions.indexOf('dock-search')).toBeLessThan(actions.indexOf('dock-new-chat'));
 expect(actions).toContain('ph-plus');expect(actions).toContain('aria-label="Новый чат"');
 expect(actions).not.toContain('>Новый чат</span>');
 const account=html.slice(html.indexOf('class="dock-account-row"'));
 expect(account).toContain('account-trigger');expect(account).toContain('theme-toggle');expect(account).toContain('hyper-update-badge');
 expect(account.indexOf('account-trigger')).toBeLessThan(account.indexOf('dock-utilities'));
});
