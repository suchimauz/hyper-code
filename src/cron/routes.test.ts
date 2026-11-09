import {test,expect} from 'bun:test';
import page from './$route__GET';
import detail from './$route_$name_GET';
import add from './$route_add_POST';
import defer from './$route_defer_POST';
import enabled from './$route_enabled_POST';
import remove from './$route_remove_POST';
import run from './$route_run-now_POST';
import api from '../frontendBridge/cronTasks';
const owner={user:{id:'test',role:'owner'}} as any;
const request=(body:object,token='token')=>new Request('http://localhost/cron/add',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':token},body:JSON.stringify(body)});
function fixture(session:any=owner){const calls:any[]=[];const ctx:any={fns:{auth:{verifyCsrf:async({token}:any)=>token==='token',csrfToken:async()=>'token'},cron:{list:async({name}:any)=>name==='existing'?[{name}]:[],add:async(o:any)=>{calls.push(['add',o]);return o;},defer:async(o:any)=>{calls.push(['defer',o]);return o;},setEnabled:async(o:any)=>calls.push(['enabled',o]),remove:async(o:any)=>calls.push(['remove',o]),runNow:async(o:any)=>calls.push(['run',o])},frontendBridge:{}}};ctx.fns.frontendBridge.cronTasks=({req}:any)=>api(ctx,session,{req});return {ctx,calls};}
test('legacy documents redirect to React',async()=>{for(const route of [page,detail]){const r=await route({} as any,null,{req:new Request('http://localhost/cron'),params:{}});expect(r.status).toBe(302);expect(r.headers.get('location')).toBe('/?view=automation');}});
test('JSON adapters delegate all mutations without rendering HTML',async()=>{const f=fixture();for(const [route,data] of [[add,{name:'new',fn:'cron.list',every:'1h'}],[defer,{name:'once',fn:'cron.list',every:'1m'}],[enabled,{name:'existing',enabled:false}],[remove,{name:'existing'}],[run,{name:'existing'}]] as const){const r=await route(f.ctx,owner,{req:request(data)});expect(r.status).toBe(200);expect(r.headers.get('content-type')).toContain('application/json');}expect(f.calls.map(c=>c[0])).toEqual(['add','defer','enabled','remove','run']);expect(f.calls[1][1].in).toBe('1m');});
test('unauthorized or missing CSRF cannot schedule',async()=>{for(const session of [null,{user:{role:'member'}}]){const f=fixture(session);expect((await add(f.ctx,session,{req:request({name:'new',fn:'cron.list',every:'1h'})})).status).toBe(session?403:401);expect(f.calls).toEqual([]);}const f=fixture();expect((await add(f.ctx,owner,{req:request({name:'new',fn:'cron.list',every:'1h'},'bad')})).status).toBe(403);expect(f.calls).toEqual([]);});
