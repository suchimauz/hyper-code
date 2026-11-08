import {describe,test,expect} from 'bun:test';
import handler from './newSession';
import middleware from '../$middleware_ui-lab-api';
function fixture(){
 const store=new Map<string,string>(); let creates=0,sends=0,fail=false,csrf=true,project=true;
 const ctx:any={fns:{projects:{principal:async()=> 'user:owner',get:async()=>project?{id:'p',dir:'/checked'}:null},auth:{verifyCsrf:async()=>csrf,csrfToken:async()=> 'token'},settings:{modelDefault:async()=> 'test:one'},llm:{listModels:async()=>({test:['test:one','test:disabled']}),modelPolicy:async()=>({disabledModels:['test:disabled']}),reasoningCapabilities:async()=>({supported:['auto','low','high'],defaultEffort:'high',mode:'effort'}),resolveReasoningEffort:async({effort}:any)=>({applied:effort==='auto'?'high':effort,downgraded:false})},frontendBridge:{iconData:async()=>null},procs:{db:{select:async({sql,params}:any)=>{if(sql.startsWith('SELECT'))return store.has(params[0])?[{value:store.get(params[0])}]:[];if(store.has(params[0]))return [];store.set(params[0],params[1]);return [{key:params[0]}];},run:async({params}:any)=>{store.set(params[1],params[0]);}}},agent:{createFromValues:async(opts:any)=>{expect(opts.projectId).toBe('p');creates++;return {agent:{id:'new'}};},setReasoningEffort:async()=>{},acceptMessage:async({req,params}:any)=>{sends++;expect(params.id).toBe('new');expect(await req.text()).toBe('hello');expect(req.headers.get('idempotency-key')).toBe('request-key-00001');if(fail)throw Error('mock failure');return new Response('ok');}}}};
 const session:any={user:{id:'owner'}};
 const post=(patch:any={},user:any=session)=>handler(ctx,user,{req:new Request('http://localhost/ui-lab-api/new-session',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':'token'},body:JSON.stringify({requestKey:'request-key-00001',projectId:'p',text:'hello',...patch})})});
 return {ctx,session,post,counts:()=>({creates,sends}),setFail:(value=true)=>{fail=value;},setCsrf:()=>{csrf=false;},setProject:()=>{project=false;}};
}
describe('new session isolated mock API',()=>{
 test('GET config without agent or write',async()=>{const f=fixture();const r=await handler(f.ctx,f.session,{req:new Request('http://localhost/ui-lab-api/new-session?model=test:one&effort=low')});const b=await r.json();expect(b.model).toBe('test:one');expect(b.effort.requested).toBe('low');expect(b.csrfToken).toBe('token');expect(b.models[1].disabled).toBe(true);expect(f.counts()).toEqual({creates:0,sends:0});});
 test('same request replay creates and accepts only once',async()=>{const f=fixture();expect((await f.post()).status).toBe(201);const r=await f.post();expect(r.status).toBe(200);expect(await r.json()).toEqual({agentId:'new',projectId:'p',status:'sent'});expect(f.counts()).toEqual({creates:1,sends:1});});
 test('concurrent duplicate claim',async()=>{const f=fixture();const results=await Promise.all([f.post(),f.post(),f.post()]);expect(results.filter(r=>r.status===201)).toHaveLength(1);expect(f.counts()).toEqual({creates:1,sends:1});});
 test('different input same key conflicts',async()=>{const f=fixture();await f.post();expect((await f.post({text:'changed'})).status).toBe(409);expect(f.counts().creates).toBe(1);});
 test('failed acceptance retries same agent without creating another',async()=>{const f=fixture();f.setFail();expect((await f.post()).status).toBe(409);const b=await (await f.post()).json();expect(b.status).toBe('failed');expect(b.agentId).toBe('new');f.setFail(false);const recovered=await f.post();expect(recovered.status).toBe(200);expect((await recovered.json()).status).toBe('sent');expect(f.counts()).toEqual({creates:1,sends:3});await f.post();expect(f.counts()).toEqual({creates:1,sends:3});});
 test('unauthenticated and csrf rejected before creation',async()=>{const f=fixture();expect((await f.post({},null)).status).toBe(401);f.setCsrf();expect((await f.post()).status).toBe(403);expect(f.counts().creates).toBe(0);});
 test('validation precedes creation',async()=>{const f=fixture();for(const patch of [{text:' '},{model:'test:disabled'},{effort:'nonsense'},{effort:'off'},{requestKey:'short'},{workspaceDir:'/arbitrary'}])expect((await f.post(patch)).status).toBe(400);f.setProject();expect((await f.post()).status).toBe(404);expect(f.counts().creates).toBe(0);});
 test('unknown creation outcome fails closed',async()=>{const f=fixture();let attempts=0;f.ctx.fns.agent.createFromValues=async()=>{attempts++;throw Error('uncertain creation');};expect((await f.post()).status).toBe(409);expect((await f.post()).status).toBe(409);expect(attempts).toBe(1);expect(f.counts().sends).toBe(0);});
 test('accepted message with failed final persistence can recover',async()=>{const f=fixture();const run=f.ctx.fns.procs.db.run;let once=true;f.ctx.fns.procs.db.run=async(opts:any)=>{if(once&&JSON.parse(opts.params[0]).status==='sent'){once=false;throw Error('final save failure');}return run(opts);};expect((await f.post()).status).toBe(409);expect((await f.post()).status).toBe(200);expect(f.counts()).toEqual({creates:1,sends:2});});
 test('middleware dispatches GET and POST to handler',async()=>{const f=fixture();let calls=0;f.ctx.fns.frontendBridge.newSession=async()=>{calls++;return new Response('ok');};for(const method of ['GET','POST'])expect((await middleware(f.ctx,f.session,{req:new Request('http://localhost/ui-lab-api/new-session',{method})})).status).toBe(200);expect(calls).toBe(2);});
 test('explicit mascot persists once before first acceptance, retries never overwrite',async()=>{
  for(const mascot of ['crab','deepy','whalegirl','desksprite','bitty','tmuxai','planet','rainbow-terminal-cat']){
   const f=fixture();let updates=0;const run=f.ctx.fns.procs.db.run,accept=f.ctx.fns.agent.acceptMessage;
   f.ctx.fns.procs.db.run=async(opts:any)=>{if(opts.sql.startsWith('UPDATE agents')){expect(opts.params).toEqual([mascot,'new']);updates++;return;}return run(opts);};
   f.ctx.fns.agent.acceptMessage=async(opts:any)=>{expect(updates).toBe(1);return accept(opts);};
   f.setFail();expect((await f.post({mascot})).status).toBe(409);f.setFail(false);
   expect((await f.post({mascot})).status).toBe(200);expect((await f.post({mascot})).status).toBe(200);
   expect((await f.post({mascot:mascot==='crab'?'deepy':'crab'})).status).toBe(409);expect(updates).toBe(1);expect(f.counts().creates).toBe(1);
  }
 });
 test('random and omitted share existing fingerprint and leave SQL DEFAULT untouched',async()=>{
  for(const first of [{},{mascot:'random'}]){const f=fixture();const run=f.ctx.fns.procs.db.run;
   f.ctx.fns.procs.db.run=async(opts:any)=>{expect(opts.sql.startsWith('UPDATE agents')).toBe(false);return run(opts);};
   expect((await f.post(first)).status).toBe(201);expect((await f.post({mascot:'random'})).status).toBe(200);expect((await f.post()).status).toBe(200);
   expect((await f.post({mascot:'crab'})).status).toBe(409);
  }
 });
 test('invalid mascot rejected without creation',async()=>{const f=fixture();for(const mascot of ['','unknown','CRAB',null,1,{},['crab']])expect((await f.post({mascot})).status).toBe(400);expect(f.counts()).toEqual({creates:0,sends:0});});
 test('multipart mascot uses same validation and binding',async()=>{
  const f=fixture();const run=f.ctx.fns.procs.db.run;let updates=0;
  f.ctx.fns.procs.db.run=async(opts:any)=>{if(opts.sql.startsWith('UPDATE agents')){expect(opts.params).toEqual(['planet','new']);updates++;return;}return run(opts);};
  const post=async(mascot:string)=>{const body=new FormData();for(const [k,v] of Object.entries({requestKey:'request-key-00001',projectId:'p',text:'hello',mascot}))body.set(k,v);return handler(f.ctx,f.session,{req:new Request('http://localhost/ui-lab-api/new-session',{method:'POST',headers:{'x-csrf-token':'token'},body})});};
  expect((await post('invalid')).status).toBe(400);expect((await post('planet')).status).toBe(201);expect((await post('planet')).status).toBe(200);expect(updates).toBe(1);
 });
 test('failed mascot persistence fails closed without starting message or retrying configuration',async()=>{
  const f=fixture();const run=f.ctx.fns.procs.db.run;let updates=0;
  f.ctx.fns.procs.db.run=async(opts:any)=>{if(opts.sql.startsWith('UPDATE agents')){updates++;throw Error('mascot update failed');}return run(opts);};
  expect((await f.post({mascot:'crab'})).status).toBe(409);expect((await f.post({mascot:'crab'})).status).toBe(409);expect(updates).toBe(1);expect(f.counts()).toEqual({creates:1,sends:0});
 });
});
