import { describe, test, expect } from 'bun:test';
import metaSurface from './metaSurface';

describe('native Meta authorization boundary',()=>{
  async function fixture(){
    const registry:any={goal:{},auth:{},agent:{},procs:{db:{}}};
    const ctx:any={state:{registry},fns:{}};
    const proxy=(node:any):any=>new Proxy({}, {get:(_target,key)=>typeof node[key]==='function'?(opts:any)=>node[key](ctx,null,opts):proxy(node[key])});
    registry.agent.metaSurface=metaSurface;ctx.fns=proxy(registry);
    const calls: unknown[]=[];
    ctx.state.registry.goal.surfaceAuthorize=async (_c:any,_s:any,o:any)=>{calls.push(o);if(o.csrfToken!==undefined&&o.csrfToken!=='valid')throw Object.assign(new Error('Invalid CSRF token'),{status:403});return {};};
    ctx.state.registry.procs.db.select=async()=>[{status_line:'',status_line_every:1,status_line_mode:'global',auto_compact_window_percent:null,run_state:'idle'}];
    ctx.state.registry.auth.csrfToken=async()=> 'valid';
    (ctx.state as any).agent={a:{scratchpad:{plan:{title:'Plan',tasks:[]}}}};
    ctx.state.registry.agent.setStatusLine=async(_c:any,_s:any,o:any)=>{calls.push({write:o});return o;};
    ctx.state.registry.agent.setCompaction=async(_c:any,_s:any,o:any)=>{calls.push({write:o});return o;};
    return {ctx,calls};
  }
  test('read returns JSON snapshot and owner check',async()=>{const {ctx,calls}=await fixture();const r=await ctx.fns.agent.metaSurface({id:'a',req:new Request('http://localhost/agent/a/meta-settings')});expect(r.status).toBe(200);expect((await r.json()).plan.title).toBe('Plan');expect(calls).toHaveLength(1);});
  test('denies nonowners before reading or writing',async()=>{const {ctx,calls}=await fixture();ctx.state.registry.goal.surfaceAuthorize=async()=>{throw Object.assign(new Error('Owner required'),{status:403});};const r=await ctx.fns.agent.metaSurface({id:'a',req:new Request('http://localhost')});expect(r.status).toBe(403);expect(calls).toHaveLength(0);});
  test('requires CSRF before mutations',async()=>{const {ctx,calls}=await fixture();const r=await ctx.fns.agent.metaSurface({id:'a',req:new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'context',percent:50})})});expect(r.status).toBe(403);expect(calls.some((v:any)=>v.write)).toBe(false);});
  test('validates field allowlist and applies exact setting',async()=>{const {ctx,calls}=await fixture();const send=(body:object)=>ctx.fns.agent.metaSurface({id:'a',req:new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':'valid'},body:JSON.stringify(body)})});expect((await send({action:'status',mode:'custom',text:'Focus',every:2,extra:true})).status).toBe(400);expect((await send({action:'status',mode:'custom',text:'Focus',every:2})).status).toBe(200);expect(calls.filter((v:any)=>v.write)).toEqual([{write:{id:'a',mode:'custom',text:'Focus',every:2}}]);});
});
