/**
 * Copy only advisory planning mode into a newly created fork
 *
 * Use during session fork after child persistence. Never copy proposal IDs, pending reviews, revisions or approval authority. Execute-mode sources require no child row.
 * @param opts.sourceId Parent session identifier.
 * @param opts.targetId New child session identifier.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Parent session identifier. */
        sourceId: string;
        /** New child session identifier. */
        targetId: string;
    },
): Promise<void> {
    const state=await ctx.fns.planning.read({agentId:opts.sourceId});
    if(state.mode==='plan') await ctx.fns.procs.db.run({sql:"INSERT INTO agent_planning(agent_id,mode,revision,proposal,updated_at) VALUES (?,'plan',1,NULL,?) ON CONFLICT(agent_id) DO NOTHING",params:[opts.targetId,Date.now()]});
}
