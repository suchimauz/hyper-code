/**
 * Release a sealed Stop handoff and apply accounting only after outer commit
 *
 * Internal postcommit hook. Call only after Stop transaction commits. With no result it releases incomplete or failed accounting without advancing local counters. Rollback must never call this with an accounting result.
 * @param opts.preparation Exact handoff returned by runStopPrepare.
 * @param opts.result Accounting checkpoint result from the successfully committed outer transaction only.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact handoff returned by runStopPrepare. */
        preparation: types.goal.StopPreparation;
        /** Accounting checkpoint result from the successfully committed outer transaction only. */
        result?: types.goal.AccountingResult;
    },
): Promise<void> {
    const p=opts.preparation;if(p.kind==='absent')return;
    if(opts.result&&p.kind==='ready'&&!('disabled' in opts.result)){p.state.sequence=p.snapshot.sequence;p.state.revision=opts.result.revision;}
    await ctx.fns.goal.runStopRegistry({action:'remove',agentId:p.state.binding.sourceAgentId,runToken:p.state.binding.runToken,state:p.state});
}
