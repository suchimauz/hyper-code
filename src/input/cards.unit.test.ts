import { expect, test } from 'bun:test';
import cards from './cards';
const owner = {user:{id:'owner',role:'owner'}};
const req = () => new Request('http://local/input/cards?agentId=a');
const row = (kind:string,spec:object={},state='open') => ({id:kind,kind,spec,state,title:'Title',message:'Message',created_at:1,updated_at:2,result:{password:'NEVER'},error:'NEVER',answered_by:'NEVER'});
const fixture = (rows:object[] = [], kinds:object = {}) => {
 const calls: {sql:string;params:unknown[]}[]=[];
 return {calls,ctx:{state:{input:{kinds}},fns:{procs:{db:{select:async (opts:{sql:string;params:unknown[]})=>{calls.push(opts);return rows;}}}}}};
};
test('cards denies anonymous/nonowner/cross-origin/mutations before database access',async()=>{
 for(const [session,request] of [[null,req()],[{user:{role:'user'}},req()],[owner,new Request(req(),{method:'POST'})],[owner,new Request(req(),{headers:{origin:'https://evil'}})],[owner,new Request(req(),{headers:{'sec-fetch-site':'cross-site'}})],[owner,new Request('http://local/input/cards?agentId=bad%20id')]] as const){
  const f=fixture();const response=await cards(f.ctx as any,session as any,{req:request});expect(response.status).toBeGreaterThanOrEqual(400);expect(f.calls).toHaveLength(0);
 }
});
test('cards scope active agents, include terminal receipts and expose no raw plugin state',async()=>{
 const f=fixture([row('plugin',{token:'NEVER',_agentWait:true},'submitted')]);
 const res=await cards(f.ctx as any,owner as any,{req:req()});
 expect(res.headers.get('cache-control')).toBe('no-store');expect(res.headers.get('vary')).toBe('Cookie');
 expect(f.calls[0]!.params).toEqual(['a']);expect(f.calls[0]!.sql).toContain('JOIN agents');expect(f.calls[0]!.sql).toContain('a.archived_at IS NULL');expect(f.calls[0]!.sql).toContain('LIMIT 100');expect(f.calls[0]!.sql).toContain("WHERE state IN ('open','processing') UNION ALL");
 expect(await res.json()).toEqual({inputs:[{id:'plugin',kind:'plugin',title:'Title',message:'Message',state:'submitted',waitForAnswer:true,createdAt:1,updatedAt:2}]});
});
test('core projections allowlist nested options and never copy credentials or grid source',async()=>{
 const f=fixture([row('secret',{saveAs:'secret://a/b',mode:'otp',maxlength:6,value:'NEVER',token:'NEVER'}),row('choice',{options:[{value:'yes',label:'Yes',token:'NEVER'}],_agentWait:true}),row('confirm',{details:'Continue?',danger:true,nonce:'NEVER'}),row('grid',{columns:[{key:'name',label:'Name',token:'NEVER'}],source:{fn:'private.call',args:{token:'NEVER'}},rows:[{password:'NEVER'}]})]);
 const response=await cards(f.ctx as any,owner as any,{req:req()});const data:any=await response.json();expect(JSON.stringify(data)).not.toContain('NEVER');expect(JSON.stringify(data)).not.toContain('private.call');
 expect(data.inputs[0].spec).toEqual({saveAs:'secret://a/b',mode:'otp',maxlength:6});expect(data.inputs[1].spec.options).toEqual([{value:'yes',label:'Yes'}]);expect(data.inputs[1].waitForAnswer).toBe(true);
});
test('plugins explicitly project public specs; reserved fields remain private',async()=>{
 const f=fixture([row('plugin',{issueId:42,nonce:'NEVER'})],{plugin:{projectCard:async (_ctx:any,{input}:any)=>({issueId:input.spec.issueId,_agentWait:true,completionAuthority:'NEVER',result:'NEVER'})}});
 const response=await cards(f.ctx as any,owner as any,{req:req()});expect((await response.json() as any).inputs[0].spec).toEqual({issueId:42});
});
test('failed plugin projection preserves all cards without leaking exception',async()=>{const f=fixture([row('broken'),row('secret',{saveAs:'secret://a/b'})],{broken:{projectCard:async()=>{throw new Error('PRIVATE');}}});const response=await cards(f.ctx as any,owner as any,{req:req()});const data:any=await response.json();expect(data.inputs).toHaveLength(2);expect(data.inputs[0].spec).toBeUndefined();expect(JSON.stringify(data)).not.toContain('PRIVATE');});
test('empty active-agent selection exposes no cards',async()=>{const f=fixture();expect(await (await cards(f.ctx as any,owner as any,{req:req()})).json()).toEqual({inputs:[]});});
