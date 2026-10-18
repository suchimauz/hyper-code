import { expect, test } from 'bun:test';
import steer from './steer';
for(const queued of [false,true])test(`steer routes through durable barrier; queued=${queued}`,async()=>{
 let delivery:any;
 const ctx:any={state:{},fns:{session:{deliverInbound:async(opts:any)=>{expect(opts.id).toBe('parent');delivery=opts.delivery;return {queued,messageIdx:queued?null:12};}},events:{refreshAgentMeta:()=>{}}}};
 const child:any={id:'child',parentId:'parent',scratchpad:{delegation:{result:{finishedAt:123}}}};
 const result=await steer(ctx,null,{from:child,event:'plan.completed',summary:'kept result'});
 expect(delivery.messageType).toBe('team_update');expect(delivery.text).toContain('kept result');expect(delivery.author).toBe('agent:child');expect(delivery.wake).toBe(true);expect(delivery.key).toBe('completion:child:123');
 expect(result).toEqual({delivered:!queued,queued,parentId:'parent',...(queued?{}:{messageIdx:12})});
});
