/**
 * Atomically resume an idle goal through an explicit idempotent trusted request
 *
 * Trusted internal API, not a model tool or public authorization boundary. Exact owner Stop and claim CAS, goal CAS, cumulative usage preservation. Running or delegated authority is rejected. Deferred requests retain Stop and their exact result. Successful admission alone atomically clears Stop and queues work. Actor authentication belongs to the future trusted adapter. Requires migration 00007 but never applies it.
 * @param opts.agentId Independently authorized owner; lineage grants no authority.
 * @param opts.expectedGoalId Observed goal UUID.
 * @param opts.expectedRevision Observed revision. @minimum 1
 * @param opts.expectedRunToken Explicit idle claim expectation.
 * @param opts.resumeRequestId UUID reused only with the identical payload.
 * @param opts.expectedStoppedAt Exact observed Stop timestamp or null.
 * @param opts.patch Optional objective and budget edits; omission preserves each field.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Independently authorized owner; lineage grants no authority. */
        agentId: string;
        /** Observed goal UUID. */
        expectedGoalId: string;
        /** Observed revision. @minimum 1 */
        expectedRevision: number;
        /** Explicit idle claim expectation. */
        expectedRunToken: null;
        /** UUID reused only with the identical payload. */
        resumeRequestId: string;
        /** Exact observed Stop timestamp or null. */
        expectedStoppedAt: number | null;
        /** Optional objective and budget edits; omission preserves each field. */
        patch?: {objective?:string;tokenBudget?:number|null};
    },
): Promise<{goal:types.goal.State|null;resume:{scheduled:boolean;reason:string;receiptId?:string;messageIdx?:number}}> {
    if(!await ctx.fns.goal.enabled({}))throw new Error('Goal feature disabled');
    if(opts.expectedRunToken!==null)throw new Error('Goal conflict: active source mutation requires dispatch barrier');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opts.resumeRequestId)||!Number.isSafeInteger(opts.expectedRevision)||opts.expectedRevision<1||(opts.expectedStoppedAt!==null&&!Number.isSafeInteger(opts.expectedStoppedAt)))throw new Error('Invalid resume binding');
    const canonical=(v:any):string=>JSON.stringify(v,(_k,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
    const payload=canonical(opts);
    return await ctx.fns.procs.db.transaction({fn:async()=>{
     const owner=(await ctx.fns.procs.db.select({sql:'SELECT run_token,run_state,stopped_at,archived_at,last_processed_msg_idx FROM agents WHERE id=? FOR UPDATE',params:[opts.agentId]}))[0];
     if(!owner)throw new Error('Goal owner unavailable');
     const prior=(await ctx.fns.procs.db.select({sql:'SELECT request_payload,result FROM goal_resume_requests WHERE agent_id=? AND resume_request_id=?::uuid',params:[opts.agentId,opts.resumeRequestId]}))[0];
     if(prior){if(canonical(prior.request_payload)!==payload)throw new Error('Resume request payload conflict');return prior.result;}
     if(owner.archived_at!=null||owner.run_state!=='idle'||owner.run_token!==null||(owner.stopped_at==null?null:Number(owner.stopped_at))!==opts.expectedStoppedAt)throw new Error('Goal conflict: owner claim or Stop changed');
     const delegated=(await ctx.fns.procs.db.select({sql:`SELECT (EXISTS(SELECT 1 FROM goal_delegation_reservations WHERE root_agent_id=? AND goal_id=?::uuid AND task_state IN ('open','pending_review')) OR EXISTS(SELECT 1 FROM goal_delegations WHERE root_agent_id=? AND goal_id=?::uuid AND (closed_at IS NULL OR reservation_id IS NULL))) AS outstanding`,params:[opts.agentId,opts.expectedGoalId,opts.agentId,opts.expectedGoalId]}))[0];
     if(!delegated||delegated.outstanding)throw new Error('Goal conflict: outstanding source accounting authority');
     const goal=await ctx.fns.goal.persistTx({agentId:opts.agentId,expectedGoalId:opts.expectedGoalId,expectedRevision:opts.expectedRevision,command:{kind:'set',status:'active',objective:opts.patch?.objective,tokenBudget:opts.patch?.tokenBudget}});
     const capability=await ctx.fns.goal.nativeCapability({agentId:opts.agentId});
     let reason=!goal||goal.status!=='active'?'goal_not_active':!capability.available?capability.reason:'';
     if(!reason){const guards=(await ctx.fns.procs.db.select({sql:`SELECT EXISTS(SELECT 1 FROM goal_continuation_deferrals WHERE agent_id=? AND goal_id=?) AS deferred, EXISTS(SELECT 1 FROM inputs WHERE agent_id=? AND state='open') AS pending_input, EXISTS(SELECT 1 FROM messages m WHERE agent_id=? AND role='user' AND excluded_from_cursor=0 AND idx>? AND NOT (message_type='goal_continuation' AND EXISTS(SELECT 1 FROM goal_continuation_admissions a WHERE a.agent_id=m.agent_id AND a.message_idx=m.idx))) AS pending_user`,params:[opts.agentId,opts.expectedGoalId,opts.agentId,opts.agentId,Number(owner.last_processed_msg_idx??-1)]}))[0];if(!guards)throw new Error('Missing resume guards');reason=guards.deferred?'deferred':guards.pending_input?'pending_input':guards.pending_user?'pending_user':'';}
     const result:{goal:types.goal.State|null;resume:{scheduled:boolean;reason:string;receiptId?:string;messageIdx?:number}}={goal,resume:{scheduled:false,reason:reason||'admitted',receiptId:opts.resumeRequestId}};
     const now=Date.now();
     if(!reason&&goal){
     // Retire only authenticated prior internal admissions; never hide ordinary human input.
     await ctx.fns.procs.db.run({sql:`UPDATE messages m SET excluded_from_cursor=1,excluded_from_llm=1 WHERE m.agent_id=? AND m.role='user' AND m.message_type='goal_continuation' AND m.idx>? AND EXISTS(SELECT 1 FROM goal_continuation_admissions a WHERE a.agent_id=m.agent_id AND a.message_idx=m.idx)`,params:[opts.agentId,Number(owner.last_processed_msg_idx??-1)]});
     const message=await ctx.fns.session.appendMessage({id:opts.agentId,clientRequestId:'goal-resume:'+opts.resumeRequestId,ts:now,message:{role:'user',author:null,content:'Continue working toward the active goal. Check its current state before acting; stop if it is no longer active. This internal continuation is not new human authorization.',message_type:'goal_continuation',excluded_from_cursor:false,excluded_from_llm:false}});
     if(message.idx<=Number(owner.last_processed_msg_idx??-1))throw new Error('Resume must exceed consumed cursor');
     await ctx.fns.procs.db.run({sql:`INSERT INTO goal_continuation_admissions(agent_id,goal_id,goal_revision,message_idx,created_at,origin,run_token,resume_request_id,capability_fingerprint) VALUES(?,?,?,?,?,'external_resume',NULL,?::uuid,?)`,params:[opts.agentId,goal.goalId,goal.revision,message.idx,now,opts.resumeRequestId,capability.fingerprint]});
     const wake=await ctx.fns.procs.db.run({sql:`UPDATE agents SET stopped_at=NULL,next_run_at=? WHERE id=? AND run_state='idle' AND run_token IS NULL`,params:[now,opts.agentId]});
     if(wake.changes!==1)throw new Error('Resume wake lost owner');
     result.resume.scheduled=true;result.resume.messageIdx=message.idx;
     }
     await ctx.fns.procs.db.run({sql:'INSERT INTO goal_resume_requests(agent_id,resume_request_id,request_payload,result,created_at) VALUES(?,?::uuid,?::jsonb,?::jsonb,?)',params:[opts.agentId,opts.resumeRequestId,payload,JSON.stringify(result),now]});
     return result;
    }}) as {goal:types.goal.State|null;resume:{scheduled:boolean;reason:string;receiptId?:string;messageIdx?:number}};
}
