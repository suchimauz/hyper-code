/**
 * Serve authenticated planning state and exact review decisions
 *
 * Shared controller for planning GET and review POST. Reads expose CSRF and durable state; review delegates transactional authorization and reports structured errors.
 * @param opts.req Browser request.
 * @param opts.agentId Target session.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Browser request. */
        req: Request;
        /** Target session. */
        agentId: string;
    },
): Promise<Response> {
    try {
    await ctx.fns.projects.principal({});
    const exists=(await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=?',params:[opts.agentId]}))[0]; if(!exists) return Response.json({error:'not_found'},{status:404});
    if(opts.req.method==='GET') return Response.json({...await ctx.fns.planning.read({agentId:opts.agentId}),csrfToken:await ctx.fns.auth.csrfToken({req:opts.req})},{headers:{'cache-control':'no-store'}});
    const body=await opts.req.json() as {proposalId:string;decision:'approve'|'keep';expectedRevision:number};
    return Response.json(await ctx.fns.planning.review({req:opts.req,agentId:opts.agentId,proposalId:body.proposalId,decision:body.decision,expectedRevision:body.expectedRevision}));
    } catch(error) {const e=error as Error & {status?:number;code?:string}; return Response.json({error:e.code??'invalid_request',message:e.message},{status:e.status??400});}
}
