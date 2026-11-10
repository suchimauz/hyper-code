import { expect, it } from 'vitest';
import { reconcileStream } from '../lib/streamHandoff';
import type { EventPage } from '../lib/mauzcode';
const page: EventPage = { agentId:'a', events:[], olderBefore:null, hasOlder:false, isRunning:true, runState:'running', lastError:null, partial:{text:'Visible answer',revision:1,startedAt:10} };
it('retains visible prose across an explicit handoff gap and repeated refreshes',()=>{
 const next={...page,partial:null,streamHandoff:true};
 const retained={...next,partial:reconcileStream(page,next)};
 expect(retained.partial).toEqual(page.partial);
 expect(reconcileStream(retained,next)).toEqual(page.partial);
});
it('replaces the draft atomically when the durable assistant event arrives',()=>{
 const next={...page,partial:null,streamHandoff:true,events:[{idx:2,ts:20,type:'assistant',text:'Visible answer'}]};
 expect(reconcileStream(page,next)).toBeNull();
});
it('does not preserve cancelled prose, cross-chat drafts or old drafts over a new stream',()=>{
 expect(reconcileStream(page,{...page,partial:null})).toBeNull();
 expect(reconcileStream(page,{...page,agentId:'b',partial:null,streamHandoff:true})).toBeNull();
 const partial={text:'New stream',revision:1,startedAt:30};
 expect(reconcileStream(page,{...page,partial})).toEqual(partial);
});
