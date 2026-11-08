import { expect, test } from 'bun:test';
import run from './run';
import record from './recordRunLifecycle';

function harness(turns: any[]) {
    const events: any[] = [], records: any[] = [], messages: any[] = [];
    const agent: any = { id: 'fixture', scratchpad: {}, messages: [], events: [] };
    const noop = async () => {};
    const append = async ({ message }: any) => { const row = { ...message, idx: messages.length }; messages.push(row); return row; };
    const ctx: any = { fns: {
        planning: { read: async ({agentId}: any) => ({version:1,agentId,mode:'execute',revision:0,scope:'session',advisory:true,runningPolicy:'reject',pending:null,proposal:null}) },
        goal: { delegationScope: async ({ fn }: any) => fn(), runBindingCapture: async () => ({ kind: 'disabled', allowContinuation: false }) },
        session: { forAgent: () => ({}), appendUserMessage: async () => { events.push({type:'user'}); }, appendMessage: append,
            syncAgentState: noop, updateMessageContent: noop, appendAssistantEvent: async ({payload}: any) => { const idx = events.length; events.push({type:'assistant',...payload}); return {idx}; },
            appendToolCallEvent: async () => { events.push({type:'tool_call'}); }, recordContextUsage: noop, appendErrorEvent: noop },
        agent: { recordRunLifecycle: async (o: any) => records.push(o), statusLineForTurn: async () => '', autoCompactIfNeeded: async () => ({status:'not_needed'}), stashResult: async ({output}:any) => ({content:output}), sanitizeHtmlBody: ({html}:any) => html },
        procs: { db: { select: async () => [{i:0,stopped_at:null}] }, events: {emit:noop}, log:{warn:noop} },
        llm:{stream:async () => { const t = turns.shift(); if(t instanceof Error) throw t; if(t === 'stop') { agent.abortController.abort(); throw new DOMException('Stopped','AbortError'); } return t; }},
        markdown:{render:async ({source}:any) => source}, tools:{call:async ({name}:any) => ({output:'ok',...(name === 'respondHtml' ? {terminal:{type:'html',html:'<p>final</p>',text:'final'}}:{})})}
    }};
    return {agent,ctx,events,records, execute:()=>run(ctx,null,{agent,userText:'question'})};
}
test('final answer is distinct from tool commentary and lifecycle shares one id',async()=>{
    const h=harness([{text:'commentary',toolCalls:[{id:'t',name:'read',args:{}}]},{text:'answer'}]);
    await h.execute();
    expect(h.records.map(r=>r.status)).toEqual(['open','completed']);
    expect(h.records[0].runId).toBe(h.records[1].runId);
    expect(h.records[1].answerIdx).toBe(3);
});
test('terminal HTML records the actual final assistant event',async()=>{
    const h=harness([{toolCalls:[{id:'t',name:'respondHtml',args:{}}]}]); await h.execute();
    expect(h.records[1]).toMatchObject({status:'completed',answerIdx:2});
});
test('provider failure closes error without inventing an answer',async()=>{
    const h=harness([new Error('provider failed')]); await expect(h.execute()).rejects.toThrow('provider failed');
    expect(h.records[1]).toMatchObject({status:'error',answerIdx:null}); expect(h.agent.abortController).toBeNull();
});
test('stop closes stopped without answer',async()=>{
    const h=harness(['stop']); await expect(h.execute()).rejects.toBeDefined();
    expect(h.records[1]).toMatchObject({status:'stopped',answerIdx:null});
});
test('durable procedure creates observed start and terminal detects interleaved users',async()=>{
    const calls:any[]=[]; const ctx:any={fns:{procs:{db:{run:async(o:any)=>calls.push(o)}}}};
    await record(ctx,null,{agentId:'fixture',runId:'run',status:'open'});
    await record(ctx,null,{agentId:'fixture',runId:'run',status:'completed',answerIdx:92});
    expect(calls[0].sql).toContain('COALESCE(MAX(idx),-1)+1');
    expect(calls[1].sql).toContain("e.type='user'");
    expect(calls[1].sql).toContain("coalesce(m.message_type,'message')='message'");
    expect(calls[1].sql).toContain("coalesce(m.author,'') NOT LIKE 'agent:%'");
    expect(calls[1].sql).toContain("e.payload::jsonb->>'agentMessage' IS NULL");
    expect(calls[1].sql).toContain("e.payload::jsonb->>'outgoingAgentMessage' IS NULL");
    expect(calls[1].sql).toContain("r.status='open'");
    expect(calls[1].params[2]).toBe(92);
});
