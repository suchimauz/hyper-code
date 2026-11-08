import {test,expect} from 'bun:test';
import handler from './confirms';
import middleware from '../$middleware_ui-lab-api';
function fixture(){
 const writes:any[]=[];
 const input:any={id:'c1',agentId:'a',kind:'confirm',state:'open',title:'Send?',message:'Msg',spec:{details:'**x**',confirmLabel:'Да',declineLabel:'Нет',danger:false,_agentWait:true,token:'hidden'},result:null,createdAt:1,updatedAt:2,error:'hidden',answeredBy:'hidden'};
 const session:any={user:{id:'owner',role:'owner'}};
 const ctx:any={fns:{auth:{csrfToken:async()=>'token',verifyCsrf:async({token}:any)=>token==='token'},procs:{db:{select:async({sql,params}:any)=>sql.includes('FROM agents')?(params[0]==='a'?[{id:'a'}]:[]):[{id:'c1'}]}},input:{get:async({id}:any)=>id===input.id?input:null,submit:async(args:any)=>{if(input.state!=='open')return {state:input.state};writes.push(args);input.state='submitted';input.result={confirmed:args.values.decision==='yes',...(args.values.comment?{comment:args.values.comment}:{})};return {state:'submitted'};}}}};
 const call=(data?:any,over:any={})=>handler(ctx,over.session===undefined?session:over.session,{req:new Request('http://localhost/ui-lab-api/confirms?agentId=a',{method:data===undefined?'GET':'POST',headers:{'content-type':'application/json','x-csrf-token':over.token??'token',...over.headers},...(data===undefined?{}:{body:JSON.stringify(data)})})});
 return {ctx,input,writes,call};
}
test('GET projects only whitelisted confirm fields',async()=>{const f=fixture();const out=await (await f.call()).json();expect(out.inputs[0].spec).toEqual({details:'**x**',confirmLabel:'Да',declineLabel:'Нет',danger:false});expect(JSON.stringify(out)).not.toContain('hidden');f.input.kind='secret';expect((await (await f.call()).json()).inputs).toEqual([]);});
test('POST delivers native decision and trimmed comment once',async()=>{const f=fixture();expect((await f.call({id:'c1',decision:'no',comment:' later '})).status).toBe(200);expect(f.writes).toEqual([{id:'c1',values:{decision:'no',comment:'later'},actor:'owner'}]);expect((await f.call({id:'c1',decision:'yes'})).status).toBe(409);expect((await (await f.call()).json()).inputs[0].result).toEqual({confirmed:false,comment:'later'});});
test('rejects invalid payloads, auth, other kinds',async()=>{
 for(const d of [{id:'c1'},{id:'c1',decision:'maybe'},{id:'c1',decision:'yes',extra:1},{id:'c1',decision:'yes',comment:5}]){const f=fixture();expect((await f.call(d)).status).toBe(400);expect(f.writes).toHaveLength(0);}
 for(const o of [{token:'bad'},{session:{user:{id:'g',role:'member'}}},{headers:{origin:'http://evil.example'}}]){const f=fixture();expect((await f.call({id:'c1',decision:'yes'},o)).status).toBe(403);}
 for(const c of [{agentId:'b'},{kind:'redmine-approval'},{kind:'choice'}]){const f=fixture();Object.assign(f.input,c);expect((await f.call({id:'c1',decision:'yes'})).status).toBe(404);expect(f.writes).toHaveLength(0);}
});
test('middleware dispatches confirms route',async()=>{const f=fixture();f.ctx.fns.frontendBridge={confirms:async()=>new Response('ok')};expect(await (await middleware(f.ctx,{user:{id:'owner'}} as any,{req:new Request('http://localhost/ui-lab-api/confirms?agentId=a')})).text()).toBe('ok');});
