/**
 * Run the existing context compactor through a durable idempotent command lifecycle
 *
 * Claims a compact command in a short transaction, calls agent.compactContext outside it, then saves the result. Retries never repeat completed or uncertain work; orphaned running claims become interrupted. Does not enqueue a normal user turn.
 * @param opts.agentId Idle session to compact.
 * @param opts.text Exact canonical /compact command with optional focus instructions.
 * @param opts.requestId Client idempotency key reused on transport retries.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Idle session to compact. */
        agentId: string;
        /** Exact canonical /compact command with optional focus instructions. */
        text: string;
        /** Client idempotency key reused on transport retries. */
        requestId: string;
    },
): Promise<Record<string, unknown>> {
    const text=opts.text.trim();
    if(!/^\/compact(?:\s|$)/.test(text)||text.length>200000||!opts.requestId||opts.requestId.length>200) throw Object.assign(new Error('Invalid compact command'),{status:400});
    const holder=ctx.state as typeof ctx.state & {commandOperations?:Set<string>};
    const active=holder.commandOperations??=new Set<string>();
    const operationId=Bun.randomUUIDv7();
    const claim=await ctx.fns.procs.db.transaction({fn:async()=>{
    const owner=(await ctx.fns.procs.db.select({sql:'SELECT id,archived_at FROM agents WHERE id=? FOR UPDATE',params:[opts.agentId]}))[0];
    if(!owner) throw Object.assign(new Error('Agent not found'),{status:404});
    if(owner.archived_at!=null) throw Object.assign(new Error('Restore this archived chat first'),{status:409});
    const prior=(await ctx.fns.procs.db.select({sql:'SELECT command_text,result FROM agent_command_requests WHERE agent_id=? AND request_id=?',params:[opts.agentId,opts.requestId]}))[0];
    if(prior){
    if(prior.command_text!==text) throw Object.assign(new Error('Idempotency key reused for different input'),{status:409,code:'idempotency_conflict'});
    const stored=typeof prior.result==='string'?JSON.parse(prior.result):prior.result;
    if(stored.status==='running'&&!active.has(stored.operationId)){
    stored.status='interrupted';stored.ok=false;stored.error='The operation owner is no longer available. Inspect context before starting a new attempt.';stored.finishedAt=Date.now();
    await ctx.fns.procs.db.run({sql:'UPDATE agent_command_requests SET result=?::jsonb WHERE agent_id=? AND request_id=?',params:[JSON.stringify(stored),opts.agentId,opts.requestId]});
    await ctx.fns.commands.recordEvent({agentId:opts.agentId,type:'command_result',commandName:'compact',commandText:text,requestId:opts.requestId,operationId:stored.operationId,status:'interrupted',text:stored.error,error:stored.error});
    }
    return {...stored,duplicate:true};
    }
    if((await ctx.fns.procs.db.select({sql:'SELECT idx FROM messages WHERE agent_id=? AND client_request_id=? LIMIT 1',params:[opts.agentId,opts.requestId]}))[0]) throw Object.assign(new Error('Idempotency key belongs to a chat message'),{status:409,code:'idempotency_conflict'});
    await ctx.fns.planning.assertIdle({agentId:opts.agentId});
    const running=(await ctx.fns.procs.db.select({sql:"SELECT request_id FROM agent_command_requests WHERE agent_id=? AND result->>'command'='compact' AND result->>'status'='running' LIMIT 1",params:[opts.agentId]}))[0];
    if(running) throw Object.assign(new Error('Another compact operation is pending; retry its original request key to inspect it'),{status:409,code:'command_running'});
    const accepted={ok:true,command:'compact',requestId:opts.requestId,operationId,status:'running',scheduled:false,createdAt:Date.now()};
    await ctx.fns.procs.db.run({sql:'INSERT INTO agent_command_requests(agent_id,request_id,command_text,result) VALUES (?,?,?,?::jsonb)',params:[opts.agentId,opts.requestId,text,JSON.stringify(accepted)]});
    await ctx.fns.commands.recordEvent({agentId:opts.agentId,type:'command_invocation',commandName:'compact',commandText:text,requestId:opts.requestId,operationId,status:'running',text});
    active.add(operationId);
    return accepted;
    }}) as Record<string,unknown>;
    if(claim.duplicate) return claim;
    let finished:Record<string,unknown>;
    try {
    const agent=ctx.state.agent?.[opts.agentId]??await ctx.fns.session.load({id:opts.agentId});
    if(!agent) throw new Error('Agent not found');
    const instructions=text.slice('/compact'.length).trim();
    const result=await ctx.fns.agent.compactContext({agent,...(instructions?{instructions}:{})});
    finished={...claim,status:'completed',result,finishedAt:Date.now()};
    } catch(error) {finished={...claim,ok:false,status:'failed',error:String((error as Error).message??error),finishedAt:Date.now()};}
    try {
    await ctx.fns.procs.db.transaction({fn:async()=>{
    await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? FOR UPDATE',params:[opts.agentId]});
    const saved=await ctx.fns.procs.db.run({sql:"UPDATE agent_command_requests SET result=?::jsonb WHERE agent_id=? AND request_id=? AND result->>'operationId'=? AND result->>'status'='running'",params:[JSON.stringify(finished),opts.agentId,opts.requestId,operationId]});
    if(saved.changes!==1) throw new Error('Compact result ownership changed; inspect context before retrying');
    const result=finished.result as Record<string,unknown>|undefined;
    await ctx.fns.commands.recordEvent({agentId:opts.agentId,type:'command_result',commandName:'compact',commandText:text,requestId:opts.requestId,operationId,status:finished.status as 'completed'|'failed',text:finished.status==='completed'?'Context compaction: '+String(result?.status):String(finished.error),...(result?{result}:{}),...(finished.error?{error:String(finished.error)}:{})});
    }});
    } finally {active.delete(operationId);}
    try {const live=ctx.state.agent?.[opts.agentId];if(live)await ctx.fns.session.syncAgentState({agent:live});ctx.fns.procs.events.refresh({topic:'agent:'+opts.agentId,reason:'command'});} catch(error) {console.error('Command accepted; refresh failed',error);}
    return finished;
}
