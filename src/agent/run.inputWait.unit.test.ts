import { describe, expect, test } from 'bun:test';
import run from './run';

function harness(turns: any[]) {
    const rows: any[] = [{ idx: 0, role: 'user', content: 'go' }];
    const errors: string[] = [];
    const agent: any = { id: 'guard-test', model: 'mock:test', messages: rows.slice(), scratchpad: {}, events: [] };
    let sampled = 0;
    let calls = 0;
    let stops = 0;
    const append = async ({ message }: any) => { const row = { ...message, idx: rows.length }; rows.push(row); return row; };
    const noop = async () => {};
    const ctx: any = { state: { agent: { [agent.id]: agent } }, fns: {
        input: { isWaiting: async () => false },
        planning: { read: async ({agentId}: any) => ({version:1,agentId,mode:'execute',revision:0,scope:'session',advisory:true,runningPolicy:'reject',pending:null,proposal:null}) },
        goal: { delegationScope: async ({ fn }: any) => fn(), runBindingCapture: async () => ({ kind: 'disabled', allowContinuation: false }) },
        session: {
            forAgent: () => null, appendMessage: append,
            syncAgentState: async () => { agent.messages = rows.slice(); },
            recordContextUsage: noop, appendAssistantEvent: async () => ({idx: 0}), appendToolCallEvent: noop,
            appendErrorEvent: async ({ error }: any) => { errors.push(error); },
            updateMessageContent: async ({ idx, content }: any) => { rows[idx].content = content; },
        },
        procs: { events: { emit: noop }, db: { select: async ({ sql }: any) => sql.includes('MAX(idx)') ? [{ i: 0 }] : [{ stopped_at: null }] } },
        agent: { recordRunLifecycle: async () => {}, statusLineForTurn: async () => '', autoCompactIfNeeded: async () => ({ status: 'not_needed' }),
            stop: async () => { stops++; }, stashResult: async ({ output }: any) => ({ content: output }) },
        events: { emitAgentsChanged: noop, refreshAgentMeta: noop },
        markdown: { render: async ({ source }: any) => source },
        llm: { stream: async () => { if (sampled >= turns.length) throw new Error('unexpected extra model request'); return turns[sampled++]; } },
        tools: { call: async () => { calls++; return { output: 'ok' }; }, runs: () => [] },
    } };
    return { ctx, agent, rows, errors, get sampled() { return sampled; }, get calls() { return calls; }, get stops() { return stops; } };
}
const bad = (finishReason = 'tool_calls', mixed = false) => ({ text: '', usage: null, finishReason, toolCalls: [
    ...(mixed ? [{ id: 'valid', name: 'read', args: { path: 'a.ts' } }] : []),
    { id: 'bad', name: 'read', args: { __unparsed: '{' } },
] });
const done = { text: 'done', usage: null, finishReason: 'stop', toolCalls: [] };
const execute = (h: ReturnType<typeof harness>) => run(h.ctx, null, { agent: h.agent, userText: '', userMessageAlreadyAppended: true });

describe('blocking question tool boundary', () => {
 for (const early of [false,true]) test('stops batch and next model request, early answer='+early,async()=>{
 const h=harness([{text:'',usage:null,finishReason:'tool_calls',toolCalls:[{id:'question',name:'eval',args:{}},{id:'later',name:'read',args:{path:'x'}}]}]);
 let opened=false; let dispatched=0;
 h.ctx.fns.input.isWaiting=async({since}:any)=>opened && (since!=null || !early);
 h.ctx.fns.tools.call=async()=>{dispatched++;opened=true;return {output:'question card created',handlerExecuted:true};};
 const result=await execute(h);
 expect(dispatched).toBe(1); expect(h.sampled).toBe(1);
 expect(result.inputWaiting).toBe(true);
 const results=h.rows.filter(r=>r.role==='tool'); expect(results.length).toBe(2);
 expect(results[1].content).toContain('Not executed');
 });
});
