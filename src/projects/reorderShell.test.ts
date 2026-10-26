import {expect,test} from 'bun:test';
import layout from '../ui/layout';
import render from './renderChrome';
import button from '../procs/ui/button';
import popup from '../ui/popup';

test('full shell renders with real navigation and shared controls, and only loads reorder for ordinary pages',async()=>{
 const ctx:any={state:{},fns:{procs:{ui:{escape:({text}:any)=>Bun.escapeHTML(String(text??'')),attr:()=>''}},auth:{csrfToken:async()=>''},chat:{icon:()=>''},ui:{faviconUrl:async()=>'/favicon.ico',navMenu:()=>''},dock:{}}};
 ctx.fns.procs.ui.button=(o:any)=>button(ctx,null,o);ctx.fns.ui.popup=(o:any)=>popup(ctx,null,o);
 const chrome=await render(ctx,null,{projects:[{id:'p',title:'Project',dir:'/p',host:''}],projectId:'p',chats:[{id:'a',title:'Chat',runState:'idle'}],tabIds:['a']});
 ctx.fns.dock.render=async()=>'<aside id="project-sidebar">'+chrome.sidebar+'</aside>';
 for(const query of ['', '?embed=1','?presentation=sidebar']){
  const html=await layout(ctx,{url:new URL('http://local/agent/a'+query)} as any,{main:'<div id="project-tabs-host">'+chrome.tabs+'</div><section id="chat-panel"></section>'});
  expect(html).toContain('<!doctype html>');expect(html).toContain('id="chat-panel"');
  expect(html.includes('/projects/reorder.js')).toBe(query==='');expect(html.includes('/projects/navigation.js')).toBe(query==='');
  expect(html).not.toContain('Unsupported button attribute');
 }
});
