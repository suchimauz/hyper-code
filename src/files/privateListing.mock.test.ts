import {test,expect} from 'bun:test';
import browserData from './browserData';
import canvasRoute from '../canvas/$route_$id_item_$itemId_POST';

for (const host of [undefined,'remote-test']) {
 test(`private listing filters canonical aliases before response (${host??'local'})`,async()=>{
  const calls:string[]=[];
  const ctx:any={fns:{auth:{verifyCsrf:async()=>true},canvas:{authorizeHttp:async()=>null,fileTarget:async({item}:any)=>({ok:true,path:item.args.path,root:item.args.path,host:item.args.host}),list:async()=>[{id:1,kind:'file',args:{path:'/workspace',host}}]},files:{
   resolveSafe:({path}:any)=>path,
   isPrivateResult:async({path}:any)=>{calls.push(path);return path.endsWith('/hidden-alias');},
   stat:async()=>({isDir:true}),list:async()=>[{name:'visible',isDir:false},{name:'hidden-alias',isDir:true}],
  }}};
  const response=await browserData(ctx,null,{path:'/workspace',host});
  expect((await response.json()).entries).toEqual([{name:'visible',isDir:false}]);
  expect(calls).toContain('/workspace/hidden-alias');
  const canvas=await canvasRoute(ctx,null,{req:new Request('http://localhost/canvas/a/item/1',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':'test'},body:JSON.stringify({fileAction:'read'})}),params:{id:'a',itemId:'1'}});
  expect(canvas.status).toBe(200);
  expect((await canvas.json()).entries).toEqual([{name:'visible',isDir:false}]);
 });
}
