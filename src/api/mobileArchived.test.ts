import { expect, test } from 'bun:test';
import message from './$route_v1_agents_$id_messages_POST';
import model from './$route_v1_agents_$id_model_POST';
import inject from './$route_v1_agents_$id_inject_POST';
import effort from '../agent/$route_$id_effort_POST';
import detail from './$route_v1_agents_$id_GET';
import events from './$route_v1_agents_$id_events_GET';

for (const [name, route] of Object.entries({message,model,inject,effort})) {
 test(`${name} rejects archived chat before reading body or mutating`,async()=>{
  const ctx:any={state:{agent:{ab:{id:'ab'}}},fns:{procs:{db:{select:async()=>[{archived_at:123}]}}}};
  const req=new Request('http://localhost/',{method:'POST',body:'invalid body'});
  const response=await route(ctx,null,{req,params:{id:'ab'}});
  expect(response.status).toBe(409);expect(await response.json()).toMatchObject({error:'archived'});expect(req.bodyUsed).toBe(false);
 });
}
test('message rechecks archive under row lock before uploading or appending',async()=>{
 let reads=0;
 const ctx:any={state:{agent:{ab:{id:'ab'}}},fns:{procs:{db:{select:async()=>[{id:'ab',archived_at:++reads===1?null:123}],transaction:async({fn}:any)=>fn()}}}};
 const form=new FormData();form.append('files',new File(['hello'],'test.txt'));
 const response=await message(ctx,null,{req:new Request('http://localhost/',{method:'POST',body:form}),params:{id:'ab'}});
 expect(response.status).toBe(409);expect(reads).toBe(2);
});
for(const archived_at of [null,123]){
 test(`detail and events expose archived=${archived_at!=null}`,async()=>{
  const ctx:any={state:{agent:{}},fns:{session:{getMaxEventIdx:async()=>-1,getEvents:async()=>[]},procs:{db:{select:async({sql}:any)=>sql.includes('FROM agent_runs')?[]:[{id:'ab',archived_at,run_state:'idle'}]}}}};
  const opts={req:new Request('http://localhost/'),params:{id:'ab'}};
  const detailBody = await (await detail(ctx,null,opts)).json() as {agent:{archived:boolean}};
  const eventsBody = await (await events(ctx,null,opts)).json() as {archived:boolean};
  expect(detailBody.agent.archived).toBe(archived_at!=null);
  expect(eventsBody.archived).toBe(archived_at!=null);
 });
}
