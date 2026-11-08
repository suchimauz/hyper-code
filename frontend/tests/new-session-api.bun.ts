// Run the private bridge with inert mocks: never create real agents or send messages.
import { expect, it, mock } from 'bun:test';
import { readFileSync } from 'node:fs';

const source=readFileSync('/home/suchimauz/.hyper/user/hyper-ui-bridge/src/hyperUiBridge/newSession.ts','utf8');
const mod={exports:{} as {default: (ctx:object,session:object|null,opts:{req:Request})=>Promise<Response>}};
new Function('module','exports',new Bun.Transpiler({loader:'ts'}).transformSync(source.replace('export default async function','exports.default = async function')))(mod,mod.exports);
function setup(){
 const kv=new Map<string,string>(); const accept=mock(async()=>new Response('{}')); const create=mock(async()=>({agent:{id:'mock'}}));
 const ctx={fns:{projects:{principal:async()=> 'owner',get:async()=>({id:'p'})},auth:{verifyCsrf:async()=>true},llm:{listModels:async()=>({test:['test:model']}),modelPolicy:async()=>({disabledModels:[]}),reasoningCapabilities:async()=>({supported:[]})},settings:{modelDefault:async()=> 'test:model'},hyperUiBridge:{iconData:async()=>null},agent:{createFromValues:create,setReasoningEffort:async()=>{},acceptMessage:accept},procs:{db:{select:async({sql,params}:{sql:string;params:string[]})=>{if(sql.startsWith('SELECT'))return kv.has(params[0])?[{value:kv.get(params[0])}]:[];if(kv.has(params[0]))return [];kv.set(params[0],params[1]);return [{key:params[0]}];},run:async({params}:{params:string[]})=>{kv.set(params[1],params[0]);}}}}};
 const request=(contents=['one','two'])=>{const body=new FormData();body.set('requestKey','abcdefghijklmnop');body.set('projectId','p');body.set('model','test:model');body.set('text','');contents.forEach(text=>body.append('files',new File([text],'file.txt',{type:'text/plain'})));return new Request('http://localhost/new-session',{method:'POST',body});};
 return {ctx,accept,create,request,call:(req:Request)=>mod.exports.default(ctx,{user:{id:'owner'}},{req})};
}
it('native initial and uncertain retry use FormData and the same idempotency key; changed bytes/order conflict',async()=>{
 const s=setup();s.accept.mockResolvedValueOnce(new Response('{}',{status:503}));
 expect((await s.call(s.request())).status).toBe(409);
 expect((await s.call(s.request(['two','one']))).status).toBe(409);
 expect(s.accept).toHaveBeenCalledTimes(1);
 expect((await s.call(s.request())).status).toBe(200);
 expect(s.create).toHaveBeenCalledTimes(1);
 for(const [opts] of s.accept.mock.calls as unknown as [{req:Request}][]){expect(opts.req.headers.get('idempotency-key')).toBe('abcdefghijklmnop');const form=await opts.req.formData();expect(await Promise.all((form.getAll('files') as File[]).map(f=>f.text()))).toEqual(['one','two']);}
});
it('owner, CSRF and upload count are checked before creation',async()=>{
 const s=setup();expect((await mod.exports.default(s.ctx,null,{req:s.request()})).status).toBe(401);
 s.ctx.fns.auth.verifyCsrf=async()=>false;expect((await s.call(s.request())).status).toBe(403);
 s.ctx.fns.auth.verifyCsrf=async()=>true;expect((await s.call(s.request(Array(11).fill('x')))).status).toBe(413);
 expect(s.create).not.toHaveBeenCalled();expect(s.accept).not.toHaveBeenCalled();
});
