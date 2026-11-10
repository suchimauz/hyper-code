import {test,expect} from 'bun:test';
import handler from './grids';
import gridKind from '../input/$input_grid';
function fixture(){
 const writes:any[]=[];
 const input:any={id:'g1',agentId:'a',kind:'grid',state:'open',title:'Pick',message:'Msg',spec:{rows:[{id:'1',name:'Alpha',secret:'hidden'},{id:'2',name:'Beta',secret:'hidden'}],columns:[{key:'name',label:'Name'}],valueKey:'id',labelKey:'name',multiple:true},result:null,createdAt:1,updatedAt:2,error:'hidden',answeredBy:'hidden'};
 const ctx:any={state:{input:{kinds:{grid:gridKind}}},fns:{auth:{csrfToken:async()=>'token',verifyCsrf:async({token}:any)=>token==='token'},procs:{db:{select:async({sql,params}:any)=>sql.includes('FROM agents')?(params[0]==='a'?[{id:'a'}]:[]):[{id:'g1'}]}},input:{get:async({id}:any)=>id===input.id?input:null,submit:async(args:any)=>{if(input.state!=='open')return {state:input.state};writes.push(args);input.state=args.cancel?'cancelled':'submitted';return {state:input.state};}}}};
 const call=(data?:any,over:any={})=>handler(ctx,over.session===undefined?{user:{id:'owner',role:'owner'}}:over.session,{req:new Request('http://localhost/ui-lab-api/grids?agentId=a'+(over.query??''),{method:data===undefined?'GET':'POST',headers:{'content-type':'application/json','x-csrf-token':over.token??'token',...over.headers},...(data===undefined?{}:{body:JSON.stringify(data)})})});
 return {input,writes,call};
}
test('GET lists whitelisted grid projection without rows',async()=>{const f=fixture();const out=await (await f.call()).json();expect(out.inputs[0].spec).toEqual({columns:[{label:'Name'}],multiple:true});expect(JSON.stringify(out)).not.toContain('hidden');expect(JSON.stringify(out)).not.toContain('Alpha');f.input.kind='secret';expect((await (await f.call()).json()).inputs).toEqual([]);});
test('GET search returns only column cells',async()=>{const f=fixture();const out=await (await f.call(undefined,{query:'&id=g1&q=bet'})).json();expect(out.rows).toEqual([{value:'2',cells:['Beta']}]);expect(JSON.stringify(out)).not.toContain('hidden');});
test('POST delivers picks and cancel through input.submit once',async()=>{
 let f=fixture();expect((await f.call({id:'g1',values:['1','2']})).status).toBe(200);expect(f.writes).toEqual([{id:'g1',values:{pick:['1','2']},actor:'owner'}]);expect((await f.call({id:'g1',values:['1']})).status).toBe(409);
 f=fixture();expect((await f.call({id:'g1',cancel:true})).status).toBe(200);expect(f.writes).toEqual([{id:'g1',cancel:true,actor:'owner'}]);
});
test('rejects invalid payloads, auth, other kinds',async()=>{
 for(const d of [{id:'g1'},{id:'g1',values:[]},{id:'g1',values:[1]},{id:'g1',values:['1'],extra:1},{id:'g1',cancel:false},{id:'g1',cancel:true,values:['1']}]){const f=fixture();expect((await f.call(d)).status).toBe(400);expect(f.writes).toHaveLength(0);}
 for(const o of [{token:'bad'},{session:{user:{id:'g',role:'member'}}},{headers:{origin:'http://evil.example'}}]){const f=fixture();expect((await f.call({id:'g1',values:['1']},o)).status).toBe(403);}
 for(const c of [{agentId:'b'},{kind:'choice'}]){const f=fixture();Object.assign(f.input,c);expect((await f.call({id:'g1',values:['1']})).status).toBe(404);expect(f.writes).toHaveLength(0);}
});
test('submitted grid projects only visible cells of picked rows for history',async()=>{const f=fixture();f.input.state='submitted';f.input.result={values:['2'],rows:[{id:'2',name:'Beta',secret:'hidden'}]};const out=await (await f.call()).json();expect(out.inputs[0].result).toEqual({rows:[['Beta']]});expect(JSON.stringify(out)).not.toContain('hidden');f.input.state='cancelled';expect((await (await f.call()).json()).inputs[0].result).toBeNull();});
