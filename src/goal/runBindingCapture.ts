/**
 * Capture an immutable goal accounting binding before a run starts model work
 *
 * Internal trusted run hook only, not a model-facing tool. Excludes goal and knowledge sidecars before database access. Descendants require worker-consumed capability authority, validated in a root-first transaction; no lineage inference. Returns inactive only after a successful read of a non-active Goal, allowing ordinary owner chat without accounting. Read or authority failures return blocked and must stop dispatch; never admits or schedules work.
 * @param opts.sourceAgentId Trusted runtime producer identity.
 * @param opts.runId Immutable lifecycle run identifier.
 * @param opts.runToken Immutable worker claim token captured before model work.
 * @param opts.role Trusted caller classification, never supplied by a model.
 * @param opts.authority Trusted immutable authority returned by worker delegationConsume, never model input.
 * @param opts.rootAgentId Explicit accounting root; must match supplied descendant authority.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trusted runtime producer identity. */
        sourceAgentId: string;
        /** Immutable lifecycle run identifier. */
        runId: string;
        /** Immutable worker claim token captured before model work. */
        runToken: string;
        /** Trusted caller classification, never supplied by a model. */
        role: 'normal' | 'goal-sidecar' | 'knowledge-sidecar';
        /** Explicit accounting root; must match supplied descendant authority. */
        rootAgentId?: string;
        /** Trusted worker-consumed capability; absent for root runs. */
        authority?: types.goal.DelegationAuthority;
    },
): Promise<types.goal.RunResult> {
    if (opts.role !== 'normal') return {kind:'excluded',allowContinuation:false};
    try {
     if (!await ctx.fns.goal.enabled({})) return {kind:'disabled',allowContinuation:false};
     if (!opts.runToken || !opts.runId || !opts.sourceAgentId) return {kind:'blocked',reason:'Missing immutable run authority',allowContinuation:false};
     const authority=opts.authority ? Object.freeze({...opts.authority}) : undefined;
     const rootAgentId=opts.rootAgentId ?? authority?.rootAgentId ?? opts.sourceAgentId;
     if(authority){
      if(authority.rootAgentId!==rootAgentId || authority.sourceAgentId!==opts.sourceAgentId || authority.sourceRunId!==opts.runToken || rootAgentId===opts.sourceAgentId) throw new Error('Delegation binding scope mismatch');
      await ctx.fns.procs.db.transaction({fn:async()=>await ctx.fns.goal.delegationAuthorize({rootAgentId,goalId:authority.goalId,sourceAgentId:opts.sourceAgentId,sourceRunId:authority.sourceRunId,sourceRunToken:opts.runToken,capabilityId:authority.capabilityId})});
     }else if(rootAgentId !== opts.sourceAgentId) throw new Error('Descendant accounting requires capability');
     const read=await ctx.fns.goal.read({agentId:rootAgentId});
     if(!read.enabled) return {kind:'disabled',allowContinuation:false};
     if(authority && (!read.goal || read.goal.goalId!==authority.goalId)) throw new Error('Delegation goal identity changed');
     if(!read.goal) return {kind:'absent',allowContinuation:false};
     if(read.goal.status !== 'active') return {kind:'inactive',goalId:read.goal.goalId,allowContinuation:false};
     const binding=Object.freeze({...(authority?{authority}:{}),rootAgentId,sourceAgentId:opts.sourceAgentId,goalId:read.goal.goalId,objective:read.goal.objective,runId:authority?.sourceRunId ?? opts.runId,runToken:opts.runToken,clockEpoch:String(performance.timeOrigin),initialNowMs:performance.now()});
     return {kind:'bound',state:{binding,sealed:false,pendingRequests:new Set<string>(),revision:read.goal.revision,sequence:0,tail:Promise.resolve()},allowContinuation:false};
    } catch(error) {return {kind:'blocked',reason:String(error),allowContinuation:false};}
}
