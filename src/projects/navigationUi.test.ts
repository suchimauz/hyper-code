import {describe,test,expect} from 'bun:test';
import action from './$route_action_POST.ts';
const fixture=()=>({fns:{auth:{verifyCsrf:async()=>true},projects:{get:async()=>({id:'p'}),closeTab:async()=>({tabIds:[],activeId:null})}}}) as any;
describe('project mutation boundaries after legacy page removal',()=>{
 test('project archive and restore retain existing action contract',async()=>{
  const ctx=fixture();const calls:any[]=[];ctx.fns.projects.setArchived=async(o:any)=>calls.push(o);
  for(const a of ['archive-project','restore-project']){const r=await action(ctx,null,{req:new Request('http://local/projects/action',{method:'POST',body:JSON.stringify({action:a,projectId:'p'})})});expect(r.status).toBe(200);}
  expect(calls).toEqual([{projectId:'p',archived:true},{projectId:'p',archived:false}]);
 });
 test('cross-origin action lacking csrf cannot touch project APIs',async()=>{const ctx=fixture();ctx.fns.auth.verifyCsrf=async()=>false;ctx.fns.projects.create=()=>{throw Error('must not write')};const r=await action(ctx,null,{req:new Request('http://local/projects/action',{method:'POST',headers:{origin:'http://evil'},body:JSON.stringify({action:'create',dir:'/x'})})});expect(r.status).toBe(403);});
 test('close supplies fallback without assuming another window active chat',async()=>{const ctx=fixture();const r=await action(ctx,null,{req:new Request('http://local/projects/action',{method:'POST',body:JSON.stringify({action:'close',projectId:'p',agentId:'a'})})});expect(await r.json()).toEqual({ok:true,fallbackUrl:'/projects/view?projectId=p'});});
});
