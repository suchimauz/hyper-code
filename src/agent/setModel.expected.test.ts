import {test,expect} from 'bun:test';
import setModel from './setModel';
import parseModelRouteFn from "../llm/parseModelRoute";
function fixture(routes:string[]){let reads=0,updates=0;const ctx={state:{agent:{}},fns:{llm:{ parseModelRoute: (o: any) => parseModelRouteFn({} as any, null, o),resolveEndpoint:async()=>({kind:'local'})},procs:{db:{select:async()=>[{id:'a',model:routes[Math.min(reads++,routes.length-1)],run_state:'idle'}],run:async()=>{updates++;return {changes:1};}}}}} as unknown as Context;return {ctx,updates:()=>updates};}
test('parameter edit rejects model changed before endpoint preflight completed',async()=>{const f=fixture(['mock:newer']);await expect(setModel(f.ctx,null,{id:'a',model:'mock:edited',expectedModel:'mock:old'})).rejects.toThrow(/model changed/);expect(f.updates()).toBe(0);});
test('parameter edit rejects model changed between initial read and preflight',async()=>{const f=fixture(['mock:old','mock:newer']);await expect(setModel(f.ctx,null,{id:'a',model:'mock:edited',expectedModel:'mock:old'})).rejects.toThrow(/model changed/);expect(f.updates()).toBe(0);});
test('observed-model edits cannot fan out to provider scope',async()=>{const f=fixture(['mock:old']);await expect(setModel(f.ctx,null,{id:'a',model:'mock:edited',expectedModel:'mock:old',scope:'provider'})).rejects.toThrow(/agent scope/);expect(f.updates()).toBe(0);});
