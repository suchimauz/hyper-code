/**
 * Commit a serialized immutable run snapshot with bounded revision conflict retries
 *
 * Internal accounting hook. Holds the run queue through commit, retries only recognized revision conflicts with unchanged active goal identity and objective, and returns revision and budget transition for caller steering. Revoked tokens block; capability-authorized descendants can deliver to idle roots. Never schedules work or hides accounting failure.
 * @param opts.state Live run binding whose queue serializes usage and checkpoints.
 * @param opts.maxAttempts Maximum accounting attempts for one frozen snapshot. @default 3 @minimum 1 @maximum 5
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Live run binding whose queue serializes usage and checkpoints. */
        state: types.goal.RunState;
        /** Maximum accounting attempts for one frozen snapshot. @default 3 @minimum 1 @maximum 5 */
        maxAttempts?: number;
    },
): Promise<types.goal.RunResult> {
    const s=opts.state;
    if(s.sealed) return {kind:'blocked',reason:'Run accounting sealed for Stop',allowContinuation:false};
    const pending=s.tail.then(async ():Promise<types.goal.RunResult>=>{
     try {
      if(!await ctx.fns.goal.enabled({})) return {kind:'disabled',allowContinuation:false};
      if(s.pendingRequests.size) return {kind:'blocked',reason:'Provider requests are still pending',allowContinuation:false};
      if(s.blocked) return {kind:'blocked',reason:s.blocked,allowContinuation:false};
      const attempts=opts.maxAttempts??3;
      if(!Number.isInteger(attempts)||attempts<1||attempts>5) throw new Error('maxAttempts must be 1..5');
      const b=s.binding,u=s.usage;
      if(u && (u.quality!=='exact'||u.inputTokens===null||u.cachedInputTokens===null||u.outputTokens===null)) throw new Error('Incomplete usage blocks accounting');
      // No requests recorded is exactly zero, not a missing provider response. Every request must call runUsageRecord.
      const snapshot=Object.freeze({...(b.authority?{authority:b.authority}:{}),agentId:b.rootAgentId,goalId:b.goalId,runToken:b.runToken,sourceAgentId:b.sourceAgentId,runId:b.runId,checkpointId:crypto.randomUUID(),sequence:s.sequence+1,clockEpoch:b.clockEpoch,current:Object.freeze({input:u?.inputTokens??'0',cached:u?.cachedInputTokens??'0',output:u?.outputTokens??'0'}),quality:'exact' as const,boundaryGoalId:b.goalId,boundaryRootAgentId:b.rootAgentId,nowMs:performance.now(),initialNowMs:b.initialNowMs,initialBaseline:Object.freeze({input:'0',cached:'0',output:'0'})});
      for(let attempt=0;attempt<attempts;attempt++) {
       try {
        const result=await ctx.fns.goal.accountingCheckpoint({...snapshot,expectedRevision:s.revision});
        if('disabled' in result) return {kind:'disabled',allowContinuation:false};
        s.revision=result.revision;s.sequence=snapshot.sequence;
        return {kind:'committed',checkpointId:snapshot.checkpointId,sequence:snapshot.sequence,revision:result.revision,budgetTransition:result.budgetTransition,status:result.status,allowContinuation:!b.authority && result.status==='active'};
       } catch(error) {
        const message=error instanceof Error?error.message:String(error);
        if(message!=='Goal conflict: revision changed; reread and retry same immutable snapshot'||attempt+1>=attempts) throw error;
        const read=await ctx.fns.goal.read({agentId:b.rootAgentId});
        if(!read.enabled) return {kind:'disabled',allowContinuation:false};
        if(!read.goal||read.goal.goalId!==b.goalId||read.goal.objective!==b.objective||read.goal.status!=='active') throw new Error('Goal boundary changed during checkpoint retry');
        s.revision=read.goal.revision;
       }
      }
      throw new Error('Checkpoint retry limit exhausted');
     } catch(error) {s.blocked=String(error);return {kind:'blocked',reason:s.blocked,allowContinuation:false};}
    });
    s.tail=pending.then(()=>{});
    return await pending;
}
