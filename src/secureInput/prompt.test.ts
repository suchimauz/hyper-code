import { expect, test } from 'bun:test';
import prompt from './prompt';

test('active and closing lifecycle preserves one prompt; timeout cleans in-memory capability', async () => {
 const events: object[]=[];
 const ctx:any={state:{},fns:{procs:{events:{emit:({event}:any)=>events.push(event)}}}};
 const session:any={user:{id:'owner'}};
 const waiting=prompt(ctx,session,{title:'First',timeoutMs:10000});
 const id=ctx.state.secureInput.prompts.keys().next().value;
 await expect(prompt(ctx,session,{title:'Second'})).rejects.toThrow('already active');
 expect(ctx.state.secureInput.prompts.size).toBe(1);
 ctx.state.secureInput.prompts.get(id).resolve('MOCK');expect(await waiting).toBe('MOCK');
 expect(ctx.state.secureInput.prompts.size).toBe(0);
 await expect(prompt(ctx,session,{title:'Third'})).rejects.toThrow('still closing');
 expect(events).toEqual([{type:'secure-input.changed'},{type:'secure-input.changed'}]);
});

test('ownerless non-agent callers fail closed',async()=>{
 await expect(prompt({state:{},fns:{}} as any,null,{title:'No owner'})).rejects.toThrow('requires an owning agent');
});

test('timeout rejects and removes pending capability',async()=>{
 const ctx:any={state:{},fns:{procs:{events:{emit:()=>{}}}}};
 const session:any={user:{id:'owner'}};
 const original=globalThis.setTimeout;
 // Only accelerate this mocked prompt timer, restoring before awaiting.
 globalThis.setTimeout=((fn:any)=>original(fn,1)) as any;
 const waiting=prompt(ctx,session,{title:'Timeout',timeoutMs:10000});
 globalThis.setTimeout=original;
 await expect(waiting).rejects.toThrow('timed out');
 expect(ctx.state.secureInput.prompts.size).toBe(0);expect(ctx.state.secureInput.closing.id).toBeString();
});
