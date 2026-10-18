import { test, expect } from 'bun:test';
import compact from './compactContext';
import run from './run';

function fixture() {
 const ac = new AbortController();
 const agent: any = { id:'root', model:'test', messages:[], scratchpad:{}, activeRunCount:1, abortController:ac, currentJobId:'owner' };
 const root = Array.from({length:12},(_,i)=>({role:i%2?'assistant':'user',content:'x'.repeat(16000)+i}));
 const rows: any = { root };
 const row: any = { updated_at:1,run_state:'running',run_token:'owner',sleep_context:null };
 let summarize: any = async()=>({summary:'summary',message:{role:'user',content:'summary'}});
 const ctx: any = {state:{},fns:{
  procs:{db:{select:async({sql}:any)=>sql.includes('fingerprint')?[{fingerprint:JSON.stringify(root)}]:[{...row}],run:async({sql,params:p}:any)=>{
   if(sql.includes('updated_at = ?')) {
    const owner=sql.includes("run_state = 'running'")?row.run_state==='running'&&row.run_token===p[4]:row.run_state==='idle'&&row.run_token==null;
    if(!owner||row.updated_at!==p[3])return {changes:0};
    if(sql.includes('md5')&&JSON.stringify(root)!==p.at(-1))return {changes:0};
    row.sleep_context=JSON.parse(p[0]); row.updated_at=p[1]; return {changes:1};
   }
   if(row.sleep_context?.draftRevision!==Number(p[2])||String(row.sleep_context?.activeRevision??'')!==String(p[4]??''))return {changes:0};
   row.sleep_context=JSON.parse(p[0]);return {changes:1};
  }}},
  session:{getMessages:async({id}:any)=>structuredClone(rows[id]??[]), updateScratchpad:async()=>{},appendEventWithHtml:async()=>{},archive:async()=>{},appendMessage:async({id,message}:any)=>{(rows[id]??=[]).push(message);},syncAgentState:async()=>{agent.sleepContext=row.sleep_context;}},
  agent:{normalizeSleepContext:({sleepContext}:any)=>sleepContext,getSleepGeneration:()=>null,start:async()=>({id:'child',model:'test'}),fullSystemPrompt:async()=>''},
  compaction:{resolve:async()=>({provider:'test',compact:async()=>summarize()})}
 }};
 return {ctx,agent,root,row,ac,setSummary:(fn:any)=>{summarize=fn;},call:()=>compact(ctx,null,{agent,runToken:'owner',signal:ac.signal})};
}
test('real compactContext preserves ownership and transcript',async()=>{const f=fixture();const before=structuredClone(f.root);expect((await f.call()).status).toBe('compacted');expect(f.root).toEqual(before);expect(f.row.run_token).toBe('owner');expect(f.row.run_state).toBe('running');});
for(const mutation of ['edit','token','head','growth'])test(`real compactContext fences ${mutation}`,async()=>{const f=fixture();f.setSummary(async()=>{if(mutation==='edit')f.root[0]!.content='edited';if(mutation==='token')f.row.run_token='other';if(mutation==='head')f.row.sleep_context.activeRevision=99;return {summary:'summary',message:{role:'user',content:mutation==='growth'?'y'.repeat(250000):'summary'}};});expect((await f.call()).status).toBe('stale');if(mutation==='head')expect(f.agent.sleepContext.activeRevision).toBe(99);});
test('real compactContext abort fences a late uncancellable provider',async()=>{const f=fixture();let finish:any;f.setSummary(()=>new Promise(resolve=>{finish=resolve;f.ac.abort();}));await expect(f.call()).rejects.toThrow();expect(f.row.sleep_context.activeRevision).toBeNull();finish({summary:'late',message:{role:'user',content:'late'}});await Bun.sleep(1);expect(f.row.sleep_context.activeRevision).toBeNull();});

function runFixture(over=false) {
 const messages:any[]=[];let attempts=0,effects=0,streams=0,stops=0;
 const agent:any={id:'r',model:'test',messages,scratchpad:{}};
 const append=async({message}:any)=>{messages.push(message);return {idx:messages.length-1};};
 const ctx:any={fns:{
 procs:{db:{select:async()=>[{i:0}]},log:{warn:()=>{}}},
 session:{forAgent:()=>null,appendUserMessage:async({text}:any)=>append({message:{role:'user',content:text}}),appendMessage:append,syncAgentState:async()=>{},appendAssistantEvent:async()=>{},appendErrorEvent:async()=>{},appendToolCallEvent:async()=>{},updateMessageContent:async({idx,content}:any)=>{messages[idx].content=content;}},
 agent:{statusLineForTurn:async()=>'',stashResult:async({output}:any)=>({content:output}),autoCompactIfNeeded:async({checkOnly}:any)=>{if(!checkOnly)attempts++;expect(messages.filter(m=>m.role==='tool').every(m=>m.content==='done')).toBe(true);return {status:checkOnly?'over_threshold':'failed',estimatedTokens:over?195000:10000,contextWindow:200000};},stop:async()=>{stops++;agent.abortController.abort();}},
 markdown:{render:async({source}:any)=>source},tools:{call:async()=>{effects++;return {output:'done'};}},llm:{stream:async()=>{streams++;return streams<=3?{text:'',toolCalls:[{id:'c'+streams,name:'effect',args:{}}]}:{text:'finished',toolCalls:[]};}}
 }};
 return {ctx,agent,counts:()=>({attempts,effects,streams,stops})};
}
test('real run bounds failed compaction attempts and executes each effect exactly once',async()=>{const f=runFixture();await run(f.ctx,null,{agent:f.agent,userText:'go'});expect(f.counts()).toEqual({attempts:1,effects:3,streams:4,stops:0});expect(f.agent.messages.filter((m:any)=>m.role==='tool')).toHaveLength(3);});
test('real run hard guard stops before sampling and preserves durable explanation',async()=>{const f=runFixture(true);await run(f.ctx,null,{agent:f.agent,userText:'go'});expect(f.counts()).toEqual({attempts:1,effects:0,streams:0,stops:1});expect(f.agent.messages.at(-1).content).toContain('Paused');});
test('manual resume keeps completed effects and never replays the old batch', async()=>{
 const f=runFixture();
 await run(f.ctx,null,{agent:f.agent,userText:'go'});
 const oldTools=f.agent.messages.filter((m:any)=>m.role==='tool').map((m:any)=>({...m}));
 const before=f.counts().effects;
 await run(f.ctx,null,{agent:f.agent,userText:'continue'});
 expect(f.counts().effects).toBe(before);
 expect(f.agent.messages.filter((m:any)=>m.role==='tool')).toEqual(oldTools);
});

