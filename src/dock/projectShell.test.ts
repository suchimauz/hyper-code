import {test,expect} from 'bun:test';
import render from './render';
import button from '../procs/ui/button';
const fixture=()=>{
 const entry=(id:string,html:string,pinned?:string)=>({id,label:id,render:()=>html,pinned});
 const ctx:any={fns:{procs:{ui:{escape:({text}:any)=>Bun.escapeHTML(String(text)),attr:()=>''},log:{warn:()=>{}}},dock:{items:async()=>({top:[entry('theme','<button id="theme-toggle">Theme</button>'),entry('agent:idle','Pinned idle','agent'),entry('page:/files','Files','page')],bottom:[entry('update.update','<a id="hyper-update-badge">Update</a>'),entry('llms.quota','Quota')],hidden:[]}),runningAgents:async()=>'<div id="dock-running-agents"><a href="/agent/run">Running</a></div>'},auth:{meBadge:async()=>''}}};
 ctx.fns.procs.ui.button=(o:any)=>button(ctx,null,o);return ctx;
};
test('header owns menu theme and update; bottom shows running instead of pinned chats',async()=>{
 const html=await render(fixture(),null,{});
 const header=html.slice(html.indexOf('project-shell-header'),html.indexOf('id="project-sidebar"'));
 expect(header).toContain('Open global menu');expect(header).toContain('theme-toggle');expect(header).toContain('hyper-update-badge');
 expect(header).not.toContain('dock-item');expect(html).not.toContain('project-brand');expect(html).not.toContain('open-all-chats');expect(html).not.toContain('Pinned idle');
 expect(html).toContain('dock-running-agents');expect(html).not.toContain('>Files<');expect(html).not.toContain('project-shortcuts');expect(html).not.toContain('Shortcuts');expect(html).not.toContain('id="dock-top"');expect(html).toContain('Quota');
 expect((html.match(/id="theme-toggle"/g)||[]).length).toBe(1);expect((html.match(/id="hyper-update-badge"/g)||[]).length).toBe(1);
});
test('header controls remain fixed even when old dock layout hid them',async()=>{
 const ctx=fixture();const items=await ctx.fns.dock.items({});
 items.hidden=items.top.filter((i:any)=>i.id==='theme');items.top=items.top.filter((i:any)=>i.id!=='theme');
 ctx.fns.dock.items=async()=>items;const html=await render(ctx,null,{});
 expect(html).toContain('id="theme-toggle"');expect(html).toContain('data-dock-hidden="[]"');
});
