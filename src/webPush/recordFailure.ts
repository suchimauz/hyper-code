/**
 * Record a terminal owned run after its durable finalization and deliver an error push.
 *
 * Internal worker hook after retry decisions. The timestamp fence rejects a newer run, manual stop or reschedule; only idle unscheduled main agents qualify. Delivery errors are logged without exception content and never change run outcome.
 * @param opts.agentId Finalized main agent identifier.
 * @param opts.runToken Token owned by the run that finalized.
 * @param opts.finalizedAt Exact updated_at written by the owned terminal transition.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Finalized main agent identifier. */
        agentId: string;
        /** Token owned by the run that finalized. */
        runToken: string;
        /** Exact updated_at written by the owned terminal transition. */
        finalizedAt: number;
    },
): Promise<void> {
    try {
     const rows = await ctx.fns.procs.db.select({sql:"INSERT INTO web_push_failures(agent_id,run_token,failed_at) SELECT id,?,? FROM agents WHERE id=? AND updated_at=? AND last_error IS NOT NULL AND last_error<>'' AND last_error NOT LIKE 'stopped by user%' AND run_state='idle' AND run_token IS NULL AND next_run_at IS NULL AND wake_at IS NULL AND parent_id IS NULL AND COALESCE(visibility,'nav')='nav' AND archived_at IS NULL ON CONFLICT DO NOTHING RETURNING agent_id",params:[opts.runToken,opts.finalizedAt,opts.agentId,opts.finalizedAt]});
     if (rows.length) await ctx.fns.webPush.notifyError({agentId:opts.agentId,runToken:opts.runToken});
    } catch { ctx.fns.procs.log.warn({event:'web-push.terminal.failed',msg:'Terminal notification could not be recorded or delivered',agentId:opts.agentId}); }
}
