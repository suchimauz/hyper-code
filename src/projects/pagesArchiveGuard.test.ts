import {test,expect} from 'bun:test';
import chats from './chats.ts';
test('archive eligibility reflects idle queued wake and live run guards without writes',async()=>{
 const rows=[{id:'idle'},{id:'queued',next_run_at:123},{id:'wake',wake_at:123},{id:'live'},{id:'running',run_state:'running'}].map(r=>({run_state:'idle',workspace_dir:'/exact',archived_at:null,...r}));
 const ctx:any={state:{agent:{live:{activeRunCount:1}}},fns:{projects:{get:async()=>({id:'p'}),identity:async()=>({id:'p',dir:'/exact',host:''})},auth:{viewerId:async()=>null,listUsers:async()=>[]},agent:{teamActivity:async()=>({})},procs:{db:{select:async({sql}:any)=>{expect(sql).toContain('a.next_run_at,a.wake_at');return rows;}}}}};
 const result=await chats(ctx,null,{projectId:'p'});
 expect(result.map(c=>c.canArchive)).toEqual([true,false,false,false,false]);
 expect(result.map(c=>c.archiveBlockedReason)).toEqual([undefined,'queued','scheduled','busy','busy']);
});
