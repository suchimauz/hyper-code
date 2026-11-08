/**
 * Read durable advisory planning mode and its latest exact proposal
 *
 * Use on every model request or UI refresh. Absence means execute; task tracking and scratchpad never determine this state.
 * @param opts.agentId Existing session identifier.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Existing session identifier. */
        agentId: string;
    },
): Promise<types.planning.State> {
    const row = (await ctx.fns.procs.db.select({sql:'SELECT mode, revision, proposal FROM agent_planning WHERE agent_id=?',params:[opts.agentId]}))[0];
    return {version:1,agentId:opts.agentId,mode:row?.mode === 'plan' ? 'plan':'execute',revision:Number(row?.revision ?? 0),scope:'session',advisory:true,runningPolicy:'reject',pending:null,proposal:row?.proposal ? (typeof row.proposal==='string'?JSON.parse(row.proposal):row.proposal):null};
}
