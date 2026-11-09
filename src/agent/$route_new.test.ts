import { test, expect } from 'bun:test';
import get from './$route_new_GET';
import post from './$route_new_POST';
import popup from './createFromPopup';
const ctx: any = { fns: { projects: { get: async ({projectId}: any) => projectId === 'p' ? {id:'p'} : null }, agent: { createFromValues: async (values: any) => ({confirmation:{dir:'/missing',values}}) } } };
test('legacy creation GET preserves defaults and only redirects', async () => {
 const response = await get(ctx,null,{req:new Request('http://localhost/agent/new?popup=1&projectId=p&model=vendor%3Amodel&systemPrompt=hello')});
 const url = new URL(response.headers.get('location')!, 'http://localhost');
 expect(response.status).toBe(303); expect(url.searchParams.get('newSession')).toBe('1'); expect(url.searchParams.get('projectId')).toBe('p'); expect(url.searchParams.get('model')).toBe('vendor:model'); expect(url.searchParams.get('systemPrompt')).toBe('hello'); expect(url.searchParams.has('popup')).toBe(false);
 expect((await get(ctx,null,{req:new Request('http://localhost/agent/new?projectId=missing')})).status).toBe(404);
});
test('legacy creation confirmation is data, never an HTML form or automatic approval',async()=>{
 const body = new FormData();body.set('workspaceDir','/missing');
 const response = await post(ctx,null,{req:new Request('http://localhost/agent/new',{method:'POST',body})});
 expect(response.status).toBe(409);expect((await response.json()).confirmation.values.workspaceDir).toBe('/missing');
 expect((await popup(ctx,null,{workspaceDir:'/missing'})).status).toBe(409);
});
