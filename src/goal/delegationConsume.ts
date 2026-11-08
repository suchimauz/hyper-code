/**
 * Bind an open task grant to an admitted real worker claim
 *
 * Trusted worker hook after claim commit, before continuation or model work. Bound authority uses original root and actual claim token, never lifecycle ID. Blocked results AND thrown errors prohibit ordinary fallback; lock contention requires retry of the whole hook. Same-token replay reauthorizes; replacement tokens require a settled durable retry permit. Unapproved user input parks admission without consuming that permit. Disabled mode uses a schema-independent agents probe. Does not schedule work.
 * @param opts.sourceAgentId Concrete worker-claimed child.
 * @param opts.sourceRunToken Actual committed worker claim token.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Concrete worker-claimed child. */
        sourceAgentId: string;
        /** Actual committed worker claim token. */
        sourceRunToken: string;
    },
): Promise<types.goal.DelegationConsumeResult> {
    // Schema-independent probe also protects disabled mode before the migration exists.
    const [source]=await ctx.fns.procs.db.select({sql:"SELECT id, to_jsonb(a)->>'goal_delegation_required' AS required FROM agents a WHERE id=?",params:[opts.sourceAgentId]});
    if(!source) return {status:'blocked',reason:'Source missing'};
    const required=source.required==='true';
    if(!await ctx.fns.goal.enabled({})) return required ? {status:'blocked',reason:'Required delegation disabled'} : {status:'disabled'};
    // Marker is set atomically with publication while child is idle. Worker claim already committed.
    if(!required) return {status:'absent'};
    return await ctx.fns.procs.db.transaction({fn:async()=>{
    const [hint]=await ctx.fns.procs.db.select({sql:'SELECT * FROM goal_delegation_reservations WHERE source_agent_id=?',params:[opts.sourceAgentId]});
    if(!hint) return {status:'blocked',reason:'Required reservation missing'};
    await ctx.fns.goal.delegationLock({rootAgentId:hint.root_agent_id,goalId:hint.goal_id,sourceAgentId:opts.sourceAgentId,sourceRunToken:opts.sourceRunToken});
    const [r]=await ctx.fns.procs.db.select({sql:'SELECT * FROM goal_delegation_reservations WHERE reservation_id=?::uuid FOR UPDATE',params:[hint.reservation_id]});
    if(!r || r.cancelled_at!=null) return {status:'blocked',reason:'Reservation missing or cancelled'};
    if(r.task_state!=='open' || r.authorized_through_idx==null) return {status:'blocked',reason:'Task grant not open or frontier missing'};
    const [extra]=await ctx.fns.procs.db.select({sql:"SELECT EXISTS(SELECT 1 FROM messages WHERE agent_id=? AND role='user' AND excluded_from_cursor=0 AND idx>?) AS unauthorized",params:[opts.sourceAgentId,r.authorized_through_idx]});
    if(!extra || extra.unauthorized) return {status:'blocked',reason:'Unapproved task input'};
    if(r.source_agent_id!==opts.sourceAgentId || r.root_agent_id!==hint.root_agent_id || r.goal_id!==hint.goal_id) throw new Error('Immutable reservation changed');
    const goal=await ctx.fns.goal.read({agentId:r.root_agent_id});
    if(!goal.enabled || goal.goal?.status!=='active') return {status:'blocked',reason:'Root goal not active'};
    const [existing]=await ctx.fns.procs.db.select({sql:'SELECT * FROM goal_delegations WHERE reservation_id=?::uuid AND source_run_id=?',params:[r.reservation_id,opts.sourceRunToken]});
    if(existing){
     const authority=await ctx.fns.goal.delegationAuthorize({rootAgentId:r.root_agent_id,goalId:r.goal_id,sourceAgentId:opts.sourceAgentId,sourceRunId:opts.sourceRunToken,sourceRunToken:opts.sourceRunToken,capabilityId:existing.capability_id});
     return {status:'bound',authority:Object.freeze({...authority,authorizedThroughIdx:Number(r.authorized_through_idx)})};
    }
    if(r.consumed_at!=null){
     if(!r.retry_from_run_id) return {status:'blocked',reason:'No durable retry permit'};
     const [previous]=await ctx.fns.procs.db.select({sql:'SELECT * FROM goal_delegations WHERE reservation_id=?::uuid AND source_run_id=?',params:[r.reservation_id,r.retry_from_run_id]});
     if(!previous || previous.closed_at==null || previous.revoked_at!=null || previous.settled_checkpoint_id==null) return {status:'blocked',reason:'Previous claim not settled'};
    }
    // Durable ancestry, not live ancestor tokens. Root lock serializes revocations.
    let id:string|null=r.parent_capability_id;
    const seen=new Set<string>(); let first=true;
    if((r.delegator_agent_id===r.root_agent_id)!==(id===null)) throw new Error('Invalid inherited reservation');
    while(id){
     if(seen.has(id)||seen.size>=128) throw new Error('Invalid capability ancestry');
     seen.add(id);
     const [cap]=await ctx.fns.procs.db.select({sql:'SELECT * FROM goal_delegations WHERE capability_id=?::uuid',params:[id]});
     if(!cap || cap.revoked_at!=null || cap.root_agent_id!==r.root_agent_id || cap.goal_id!==r.goal_id) return {status:'blocked',reason:'Parent capability missing or revoked'};
     if(first && (cap.source_agent_id!==r.delegator_agent_id || cap.source_run_id!==r.delegator_run_id)) throw new Error('Delegator capability mismatch');
     first=false; id=cap.parent_capability_id;
    }
    const capabilityId=crypto.randomUUID(), now=Date.now();
    await ctx.fns.procs.db.run({sql:'INSERT INTO goal_delegations(capability_id,root_agent_id,goal_id,source_agent_id,source_run_id,delegator_agent_id,delegator_run_id,parent_capability_id,created_at) VALUES (?::uuid,?,?::uuid,?,?,?,?,?::uuid,?)',params:[capabilityId,r.root_agent_id,r.goal_id,opts.sourceAgentId,opts.sourceRunToken,r.delegator_agent_id,r.delegator_run_id,r.parent_capability_id,now]});
    await ctx.fns.procs.db.run({sql:'UPDATE goal_delegations SET reservation_id=?::uuid WHERE capability_id=?::uuid',params:[r.reservation_id,capabilityId]});
    if(r.consumed_at==null) await ctx.fns.procs.db.run({sql:'UPDATE goal_delegation_reservations SET consumed_at=?,source_run_id=?,capability_id=?::uuid WHERE reservation_id=?::uuid',params:[now,opts.sourceRunToken,capabilityId,r.reservation_id]});
    await ctx.fns.procs.db.run({sql:'UPDATE goal_delegation_reservations SET retry_from_run_id=NULL WHERE reservation_id=?::uuid',params:[r.reservation_id]});
    return {status:'bound',authority:Object.freeze({capabilityId,rootAgentId:r.root_agent_id,goalId:r.goal_id,sourceAgentId:opts.sourceAgentId,sourceRunId:opts.sourceRunToken,authorizedThroughIdx:Number(r.authorized_through_idx),allowContinuation:false as const})};
    }}) as types.goal.DelegationConsumeResult;
}
