import { test, expect } from 'bun:test';
import get from './$route_GET';
import put from './$route__PUT';
import raw from './$route_raw_GET';
import data from './browserData';

function mock() {
 const calls: string[]=[];
 const ctx:any={fns:{auth:{currentUser:async()=>({required:true,user:{id:'u'}}),verifyCsrf:async()=>true},remote:{servers:async()=>[{name:'box'}]},files:{isPrivateResult:async()=>false,resolveSafe:({path}:any)=>path.startsWith('/')?path:'/workspace/'+path,stat:async()=>({isDir:false,size:4}),read:async()=> 'text',list:async()=>[],write:async()=>{calls.push('write');},rawResponse:async()=>new Response('file')},frontendBridge:{proxy:async({req}:any)=>{calls.push(req.url);return new Response('React entry');}}}};
 ctx.fns.files.browserData=(opts:any)=>data(ctx,null,opts);
 return {ctx,calls};
}
const request=(url='/files?path=/work/a.txt',init?:RequestInit)=>({req:new Request('https://hyper.test'+url,init),params:{}});
test('Files document serves React, JSON serves bounded text',async()=>{
 const {ctx,calls}=mock();expect(await (await get(ctx,null,request())).text()).toBe('React entry');expect(calls[0]).toContain('/ui-lab/');
 const response=await get(ctx,null,request('/files?path=/work/a.txt&format=json'));expect(await response.json()).toMatchObject({path:'/work/a.txt',content:'text'});expect(response.headers.get('cache-control')).toBe('no-store');
});
test('private results and unknown SSH hosts cannot be read',async()=>{
 const {ctx}=mock();expect((await get(ctx,null,request('/files?host=unknown'))).status).toBe(400);ctx.fns.files.isPrivateResult=async()=>true;expect((await get(ctx,null,request())).status).toBe(404);
});
test('save requires auth, CSRF and matching old content; never writes binary',async()=>{
 const {ctx,calls}=mock();const req=()=>request('/files?path=/work/a.txt',{method:'PUT',body:JSON.stringify({content:'next',expectedContent:'text'})});
 ctx.fns.auth.verifyCsrf=async()=>false;expect((await put(ctx,null,req())).status).toBe(403);expect(calls).toEqual([]);
 ctx.fns.auth.verifyCsrf=async()=>true;ctx.fns.files.read=async()=> 'changed';expect((await put(ctx,null,req())).status).toBe(409);expect(calls).toEqual([]);
 ctx.fns.files.read=async()=> 'text';expect((await put(ctx,null,req())).status).toBe(200);expect(calls).toEqual(['write']);
 ctx.fns.files.read=async()=> '\u0000';expect((await put(ctx,null,req())).status).toBe(400);expect(calls).toEqual(['write']);
 ctx.fns.auth.currentUser=async()=>({required:true});expect((await put(ctx,null,req())).status).toBe(401);
});
test('large files skip text decode and raw active previews are sandboxed',async()=>{
 const {ctx}=mock();ctx.fns.files.stat=async()=>({size:2000000,isDir:false});ctx.fns.files.read=async()=>{throw Error('must not decode');};
 expect(await (await data(ctx,null,{path:'/large.txt'})).json()).toMatchObject({preview:true,previewKind:'download'});
 const response=await raw(ctx,null,request('/files/raw?path=/file.html&download=1'));expect(response.headers.get('content-security-policy')).toContain('sandbox;');expect(response.headers.get('content-disposition')).toBe('attachment');
});
