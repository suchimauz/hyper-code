import { expect, test } from 'bun:test';
import route from './$route_online_GET';

function fixture(role?:string) {
  const rows=[{id:'a',name:'Alice',tabs:2,agents:['private-chat']},{id:'b',name:'Disabled',tabs:1,agents:[]},{id:'local',tabs:1,agents:[]},{id:'missing',tabs:1,agents:[]}];
  let reads=0;
  const ctx:any={fns:{auth:{listUsers:async()=>{reads++;return [{id:'a',disabledAt:null},{id:'b',disabledAt:123}];}},procs:{events:{presence:()=>rows}}}};
  const session:any=role?{user:{id:'a',role}}:{};
  const call=(accept='application/json')=>route(ctx,session,{req:new Request('http://localhost/auth/online?agent=private-chat',{headers:{accept}}),params:{}});
  return {call,rows,reads:()=>reads};
}
test('presence refuses anonymous and members before reading people',async()=>{
  for(const [role,status] of [[undefined,401],['member',403]] as const){const f=fixture(role);expect((await f.call()).status).toBe(status);expect(f.reads()).toBe(0);}
});
test('presence JSON is owner-only minimal allowlisted active ids, no chat or identity data',async()=>{
  const f=fixture('owner');const response=await f.call();expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.json()).toEqual({onlineIds:['a']});
  f.rows.length=0;expect(await (await f.call()).json()).toEqual({onlineIds:[]});
});
test('presence browser visits redirect to native People without reading people',async()=>{
  const f=fixture('owner');const response=await f.call('text/html');expect(response.status).toBe(303);expect(response.headers.get('location')).toBe('/?view=people');expect(f.reads()).toBe(0);
});
