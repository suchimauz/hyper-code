/**
 * Validate queued goal-only work against current durable guards before a model call.
 *
 * Worker hook after claiming a token and freezing the user frontier. First attempts one token-fenced durable human queue promotion through existing acceptance; this also works with Goals disabled. Otherwise owns a short goal transaction and does not change messages, cursor or scheduling. Admissions bind internal messages to scoped goal identity. Ordinary pending user work bypasses goal guards but caller must omit synthetic continuations from that model input. Disabled returns without goal SQL: caller must keep ordinary chat and independently suppress recognized goal continuations. Skip and defer require explicit worker handling; do not feed synthetic messages to the model or busy-loop them.
 * @param opts.agentId Claimed worker owner.
 * @param opts.runToken Live claim token checked before any goal decision.
 * @param opts.frontierIdx Frozen maximum cursor-visible user idx for this run. @minimum -1
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Claimed worker owner. */
        agentId: string;
        /** Live claim token checked before any goal decision. */
        runToken: string;
        /** Frozen maximum cursor-visible user idx for this run. @minimum -1 */
        frontierIdx: number;
    },
): Promise<{action:"run"|"skip"|"defer"|"disabled";reason:string;continuationIdxs:number[];suppressIdxs:number[];humanPending:boolean;recommendation:string}> {
    const result=(action:"run"|"skip"|"defer"|"disabled",reason:string,continuationIdxs:number[]=[],humanPending=false)=>({action,reason,continuationIdxs,suppressIdxs:action==='run'&&!humanPending?[]:continuationIdxs,humanPending,recommendation:action==='disabled'?'Preserve ordinary chat; suppress known goal continuations without querying goal tables.':humanPending?'Run ordinary input; omit all listed synthetic continuation messages.':action==='run'?'Run validated goal continuation.':action==='skip'?'Do not call model; retire only identified stale continuation work with token-fenced cursor handling.':'Do not call model or advance cursor; clear automatic wake token-safely and wait for explicit input or barrier release.'});
    // This dynamic worker startup hook is also reached by already-running worker
    // closures after a hot reload. Queue acceptance is token-fenced and refuses
    // promotion when ordinary or synthetic transcript work is already pending.
    const queued = await ctx.fns.agent.promoteQueuedTurn({agentId:opts.agentId,runToken:opts.runToken});
    if (queued?.ok) return result('run','queued_human_input',[],true);
    if(!await ctx.fns.goal.enabled({})) return result('disabled','disabled');
    if(!Number.isSafeInteger(opts.frontierIdx)||opts.frontierIdx< -1||!opts.runToken) throw new Error('Invalid start binding');
    return await ctx.fns.procs.db.transaction({fn:async()=>{
    const owner=(await ctx.fns.procs.db.select({sql:'SELECT run_token,run_state,stopped_at,archived_at,last_processed_msg_idx FROM agents WHERE id=? FOR UPDATE',params:[opts.agentId]}))[0];
    if(!owner || owner.run_token!==opts.runToken || owner.run_state!=='running' || owner.stopped_at!=null || owner.archived_at!=null) return result('defer','fenced');
    const messages=await ctx.fns.procs.db.select({sql:"SELECT m.idx,m.message_type,a.goal_id FROM messages m LEFT JOIN goal_continuation_admissions a ON a.agent_id=m.agent_id AND a.message_idx=m.idx WHERE m.agent_id=? AND m.role='user' AND m.excluded_from_cursor=0 AND m.idx>? AND m.idx<=? ORDER BY m.idx",params:[opts.agentId,Number(owner.last_processed_msg_idx??-1),opts.frontierIdx]});
    const synthetic=messages.filter(m=>m.message_type==='goal_continuation'||m.goal_id!=null);
    const idxs=synthetic.map(m=>Number(m.idx));
    if(messages.some(m=>m.message_type!=='goal_continuation'&&m.goal_id==null)) return result('run','ordinary_input',idxs,true);
    if(!synthetic.length) return result('skip','no_pending_input');
    const goal=(await ctx.fns.procs.db.select({sql:'SELECT goal_id,status,token_budget,tokens_used FROM agent_goals WHERE agent_id=? FOR UPDATE',params:[opts.agentId]}))[0];
    if(!goal || synthetic.some(m=>m.goal_id==null || m.goal_id!==goal.goal_id)) return result('skip','stale_binding',idxs);
    if(goal.status!=='active'||(goal.token_budget!=null&&Number(goal.tokens_used)>=Number(goal.token_budget))) return result('skip','inactive',idxs);
    const guards=(await ctx.fns.procs.db.select({sql:"SELECT EXISTS(SELECT 1 FROM goal_continuation_deferrals WHERE agent_id=? AND goal_id=?) AS deferred, EXISTS(SELECT 1 FROM inputs WHERE agent_id=? AND state='open') AS pending_input",params:[opts.agentId,goal.goal_id,opts.agentId]}))[0];
    if(!guards) throw new Error('Missing continuation start guards');
    if(guards.pending_input||guards.deferred) return result('defer',guards.pending_input?'pending_input':'deferred',idxs);
    const capability=await ctx.fns.goal.nativeCapability({agentId:opts.agentId});
    if(!capability.available)return result('defer',capability.reason,idxs);
    return result('run','validated',idxs);
    }}) as {action:"run"|"skip"|"defer"|"disabled";reason:string;continuationIdxs:number[];suppressIdxs:number[];humanPending:boolean;recommendation:string};
}
