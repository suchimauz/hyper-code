import {expect,test} from 'bun:test';
import grant from './grant';
import runOne from './runOne';
import authority from './authority';
const inference={provider:'opencode' as const,instance:'approved',account:'default' as const,model:'deepseek-v4.1-flash'};
const opts={name:'discovery',fn:'discovery.tick',scopes:['llm.ssh-inference','notification.enqueue'],inference};
function fixture(){
 const ctx:any={state:{cron:{runCapabilities:new WeakMap()}},session:null};let stored:any;let eligible=true;let captured:any;
 Object.defineProperty(ctx,'fns',{get(){const c=this;return {auth:{currentUser:async()=>({user:{id:'owner',role:'owner'}})},procs:{db:{select:async(o:any)=>{
 if(o.sql.startsWith('INSERT')){stored={owner_id:o.params[0],scopes:JSON.parse(o.params[1])};return [{definition_version:3}];}
 if(o.sql.startsWith('SELECT * FROM cron_runs'))return [{id:9,task_name:'discovery',fn:'discovery.tick',authority_version:3,args:{}}];
 expect(o.params).toEqual(['discovery','discovery.tick',3]);expect(o.sql).toContain('t.authority_version=g.definition_version');return eligible&&stored?[stored]:[];
 },run:async()=>{}}},discovery:{tick:async()=>{captured={ctx:c,session:c.session,inference:ctx.state.cron.inferenceServices.get(c.session),notification:await authority(c,c.session,{scope:'notification.enqueue'})};return {ok:true};}},cron:{wakeWorker:()=>{}}};}});
 return {ctx,get captured(){return captured;},get stored(){return stored;},invalidate(){eligible=false;},async grant(){return grant(ctx,{req:new Request('http://localhost')} as any,opts);},async run(authorized=true){const s=authorized?{}:null;if(s)ctx.state.cron.runCapabilities.set(s,9);return runOne(ctx,s as any,{id:9});}};
}
test('owner HTTP inference grant persists exact descriptor beside compatible notification string',async()=>{
 const f=fixture();expect((await f.grant()).definitionVersion).toBe(3);expect(f.stored.scopes).toEqual([...opts.scopes,{inference}]);await f.run();expect(f.captured.inference.inference).toEqual(inference);expect(f.captured.inference.ownerId).toBe('owner');expect(f.captured.notification.ownerId).toBe('owner');expect(f.captured.session.kind).toBe('cron-service');expect(Object.isFrozen(f.captured.session)).toBe(true);expect(f.ctx.state.cron.inferenceServices.get(f.captured.session)).toBeUndefined();expect(await authority(f.captured.ctx,f.captured.session,{scope:'notification.enqueue'})).toBeNull();
});
test('legacy direct runs and stale definition never acquire inference or notifications',async()=>{
 for(const authorized of [false,true]){const f=fixture();await f.grant();if(authorized)f.invalidate();await f.run(authorized);expect(f.captured.inference).toBeUndefined();expect(f.captured.notification).toBeNull();}
});
test('owner HTTP required and descriptor/scopes cannot be forged',async()=>{
 const f=fixture();for(const session of [null,{kind:'cron-service'},{kind:'agent',req:new Request('http://localhost')},{kind:'repl'}])await expect(grant(f.ctx,session as any,opts)).rejects.toThrow();
 for(const patch of [{scopes:['*']},{inference:{...inference,account:'root'}},{inference:{...inference,model:'other'}},{inference:{...inference,provider:'codex'}},{inference:{...inference,admin:true}},{scopes:['llm.ssh-inference'],inference:undefined}])await expect(grant(f.ctx,{req:new Request('http://localhost')} as any,{...opts,...patch} as any)).rejects.toThrow();
});
