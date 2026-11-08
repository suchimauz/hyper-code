import {test,expect} from 'bun:test';
import compact from './compact';
function fixture(){
 let row:any=null,tx=false,calls=0,fail=false,release:(()=>void)|null=null;
 const events:any[]=[];
 const ctx:any={state:{agent:{a:{id:'a'}}},fns:{}};
 ctx.fns={procs:{events:{refresh:()=>{}},db:{transaction:async({fn}:any)=>{tx=true;try{return await fn();}finally{tx=false;}},select:async({sql}:any)=>sql.includes('FROM agents')?[{id:'a',archived_at:null}]:sql.includes('SELECT command_text')?(row?[row]:[]):[],run:async({sql,params}:any)=>{if(sql.startsWith('INSERT INTO agent_command_requests'))row={command_text:params[2],result:JSON.parse(params[3])};else if(sql.startsWith('UPDATE agent_command_requests'))row.result=JSON.parse(params[0]);else throw Error(sql);return {changes:1};}}},planning:{assertIdle:async()=>{}},commands:{recordEvent:async(e:any)=>{expect(tx).toBe(true);events.push(e);}},session:{syncAgentState:async()=>{}},agent:{compactContext:async()=>{expect(tx).toBe(false);calls++;if(release)await new Promise<void>(resolve=>{release=resolve;});if(fail)throw Error('engine failed');return {status:'not_needed',tokensBefore:10};}}};
 const run=(key='key',text='/compact focus')=>compact(ctx,null,{agentId:'a',text,requestId:key});
 return {ctx,events,run,calls:()=>calls,row:()=>row,fail:()=>{fail=true;},block:()=>{release=()=>{};},release:()=>release?.()};
}
test('compact uses existing engine outside transaction; exact replay does not invoke it twice',async()=>{
 const f=fixture();const result=await f.run();expect(result).toMatchObject({command:'compact',status:'completed',scheduled:false,result:{status:'not_needed'}});expect(f.calls()).toBe(1);
 expect(await f.run()).toMatchObject({duplicate:true,status:'completed'});expect(f.calls()).toBe(1);expect(f.events.map(e=>e.type)).toEqual(['command_invocation','command_result']);
 await expect(f.run('key','/compact changed')).rejects.toThrow('reused');
});
test('concurrent retry sees running without second engine call',async()=>{
 const f=fixture();f.block();const first=f.run();while(!f.calls())await Bun.sleep(1);
 expect(await f.run()).toMatchObject({duplicate:true,status:'running'});expect(f.calls()).toBe(1);f.release();await first;
});
test('failed engine result is durable and not automatically retried',async()=>{
 const f=fixture();f.fail();expect(await f.run()).toMatchObject({ok:false,status:'failed',error:'engine failed'});expect(await f.run()).toMatchObject({duplicate:true,status:'failed'});expect(f.calls()).toBe(1);
});
test('orphan running claim becomes interrupted, never reruns engine',async()=>{
 const f=fixture();await f.run();f.row().result.status='running';f.ctx.state.commandOperations=new Set();
 expect(await f.run()).toMatchObject({ok:false,status:'interrupted',duplicate:true});expect(f.calls()).toBe(1);expect(f.events.at(-1).status).toBe('interrupted');
});
