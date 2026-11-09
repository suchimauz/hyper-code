import {test,expect} from 'bun:test';
import settings from '../settings/browserApi';
import llms from '../llms/settingsApi';
import configGet from '../plugins/$route_$name_config_GET';
import configPost from '../plugins/$route_$name_config_POST';
import news from '../../plugins/news/src/news/authorizeUi';
import dialogs from '../../plugins/telegram/src/telegram/$route_api_dialogs_GET';
import messages from '../../plugins/telegram/src/telegram/$route_api_messages_GET';
import avatar from '../../plugins/telegram/src/telegram/$route_api_avatar_$userId_GET';
import send from '../../plugins/telegram/src/telegram/$route_api_send_POST';
import tracking from '../../plugins/knowledge/src/knowledge/$route_agent_$id_tracking_POST';
const modes = [
 ['owner',{required:true,user:{role:'owner'}},0],
 ['member',{required:true,user:{role:'member'}},403],
 ['open',{required:false,user:null},0],
 ['legacy',{required:true,user:null,legacy:true},0],
 ['invalid legacy',{required:true,user:null,legacy:false},401],
 ['anonymous',{required:true,user:null},401],
] as const;
// A sentinel proves the guard has passed without invoking any real data operation.
const reached=Symbol('authorized');
for(const [name,fn,method] of [['settings',settings,'GET'],['llms',llms,'GET'],['config',configGet,'GET'],['dialogs',dialogs,'GET'],['messages',messages,'GET'],['avatar',avatar,'GET'],['news',news,'GET']] as const){
 for(const [mode,who,denied] of modes)test(`${name}: ${mode}`,async()=>{
 const stop: any=new Proxy(()=>{throw reached;}, {get:()=>stop});
 const ctx:any={fns:new Proxy({auth:{currentUser:async()=>who,verifyCsrf:async()=>true}}, {get:(t,k)=>k in t?(t as any)[k]:stop})};
 const req=new Request('http://localhost/api?chat=1');let status=0;
 try{const response=await (fn as any)(ctx,null,{req,section:'declared',params:{name:'example',userId:'1'}});status=response?.status??0;if((name==='config'&&status===400)||(name==='avatar'&&status===500))status=0;}catch(e){if(e!==reached)throw e;}
 expect(status).toBe(denied);
 });
}
for(const [name,fn] of [['settings',settings],['llms',llms],['config',configPost],['news',news],['send',send],['tracking',tracking]] as const){
 for(const [mode,who,denied] of modes)for(const csrf of [false,true])test(`${name} POST: ${mode}, csrf=${csrf}`,async()=>{
 let checked=false;const ctx:any={fns:{auth:{currentUser:async()=>who,verifyCsrf:async()=>{checked=true;if(csrf)throw reached;return false;}}}};
 const req=new Request('http://localhost/api',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});let status=0;
 try{status=(await (fn as any)(ctx,null,{req,section:'declared',params:{id:'a',name:'example'}}))?.status??0;}catch(e){if(e!==reached)throw e;}
 expect(status).toBe(denied||(!csrf?403:0));expect(checked).toBe(!denied);
 });
}
test('open settings snapshot never returns secret values or defaults',async()=>{
 const ctx:any={fns:{auth:{currentUser:async()=>({required:false,user:null})},settings:{declared:async()=>[{module:'test',key:'token',descriptor:{type:'secret',default:'private-default'},currentValue:'private-value'}]}}};
 const response=await settings(ctx,null,{req:new Request('http://localhost/settings'),section:'declared'});const text=await response.text();expect(response.status).toBe(200);expect(text).not.toContain('private-');expect(JSON.parse(text).items[0].configured).toBe(true);
});
