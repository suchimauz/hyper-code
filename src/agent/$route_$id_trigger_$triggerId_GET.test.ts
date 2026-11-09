import { expect, test } from 'bun:test';
import route from './$route_$id_trigger_$triggerId_GET';
test('audit authorizes owner before reading and returns bounded JSON with stored references',async()=>{
 const calls:string[]=[];const ctx:any={fns:{goal:{surfaceAuthorize:async()=>{calls.push('auth');}},procs:{db:{select:async({sql,params}:any)=>{calls.push(sql);expect(params).toContain('t');return sql.includes('FROM agent_triggers')?[{id:'t',prompt:'<script>',status:'completed'}]:[{id:'r',resultRef:{id:'uuid'},outcome:'fired'}];}}}}};
 const response=await route(ctx,null,{req:new Request('http://local/agent/a/trigger/t'),params:{id:'a',triggerId:'t'}});expect(response.status).toBe(200);expect(calls[0]).toBe('auth');expect(calls[2]).toContain('LIMIT 100');expect(await response.json()).toMatchObject({trigger:{prompt:'<script>'},runs:[{resultRef:{id:'uuid'}}],limit:100});expect(response.headers.get('cache-control')).toBe('no-store');
});
test('cross-owner denial performs no audit reads',async()=>{let reads=0;const ctx:any={fns:{goal:{surfaceAuthorize:async()=>{throw Object.assign(new Error('Forbidden'),{status:403});}},procs:{db:{select:async()=>{reads++;return [];}}}}};const response=await route(ctx,null,{req:new Request('http://local'),params:{id:'a',triggerId:'t'}});expect(response.status).toBe(403);expect(reads).toBe(0);});
