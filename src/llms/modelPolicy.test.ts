import { test, expect } from 'bun:test';
import model from './$route_model-state_POST';
import tier from './$route_minimax_settings_POST';
import instance from './$route_plan_instance_POST';

// All persistence/auth are stubs: this suite never writes runtime configuration.
function harness(role: string | null = 'owner', csrf = true) {
 const writes: object[] = [];
 const c: any = { fns: {
  auth: { currentUser: async () => ({required:true,user:role ? {role} : null}), verifyCsrf: async ({token}: any) => csrf && token === 'token' },
  http: { publicOrigin: async () => 'http://local' },
  llm: { modelPolicy: async (o: any) => { if (o.model === 'invalid') throw new Error('bad route'); writes.push(o); } },
  settings: { set: async (o: object) => { writes.push(o); } },
  sshInstance: { list: async () => [{name:'trusted',pinnedHostKey:'key'}, {name:'untrusted'}] },
 } };
 return { c, writes };
}
const cases = [
 { route:model, path:'model-state', data:{model:'openai:model',disabled:true} },
 { route:tier, path:'minimax/settings', data:{minimaxCodingServiceTier:'priority'} },
 { route:instance, path:'plan/instance', data:{provider:'opencode',instance:'trusted'} },
];
function request(path: string, data: unknown, headers: Record<string,string> = {}) {
 return new Request(`http://local/llms/${path}`, {method:'POST',headers:{'content-type':'application/json','x-csrf-token':'token',origin:'http://local',...headers},body:JSON.stringify(data)});
}
for (const item of cases) {
 test(`${item.path}: owner-only, same-origin, cookie-CSRF JSON`, async () => {
  for (const [role, csrf, headers, status] of [
   [null,true,{},401], ['member',true,{},403], ['owner',false,{},403],
   ['owner',true,{origin:'http://evil'},403], ['owner',true,{'sec-fetch-site':'cross-site'},403],
   ['owner',true,{'x-csrf-token':''},403], ['owner',true,{'content-type':'application/x-www-form-urlencoded'},415],
  ] as const) {
   const {c,writes} = harness(role,csrf);
   const res = await item.route(c,null,{req:request(item.path,item.data,headers)});
   expect(res.status).toBe(status); expect(res.headers.get('content-type')).toContain('application/json');
   expect(res.headers.get('cache-control')).toBe('no-store'); expect(writes).toEqual([]);
  }
 });
 test(`${item.path}: malformed JSON and oversized payloads never mutate`, async () => {
  const {c,writes} = harness();
  for (const data of [null,[],{},'value']) expect((await item.route(c,null,{req:request(item.path,data)})).status).toBe(400);
  const bad = new Request(`http://local/llms/${item.path}`, {method:'POST',headers:{'content-type':'application/json','x-csrf-token':'token'},body:'{'});
  expect((await item.route(c,null,{req:bad})).status).toBe(400);
  expect((await item.route(c,null,{req:request(item.path,{padding:'x'.repeat(8200)})})).status).toBe(413);
  expect(writes).toEqual([]);
 });
 test(`${item.path}: returns JSON even with legacy HTMX header`, async () => {
  const {c,writes} = harness();
  const res = await item.route(c,null,{req:request(item.path,item.data,{'HX-Request':'true'})});
  expect(res.status).toBe(200); expect(res.headers.get('location')).toBeNull();
  expect(res.headers.get('content-type')).toContain('application/json'); expect((await res.json()).ok).toBe(true);
  expect(writes).toHaveLength(1);
 });
}
test('exact route disable and enable preserve explicit desired state', async () => {
 const {c,writes} = harness();
 for (const disabled of [true,true,false]) {
  const res=await model(c,null,{req:request('model-state',{model:'ssh/remote:openai/model:id',disabled})});
  expect(await res.json()).toEqual({ok:true,model:'ssh/remote:openai/model:id',disabled});
 }
 expect(writes).toEqual([true,true,false].map(disabled=>({action:'set',model:'ssh/remote:openai/model:id',disabled})));
 for (const data of [{model:'',disabled:true},{model:'openai:x',disabled:'true'},{model:'invalid',disabled:true}]) expect((await model(c,null,{req:request('model-state',data)})).status).toBe(400);
 expect(writes).toHaveLength(3);
});
test('tier validation and obsolete budget fields cannot write other settings',async()=>{
 const {c,writes}=harness();
 for(const value of ['standard','priority']) {
  const res=await tier(c,null,{req:request('minimax/settings',{minimaxCodingServiceTier:value,minimaxCodingMaxTokens:42})});
  expect(await res.json()).toEqual({ok:true,serviceTier:value});
 }
 for(const value of ['fast',{},null]) expect((await tier(c,null,{req:request('minimax/settings',{minimaxCodingServiceTier:value})})).status).toBe(400);
 expect(writes).toEqual(['standard','priority'].map(value=>({module:'llm',scopeType:'global',key:'minimaxCodingServiceTier',value})));
});
test('all plan providers support local and trusted egress only',async()=>{
 const {c,writes}=harness();
 for(const [provider,key] of Object.entries({'zai-coding':'zaiCodingInstance','minimax-coding':'minimaxCodingInstance',opencode:'opencodeInstance'})) {
  for(const selected of ['','local',' trusted ']) {
   const value=selected.trim()==='trusted'?'trusted':'';
   const res=await instance(c,null,{req:request('plan/instance',{provider,instance:selected})});
   expect(await res.json()).toEqual({ok:true,provider,instance:value});
   expect(writes.at(-1)).toEqual({module:'llm',scopeType:'global',key,value});
  }
 }
 for(const data of [{provider:'other',instance:''},{provider:'opencode',instance:'untrusted'},{provider:'opencode',instance:'missing'},{provider:'opencode',instance:{}}]) expect((await instance(c,null,{req:request('plan/instance',data)})).status).toBe(400);
 expect(writes).toHaveLength(9);
});
