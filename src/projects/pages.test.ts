import { describe, test, expect } from 'bun:test';
import view from './$route_view_GET.ts';
import archive from './$route_archive_GET.ts';
import { readWorkspaceView } from '../../frontend/src/lib/workspaceView.ts';
const fixture = () => ({ fns: { projects: {
 get: async () => ({id:'p',title:'Project',archived:false}),
 tabs: async () => ({activeId:'chat'}),
 chats: () => { throw Error('Legacy index must not read chat lists'); },
} } }) as any;
describe('project React compatibility links', () => {
 test('list and archive links select native filters without rendering old HTML', async () => {
  for(const [query, filter] of [['list=1','active'], ['archive=1','archived']]) {
   const response = await view(fixture(), null, {req:new Request('http://local/projects/view?projectId=p&'+query)}) as Response;
   expect(response.status).toBe(302);
   expect(response.headers.get('Location')).toBe('/?workspaceProject=p&workspaceFilter='+filter);
   expect(response.headers.get('Cache-Control')).toBe('no-store');
   expect(await response.text()).toBe('');
  }
 });
 test('missing or unauthorized projects remain 404',async()=>{
  const ctx=fixture();ctx.fns.projects.get=async()=>null;
  expect(await view(ctx,null,{req:new Request('http://local/projects/view?projectId=foreign&list=1')})).toMatchObject({status:404});
 });
 test('global archive links to React without legacy reads or writes', async()=>{
  const response=await archive({} as any,null,{req:new Request('http://local/projects/archive')});
  expect(response.headers.get('Location')).toBe('/?workspaceFilter=archived');
 });
 test('default navigation retains read-only persisted active tab and HTMX compatibility',async()=>{
  for(const hx of [false,true]) {
   const response=await view(fixture(),null,{req:new Request('http://local/projects/view?projectId=p',{headers:hx?{'HX-Request':'true'}:{}})}) as Response;
   expect(response.status).toBe(hx?200:302);
   expect(response.headers.get(hx?'HX-Location':'Location')).toContain('/agent/chat');
  }
 });
 test('React filter honors legacy links even when browser storage is unavailable',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
  try {
   Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{search:'?workspaceFilter=archived'}}});
   expect(readWorkspaceView().filter).toBe('archived');
   Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{search:'?workspaceFilter=bogus'}}});
   expect(readWorkspaceView().filter).toBe('active');
  } finally { if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window'); }
 });
});
