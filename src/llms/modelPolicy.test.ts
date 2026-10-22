import {test,expect} from 'bun:test';
import control from './modelControl';
import route from './$route_model-state_POST';
const ctx=()=>{const writes:any[]=[];const c:any={fns:{procs:{ui:{escape:({text}:any)=>Bun.escapeHTML(String(text))}},llm:{modelPolicy:async(o:any)=>{writes.push(o);return {disabledModels:o.disabled?[o.model]:[]};}},llms:{modelControl:(o:any)=>control(c,null,o)}}};return {c,writes};};
test('model control escapes routes and exposes explicit reversible state',()=>{
 const {c}=ctx();const html=control(c,null,{model:'openai:a"<bad>',disabled:true});
 expect(html).toContain('name="disabled" value="false"');expect(html).toContain('disabled</span>');
 expect(html).toContain('Enable');expect(html).not.toContain('a"<bad>');expect(html).toContain('&lt;bad&gt;');
});
function request(fields:Record<string,string>,hx=true){return new Request('http://local/llms/model-state',{method:'POST',headers:hx?{'HX-Request':'true'}:{},body:new URLSearchParams(fields)});}
test('explicit disable POST persists once and returns updated control; enable and ordinary redirect work',async()=>{
 const {c,writes}=ctx();const r=await route(c,null,{req:request({model:'opencode:glm',disabled:'true'})});
 expect(r.status).toBe(200);expect(await r.text()).toContain('data-model-disabled="true"');expect(writes).toEqual([{action:'set',model:'opencode:glm',disabled:true}]);
 expect((await route(c,null,{req:request({model:'opencode:glm',disabled:'false'},false)})).status).toBe(303);
 expect(writes[1].disabled).toBe(false);
});
test('invalid desired state and missing route never write policy',async()=>{
 const {c,writes}=ctx();for(const fields of [{model:'openai:a',disabled:'toggle'},{model:'',disabled:'true'},{model:'openai:a'}])expect((await route(c,null,{req:request(fields as Record<string,string>)})).status).toBe(400);
 expect(writes).toHaveLength(0);
});
