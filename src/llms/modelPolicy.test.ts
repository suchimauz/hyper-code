import {test,expect} from 'bun:test';
import control from './modelControl';
import route from './$route_model-state_POST';
const ctx=()=>{const writes:any[]=[];const c:any={fns:{procs:{ui:{escape:({text}:any)=>Bun.escapeHTML(String(text))}},llm:{modelPolicy:async(o:any)=>{writes.push(o);return {disabledModels:o.disabled?[o.model]:[]};}},llms:{modelControl:(o:any)=>control(c,null,o)}}};return {c,writes};};
test('model control escapes routes and exposes explicit reversible state',()=>{
 const {c}=ctx();const html=control(c,null,{model:'openai:a"<bad>',disabled:true});
 expect(html).toContain('name="disabled" value="false"');expect(html).not.toContain('disabled</span>');
 expect(html).toContain('role="switch"');expect(html).toContain('llm-model-switch-track');expect(html).not.toContain('toggle-sm');expect(html).toContain('hx-trigger="change"');
 expect(html).toContain('aria-hidden="true"');expect(html).toContain('<label class="llm-model-switch">');
 expect(html).toContain('hx-disabled-elt="find input[type=checkbox]"');expect(html).not.toContain(' checked');expect(html).not.toContain('<button');
 expect(html).toContain('Enable');expect(html).not.toContain('a"<bad>');expect(html).toContain('&lt;bad&gt;');
});
test('enabled model switch is checked and submits an explicit disable state',()=>{
 const {c}=ctx();const html=control(c,null,{model:'openai:a',disabled:false});
 expect(html).toContain(' checked');expect(html).toContain('name="disabled" value="true"');
 expect(html).toContain('aria-label="Disable openai:a"');expect(html).not.toContain('disabled</span>');
});
test('Connections shows only complete model names and keeps full routes for tooltip and policy',()=>{
 const {c}=ctx();
 for(const [model,prefix,name] of [
  ['ssh/aeza-criminal-amarant:codex/su4imauz:gpt-6.1-sol','ssh/aeza-criminal-amarant:codex/su4imauz:','gpt-6.1-sol'],
  ['hyper/mini:codex/pro:gpt-6.1-sol','hyper/mini:codex/pro:','gpt-6.1-sol'],
  ['openrouter:meta-llama/llama:free','openrouter:','meta-llama/llama:free'],
  ['lmstudio:qwen:latest','lmstudio:','qwen:latest'],
  ['bare-model','','bare-model'],
 ]){
  const html=control(c,null,{model,disabled:false});
  expect(html).toContain(`title="${model}">${name}</span>`);
  if(prefix) expect(html).not.toContain(`>${prefix}`);
  expect(html).toContain(`name="model" value="${model}"`);
 }
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
