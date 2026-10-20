import {expect,test} from 'bun:test';
import post from './$route_POST';
const owner = {user:{role:'owner'}} as unknown as Session;
function fixture(){
 const calls:Array<{action:string;opts:object}>=[];
 const fns=Object.fromEntries(['save','trust','remove'].map(action=>[action,async(opts:object)=>{calls.push({action,opts});}]));
 return {calls,ctx:{fns:{sshInstance:fns}} as unknown as Context};
}
function req(values:Record<string,string>,origin='http://localhost'){
 return new Request('http://localhost/sshInstance',{method:'POST',headers:{origin},body:new URLSearchParams(values)});
}
test('editing dispatches only entered endpoint fields under stable instance name',async()=>{
 const {ctx,calls}=fixture();
 const res=await post(ctx,owner,{req:req({action:'save',name:'box',host:'new.example',user:'runner',port:'2222'}),params:{}});
 expect(res.status).toBe(303);expect(res.headers.get('location')).toContain('result=success');
 expect(calls).toEqual([{action:'save',opts:{name:'box',host:'new.example',user:'runner',port:2222}}]);
});
test('removal and trust replacement reject unchecked confirmation before mutation',async()=>{
 for(const action of ['remove','trust']){
  const {ctx,calls}=fixture();
  const res=await post(ctx,owner,{req:req({action,name:'box',replace:'yes',hostKey:'key'}),params:{}});
  expect(res.headers.get('location')).toContain('result=error');expect(calls).toEqual([]);
 }
});
test('confirmed removal and replacement use exact explicit backend options',async()=>{
 const {ctx,calls}=fixture();
 await post(ctx,owner,{req:req({action:'remove',name:'box',confirmed:'yes'}),params:{}});
 await post(ctx,owner,{req:req({action:'trust',name:'box',confirmed:'yes',replace:'yes',hostKey:'ssh-ed25519 key'}),params:{}});
 expect(calls).toEqual([{action:'remove',opts:{name:'box',confirmed:true}},{action:'trust',opts:{name:'box',confirmed:true,replace:true,hostKey:'ssh-ed25519 key'}}]);
});
test('cross-origin and non-owner edit/remove remain forbidden',async()=>{
 for(const action of ['save','remove','trust']){
  const {ctx,calls}=fixture();
  expect((await post(ctx,owner,{req:req({action},'http://attacker.invalid'),params:{}})).status).toBe(403);
  expect((await post(ctx,null,{req:req({action}),params:{}})).status).toBe(403);
  expect(calls).toEqual([]);
 }
});
