import { expect, test } from 'bun:test';
import architecture from './$route__GET';
import calendar from '../../../google/src/gcal/$route__GET';
const context = { fns: { architectureMap: {graph: async()=>({nodes:[],edges:[]})},code:{boundary:async()=>({total:0,violations:[]})} } } as unknown as Context;
test('standalone calendar redirects including retired embed URLs',async()=>{
 const response=await calendar(context,null,{req:new Request('http://localhost/gcal?date=2026-07-01')});expect(response).toBeInstanceOf(Response);expect((response as Response).headers.get('location')).toContain('extension%3Avisualizations%2Fcalendar');
 const embedded=await calendar(context,null,{req:new Request('http://localhost/gcal?embed=1')});expect(embedded).toBeInstanceOf(Response);expect((embedded as Response).status).toBe(302);
});
test('architecture negotiates native page, JSON data and canvas document',async()=>{
 const response=await architecture(context,null,{req:new Request('http://localhost/architectureMap'),params:{}});expect(response).toBeInstanceOf(Response);expect((response as Response).headers.get('location')).toContain('extension%3Avisualizations%2Farchitecture');
 const json=await architecture(context,null,{req:new Request('http://localhost/architectureMap',{headers:{accept:'application/json'}}),params:{}});expect(await (json as Response).json()).toHaveProperty('graph');
 const embedded=await architecture(context,null,{req:new Request('http://localhost/architectureMap?embed=1'),params:{}});expect(embedded).toBeInstanceOf(Response);expect((embedded as Response).status).toBe(302);
});
test('canvas JSON denies foreign owners and wrong item kinds before reading graph',async()=>{
 let reads=0;
 const ctx={fns:{canvas:{authorizeHttp:async()=>new Response('denied',{status:403}),list:async()=>[]},architectureMap:{graph:async()=>{reads++;return{};}},code:{boundary:async()=>({})}}} as unknown as Context;
 const opts={req:new Request('http://localhost/architectureMap?agentId=other&itemId=1',{headers:{accept:'application/json'}}),params:{}};
 expect((await architecture(ctx,null,opts) as Response).status).toBe(403);expect(reads).toBe(0);
 ctx.fns.canvas.authorizeHttp=async()=>null;
 expect((await architecture(ctx,null,opts) as Response).status).toBe(404);expect(reads).toBe(0);
});
