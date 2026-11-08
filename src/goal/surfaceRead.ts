/**
 * Read an authorized persistent goal HTTP snapshot
 *
 * Shared desktop and native adapter. Feature-off returns no target data and never accesses goal schema. Enabled reads require signed-in exact creator authorization; observations and legacy goal remain separate.
 * @param opts.req Actual HTTP request for authentication.
 * @param opts.agentId Exact target selected in the route.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Actual HTTP request for authentication. */
        req: Request;
        /** Exact target selected in the route. */
        agentId: string;
    },
): Promise<Response> {
    if(!await ctx.fns.goal.enabled({}))return Response.json({version:1,enabled:false},{headers:{'Cache-Control':'no-store'}});
    try {
    const owner=await ctx.fns.goal.surfaceAuthorize({req:opts.req,agentId:opts.agentId});
    const snapshot=await ctx.fns.goal.read({agentId:opts.agentId});
    if(!snapshot.enabled)return Response.json({version:1,enabled:false},{headers:{'Cache-Control':'no-store'}});
    return Response.json({version:1,enabled:true,agentId:opts.agentId,goal:snapshot.goal,owner,csrfToken:await ctx.fns.auth.csrfToken({req:opts.req})},{headers:{'Cache-Control':'no-store'}});
    } catch(error){const e=error as Error & {status?:number};return Response.json({error:'goal_unavailable',message:e.status?e.message:'Goal snapshot unavailable'},{status:e.status??503,headers:{'Cache-Control':'no-store'}});}
}
