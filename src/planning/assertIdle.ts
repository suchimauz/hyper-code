/**
 * Lock an existing session and reject planning transitions during an active run
 *
 * Call inside the transition transaction before changing mode or resolving a proposal. Worker row locking serializes the decision. A durable input wait may retain queued messages, but running or claimed work always prevents transitions.
 * @param opts.agentId Session whose row is locked.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Session whose row is locked. */
        agentId: string;
    },
): Promise<void> {
    const row=(await ctx.fns.procs.db.select({sql:'SELECT id,run_state,archived_at,next_run_at FROM agents WHERE id=? FOR UPDATE',params:[opts.agentId]}))[0];
    if(!row) throw Object.assign(new Error('Agent not found'),{status:404,code:'not_found'});
    if(row.archived_at!=null) throw Object.assign(new Error('Restore this archived chat first'),{status:409,code:'archived'});
    const live=ctx.state.agent?.[opts.agentId];
    const queuedWithoutWait=row.next_run_at!=null && !await ctx.fns.input.isWaiting({agentId:opts.agentId});
    if(queuedWithoutWait||row.run_state==='running'||row.run_state==='claimed'||(live?.activeRunCount ?? 0)>0||live?.isStreaming) throw Object.assign(new Error('Stop the current or queued run before changing planning mode or reviewing a plan'),{status:409,code:'agent_running'});
}
