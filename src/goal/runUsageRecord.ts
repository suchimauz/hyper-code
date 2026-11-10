/**
 * Serialize normalized request usage into an ephemeral run accumulator
 *
 * Internal run hook called once for every request, including missing usage. Uses request IDs for deduplication; missing usage retains partial provenance without blocking automatic continuation. Does not perform SQL.
 * @param opts.state Ephemeral state from runBindingCapture, never a fork clone.
 * @param opts.provider Actual provider identifier captured before request.
 * @param opts.requestId Stable unique request ID; reuse only for the same response.
 * @param opts.format Verified provenance-preserving usage format.
 * @param opts.usage Raw provider usage; undefined is intentionally recorded as unknown.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Ephemeral state from runBindingCapture, never a fork clone. */
        state: types.goal.RunState;
        /** Actual provider identifier captured before request. */
        provider: string;
        /** Stable unique request ID; reuse only for the same response. */
        requestId: string;
        /** Verified provenance-preserving usage format. */
        format: "openai-chat" | "openai-responses" | "anthropic-raw" | "mauzcode-stream-anthropic" | "common-stream" | "unsupported";
        /** Raw provider usage; undefined is intentionally recorded as unknown. */
        usage: unknown;
    },
): Promise<types.goal.RunResult> {
    const s=opts.state;
    if(s.sealed) return {kind:'blocked',reason:'Run accounting sealed for Stop',allowContinuation:false};
    const pending=s.tail.then(async ():Promise<types.goal.RunResult> => {
     try {
      if(!await ctx.fns.goal.enabled({})) return {kind:'disabled',allowContinuation:false};
      if(s.blocked) return {kind:'blocked',reason:s.blocked,allowContinuation:false};
      const b=s.binding;
      const usage=await ctx.fns.goal.usageNormalize({binding:{provider:opts.provider,requestId:opts.requestId,sourceAgentId:b.sourceAgentId,runId:b.runId,rootAccountingAgentId:b.rootAgentId,goalIdAtBoundary:b.goalId},format:opts.format,usage:opts.usage});
      s.usage=await ctx.fns.goal.usageAccumulate({state:s.usage,usage});
      return {kind:'recorded',allowContinuation:false};
     } catch(error) {s.blocked=String(error);return {kind:'blocked',reason:s.blocked,allowContinuation:false};} finally {s.pendingRequests.delete(opts.requestId);}
    });
    s.tail=pending.then(()=>{});
    return await pending;
}
