import { test, expect } from 'bun:test';
import functions from './$route_functions_GET';
import search from './$route_search_GET';
const session = {user:{id:'reader'}} as unknown as Session;
const meta = {name:'sample.read',summary:'Read data',doc:'Full docs',optsType:'{ path: string }',returnType:'Promise<string>',paramsSchema:{properties:{path:{type:'string',description:'File path'}},required:['path']},rel:'sample/read.ts',line:1};
const calls: unknown[]=[];
const ctx = {fns:{runtime:{docs:{list:()=>[{name:meta.name}],get:()=>meta,search:async(opts:unknown)=>{calls.push(opts);return [{name:meta.name,bm25:3}];}}},session:{searchBm25:async(opts:unknown)=>{calls.push(opts);return [{agentId:'a',idx:2,role:'user',score:1,snippet:'<b>hello</b>'}];}}}} as unknown as Context;
const req=(path:string,json=true)=>({req:new Request(`http://localhost${path}`,{headers:json?{accept:'application/json'}:{}}),params:{}});
test('documentation and transcript data require a signed-in visitor',async()=>{
  for(const route of [functions,search])expect((await route(ctx,null,req('/'))).status).toBe(401);
});
test('legacy browser routes redirect with their filters',async()=>{
  for(const [route,path,view,filter] of [[functions,'/functions?q=read&namespace=sample','functions','namespace'],[search,'/search?q=read&agent=a','search','agent']] as const){
    const response=await route(ctx,session,req(path,false));expect(response.status).toBe(303);
    const url=new URL(response.headers.get('location')!,'http://localhost');expect(url.searchParams.get('view')).toBe(`extension:documentation/${view}`);expect(url.searchParams.get('q')).toBe('read');expect(url.searchParams.has(filter)).toBe(true);
    expect(response.headers.get('cache-control')).toBe('no-store');
  }
});
test('functions JSON preserves complete docs, ranking and namespaces',async()=>{
  const response=await functions(ctx,session,req('/functions?q=read&namespace=sample'));
  const data=await response.json();expect(data.docs[0]).toEqual({...meta,ranking:{name:meta.name,bm25:3}});expect(data.namespaces).toEqual(['sample']);expect(response.headers.get('vary')).toBe('Accept');
  expect((await (await functions(ctx,session,req('/functions?namespace=other'))).json()).docs).toEqual([]);
});
test('transcript JSON keeps BM25 snippets and optional agent filter',async()=>{
  const data=await (await search(ctx,session,req('/search?q=hello&agent=a'))).json();expect(data.hits[0].snippet).toBe('<b>hello</b>');expect(calls).toContainEqual({q:'hello',agentId:'a',limit:30});
  expect((await (await search(ctx,session,req('/search'))).json()).hits).toEqual([]);
});
