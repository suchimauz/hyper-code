/**
 * Seal a run and freeze its final exact accounting snapshot before Stop locks
 *
 * Call after abort and before opening the owner transaction. Seals admission, drains only the previously queued accounting tail, never waits for provider network completion, and reports incomplete usage explicitly. Repeated calls share the same immutable handoff. No database work is started here.
 * @param opts.agentId Captured source agent identity.
 * @param opts.runToken Immutable worker claim token captured by Stop.
 * @param opts.timeoutMs Maximum accounting-tail drain wait. @default 1000 @minimum 1 @maximum 10000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Captured source agent identity. */
        agentId: string;
        /** Immutable worker claim token captured by Stop. */
        runToken: string;
        /** Maximum accounting-tail drain wait in milliseconds. @default 1000 @minimum 1 @maximum 10000 */
        timeoutMs?: number;
    },
): Promise<types.goal.StopPreparation> {
    const timeoutMs=opts.timeoutMs??1000;
    if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw new Error('timeoutMs must be 1..10000');
    const s=await ctx.fns.goal.runStopRegistry({action:'get',agentId:opts.agentId,runToken:opts.runToken});
    if(!s)return {kind:'absent'};
    const holder=ctx.state as typeof ctx.state & {goalStopPrepared?:WeakMap<types.goal.RunState,Promise<types.goal.StopPreparation>>};
    const prepared=holder.goalStopPrepared??=new WeakMap();const prior=prepared.get(s);if(prior)return await prior;
    s.sealed=true;const tail=s.tail;
    const pending=(async():Promise<types.goal.StopPreparation>=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([tail,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Accounting tail drain timed out')),timeoutMs);})]);}
    catch(error){return {kind:'blocked',authority:s.binding.authority,goalId:s.binding.goalId,state:s,reason:'Accounting tail failed: '+String(error)};}
    finally{if(timer!==undefined)clearTimeout(timer);}
    const b=s.binding,u=s.usage;const cutoffMs=performance.now();
    if(s.blocked||s.pendingRequests.size||u&&(u.inputTokens===null||u.cachedInputTokens===null||u.outputTokens===null))return {kind:'blocked',authority:s.binding.authority,goalId:b.goalId,state:s,reason:s.blocked??'Incomplete final usage at Stop'};
    const snapshot=Object.freeze({...(b.authority?{authority:b.authority}:{}),agentId:b.rootAgentId,goalId:b.goalId,expectedRevision:s.revision,runToken:b.runToken,sourceAgentId:b.sourceAgentId,runId:b.runId,checkpointId:crypto.randomUUID(),sequence:s.sequence+1,clockEpoch:b.clockEpoch,current:Object.freeze({input:u?.inputTokens??'0',cached:u?.cachedInputTokens??'0',output:u?.outputTokens??'0'}),quality:u?.quality ?? 'exact',usageEvidence:u?.requests ?? {},boundaryGoalId:b.goalId,boundaryRootAgentId:b.rootAgentId,nowMs:cutoffMs,initialNowMs:b.initialNowMs,initialBaseline:Object.freeze({input:'0',cached:'0',output:'0'})});
    return Object.freeze({kind:'ready' as const,authority:b.authority,goalId:b.goalId,state:s,snapshot});})();
    prepared.set(s,pending);return await pending;
}
