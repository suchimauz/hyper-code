/**
 * Resume a durable model retry wait and mark its next request.
 *
 * Use before model requests to honor a persisted retry deadline after recovery. Serializes markers with Stop using the agent row lock and fences revoked run tokens.
 * @param opts.agentId Agent owning the retry.
 * @param opts.runToken Current worker lease, or null for a direct run.
 * @param opts.signal Run cancellation signal.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent owning the retry. */
        agentId: string;
        /** Current worker lease, or null for a direct run. */
        runToken: string | null;
        /** Run cancellation signal. */
        signal: AbortSignal;
    },
): Promise<void> {
    const rows = await ctx.fns.procs.db.select({sql:'SELECT llm_retry_pending FROM agents WHERE id = ?',params:[opts.agentId]});
    const pending = rows[0]?.llm_retry_pending;
    if (!pending) return;
    const timers = await import('node:timers/promises');
    while (Date.now() < Number(pending.until)) {
     opts.signal.throwIfAborted();
     await timers.setTimeout(Math.min(30000, Math.max(1, Number(pending.until)-Date.now())), undefined, {signal:opts.signal});
     const current = (await ctx.fns.procs.db.select({sql:'SELECT stopped_at,run_token FROM agents WHERE id = ?',params:[opts.agentId]}))[0];
     if (!current || current.stopped_at != null || (opts.runToken && current.run_token !== opts.runToken)) throw new DOMException('Retry ownership lost','AbortError');
    }
    await ctx.fns.procs.db.transaction({fn:async()=>{
     const row = (await ctx.fns.procs.db.select({sql:'SELECT llm_retry_pending,stopped_at,run_token FROM agents WHERE id = ? FOR UPDATE',params:[opts.agentId]}))[0];
     opts.signal.throwIfAborted();
     if (!row || row.stopped_at != null || (opts.runToken && row.run_token !== opts.runToken)) throw new DOMException('Retry ownership lost','AbortError');
     if (row.llm_retry_pending?.retryId !== pending.retryId) return;
     await ctx.fns.session.appendEvent({id:opts.agentId,event:{type:'llm_retry_started',retryId:pending.retryId,retry:pending.retry}});
     await ctx.fns.procs.db.run({sql:'UPDATE agents SET llm_retry_pending = NULL WHERE id = ?',params:[opts.agentId]});
    }});
}
