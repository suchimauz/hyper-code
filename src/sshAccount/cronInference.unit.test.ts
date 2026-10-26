import {expect,test} from 'bun:test';
import fetchSSH from './fetch';
import authorize from '../sshInstance/authorize';
const descriptor={provider:'opencode' as const,instance:'approved',account:'default',model:'deepseek-v4.1-flash'};
const request=()=>({ssh:{instance:descriptor.instance,provider:descriptor.provider,account:descriptor.account},url:'https://opencode.ai/inference/go/openai/v1/chat/completions',init:{method:'POST',body:JSON.stringify({model:descriptor.model,messages:[]})}});
function fixture(){
 const session=Object.freeze({kind:'cron-service'});const map=new WeakMap();
 const scopes=['llm.ssh-inference',{inference:descriptor}];
 const service=Object.freeze({ownerId:'owner',runId:9,taskName:'approved-task',targetFn:'discovery.tick',definitionVersion:3,inference:descriptor,storedScopes:JSON.stringify(scopes)});map.set(session,service);
 let calls=0,connections=0;let live=true;let expire=false;let revokeOnReady=false;
 const ctx:any={session,state:{cron:{inferenceServices:map}}};
 Object.defineProperty(ctx,'fns',{get(){const receiver=this;return {procs:{db:{select:async(o:any)=>{calls++;expect(o.params).toEqual([9,'approved-task','discovery.tick','owner',3]);expect(o.sql).toContain("t.enabled=TRUE");expect(o.sql).toContain("r.status='running'");if(expire)map.delete(session);return live?[{scopes}]:[];}}},sshInstance:{authorize:()=>authorize(receiver,receiver.session,{}),connection:async()=>{connections++;expect(receiver.session).toBeNull();if(revokeOnReady)live=false;return {bin:'python3',args:['-c',"import sys,json\nr=json.loads(sys.stdin.readline())\nprint(json.dumps({'ready':True}),flush=True)\nif sys.stdin.readline().strip()!='dispatch':sys.exit(0)\nprint(json.dumps({'status':200,'headers':{}}),flush=True)\nprint('offline',flush=True)"],host:'fixed-bridge'};}},sshAccount:{inferenceScript:async()=>''}};}});
 return {ctx,session,map,get calls(){return calls;},get connections(){return connections;},revoke(){live=false;},expireDuringDb(){expire=true;},revokeAfterConnection(){revokeOnReady=true;}};
}
test('active exact grant streams only fixed bridge and never exposes SSH management',async()=>{
 const f=fixture();const r=await fetchSSH(f.ctx,f.session,request());expect(await r.text()).toBe('offline\n');expect(f.calls).toBe(2);expect(f.connections).toBe(1);
 await expect(f.ctx.fns.sshInstance.authorize({})).rejects.toThrow('Only owners');
});
test('wrong instance/account/provider/model/url/method/body denied before connection',async()=>{
 const cases=[{ssh:{...request().ssh,instance:'other'}},{ssh:{...request().ssh,account:'other'}},{ssh:{...request().ssh,provider:'codex'}},{init:{method:'POST',body:'{"model":"other"}'}},{url:'https://opencode.ai/inference/openai/v1/chat/completions'},{url:request().url+'?'},{url:request().url+'#'},{url:request().url+'/'},{url:'https://evil.test/'},{init:{method:'DELETE',body:request().init.body}},{init:{method:'POST',body:'[]'}}];
 for(const patch of cases){const f=fixture();await expect(fetchSSH(f.ctx,f.session,{...request(),...patch} as any)).rejects.toThrow();expect(f.connections).toBe(0);}
});
test('forged session and expired capabilities cannot acquire transport',async()=>{
 for(const session of [{kind:'cron-service'},{kind:'cron-service',scopes:['llm.ssh-inference'],inference:descriptor}]){const f=fixture();f.ctx.session=session;await expect(fetchSSH(f.ctx,session as any,request())).rejects.toThrow('Only owners');expect(f.connections).toBe(0);}
 const f=fixture();f.map.delete(f.session);await expect(fetchSSH(f.ctx,f.session,request())).rejects.toThrow('Only owners');
});
test('revoked, changed definition, paused task and expiration fail live DB check',async()=>{
 const f=fixture();f.revoke();await expect(fetchSSH(f.ctx,f.session,request())).rejects.toThrow('Revoked');expect(f.connections).toBe(0);
 const e=fixture();e.expireDuringDb();await expect(fetchSSH(e.ctx,e.session,request())).rejects.toThrow('Revoked');expect(e.connections).toBe(0);
});
test('revocation after connection refuses dispatch and cleans local child',async()=>{
 const f=fixture();f.revokeAfterConnection();await expect(fetchSSH(f.ctx,f.session,request())).rejects.toMatchObject({transportFailure:{phase:'before_dispatch'}});expect(f.calls).toBe(2);
});
test('catalogue is exact read-only Go route, never quota or arbitrary fetch',async()=>{
 const f=fixture();const r=await fetchSSH(f.ctx,f.session,{...request(),url:'https://opencode.ai/inference/go/v1/models',init:{method:'GET'}});expect(await r.text()).toBe('offline\n');
 for(const [url,init] of [['https://opencode.ai/inference/go/v1/usage',{method:'GET'}],['https://opencode.ai/inference/go/v1/models',{method:'POST'}],['https://opencode.ai/v2/docs/console/go',{method:'GET',body:'{}'}]] as const){const x=fixture();await expect(fetchSSH(x.ctx,x.session,{...request(),url,init})).rejects.toThrow();expect(x.connections).toBe(0);}
});
