import {test,expect} from 'bun:test';
import queueRequest from './queueRequest';

function fixture(waiting=true,stoppedAt:number|null=null){
 let locked=false;const writes:string[]=[];const rows:any[]=[];
 const ctx:any={fns:{http:{publicOrigin:async()=> 'http://local'},input:{isWaiting:async()=>waiting},events:{emitAgentsChanged:()=>{}},agent:{wakeWorker:()=>{}},procs:{db:{
  transaction:async({fn}:any)=>{locked=true;try{return await fn();}finally{locked=false;}},
  select:async({sql,params}:any)=>sql.includes('FROM agents')?[{id:'a',archived_at:null,parent_id:null,run_state:'idle',stopped_at:stoppedAt}]:sql.includes('request_id=?')?rows.filter(r=>r.requestId===params[1]):[],
  run:async({sql,params}:any)=>{expect(locked).toBe(true);writes.push(sql);if(sql.startsWith('INSERT'))rows.push({id:params[0],version:1,requestId:params[2],fingerprint:params[3]});}
 }}}};
 const send=(method='POST')=>{const form=new FormData();form.set('text','later');form.set('requestId','same');form.append('files',new File(['abc'],'a.txt'));return queueRequest(ctx,{user:{id:'u'}} as any,{params:{id:'a'},req:new Request('http://local/agent/a/queue',{method,headers:{origin:'http://local'},...(method==='POST'?{body:form}:{})})});};
 return {send,writes,rows};
}
test('queue GET exposes authoritative durable input wait',async()=>{expect(await (await fixture().send('GET')).json()).toEqual({waitingForInput:true,items:[]});});
test('queue POST during input wait retains bytes idempotently without scheduling',async()=>{const f=fixture();const first=await (await f.send()).json();expect(first).toMatchObject({ok:true,version:1});expect(await (await f.send()).json()).toMatchObject({queueId:first.queueId,duplicate:true});expect(f.rows).toHaveLength(1);expect(f.writes.filter(s=>s.startsWith('UPDATE agents'))).toHaveLength(0);});
test('queue POST preserves Stop even without an input gate',async()=>{const f=fixture(false,123);expect((await f.send()).status).toBe(200);expect(f.writes.filter(s=>s.startsWith('UPDATE agents'))).toHaveLength(0);});
