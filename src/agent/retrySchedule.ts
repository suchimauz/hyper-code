/**
 * Persist a model retry decision under the current run lease.
 *
 * Use only after a failed model request, before waiting. Locks the agent row to serialize Stop and concurrent run recovery, increments the durable attempt and appends a retry event atomically.
 * @param opts.agentId Agent owning the request.
 * @param opts.runToken Current worker lease or null for a direct run.
 * @param opts.failure Classified request failure.
 * @param opts.signal Run cancellation signal.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent owning the request. */
        agentId: string;
        /** Current worker lease or null for a direct run. */
        runToken: string | null;
        /** Classified request failure. */
        failure: types.llm.FailureInfo;
        /** Run cancellation signal. */
        signal: AbortSignal;
    },
): Promise<boolean> {
    const scheduled = await ctx.fns.procs.db.transaction({fn:async()=>{
     const row = (await ctx.fns.procs.db.select({sql:'SELECT llm_retry_attempt,stopped_at,run_token FROM agents WHERE id = ? FOR UPDATE',params:[opts.agentId]}))[0];
     opts.signal.throwIfAborted();
     if (!row || row.stopped_at != null || (opts.runToken && row.run_token !== opts.runToken)) throw new DOMException('Retry ownership lost','AbortError');
     const attempt = Number(row.llm_retry_attempt ?? 0);
     const decision = await ctx.fns.llm.retryDecision({failure:opts.failure,retry:attempt});
     if (!decision.retry) return false;
     const payload = {type:'llm_retry',retryId:crypto.randomUUID(),retry:attempt+1,maxRetries:decision.mode === 'always' ? null : decision.maxRetries,mode:decision.mode,delayMs:decision.delayMs,provider:decision.provider,failure:{code:opts.failure.code,message:opts.failure.message,...(opts.failure.status ? {status:opts.failure.status} : {})},until:Date.now()+decision.delayMs};
     await ctx.fns.procs.db.run({sql:'UPDATE agents SET llm_retry_attempt = ?, llm_retry_pending = ?::jsonb WHERE id = ?',params:[attempt+1,JSON.stringify(payload),opts.agentId]});
     await ctx.fns.session.appendEvent({id:opts.agentId,event:payload});
     return true;
    }});
    return scheduled === true;
}
