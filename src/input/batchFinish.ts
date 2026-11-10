/**
 * Clear batch drafts and persist one safe terminal receipt inside its caller-owned transaction.
 *
 * Server-side atomic batch collection support; use through the dedicated owner-authorized batch routes.
 * @param opts.id Parent batch identifier.
 * @param opts.state Terminal lifecycle outcome.
 * @param opts.result Safe terminal result with references only.
 * @param opts.history Safe history projection for the parent card.
 * @param opts.error Sanitized error metadata.
 * @param opts.actor Authenticated browser actor or recovery worker.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Parent batch identifier. */
        id: string;
        /** Terminal lifecycle outcome. */
        state: "submitted" | "cancelled" | "expired";
        /** Safe terminal result with references only. */
        result: Record<string, unknown>;
        /** Safe history projection for the parent card. */
        history: Record<string, unknown>;
        /** Sanitized error metadata. */
        error?: Record<string, unknown>;
        /** Authenticated browser actor or recovery worker. */
        actor?: string;
    },
): Promise<Record<string, unknown>> {
    if(!(ctx.state as any).procs?.db?.transactionStorage?.getStore()?.active)throw new Error('Batch completion requires an active transaction');
    const input=await ctx.fns.input.get({id:opts.id});if(!input||input.kind!=='batch')throw new Error('Batch not found');
    if(!['open','processing'].includes(input.state))throw new Error('Batch conflict');
    const authority=(ctx.state as any).input.kinds.batch.completionAuthority;
    await ctx.fns.procs.db.run({sql:'UPDATE input_batch_state SET draft_enc=NULL,revision=revision+1,history=?::jsonb,error=?::jsonb WHERE input_id=?',params:[JSON.stringify(opts.history),JSON.stringify(opts.error??null),opts.id]});
    const out=await ctx.fns.input.complete({id:opts.id,state:opts.state,result:opts.result,summary:String(opts.history.summary??'Batch completed'),actor:opts.actor??'system:batch',authority});
    if(!out.completed)throw new Error('Batch conflict');
    return {completed:true};
}
