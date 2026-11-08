/**
 * Authorize a signed-in goal surface owner independently of UI visibility
 *
 * Shared HTTP-only authorization for persistent goal surfaces. Rejects open and legacy sessions, archived targets and noncreator users; optional mutation verification uses a cookie-bound CSRF token. Does not read goal schema.
 * @param opts.req Actual incoming HTTP request.
 * @param opts.agentId Exact selected target identifier.
 * @param opts.csrfToken Submitted token; when present require cookie-bound CSRF verification.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Actual incoming HTTP request. */
        req: Request;
        /** Exact selected target identifier. */
        agentId: string;
        /** Submitted token; when present require cookie-bound CSRF verification. */
        csrfToken?: string;
    },
): Promise<{runToken:string|null;stoppedAt:number|null;runState:string}> {
    const who=await ctx.fns.auth.currentUser({req:opts.req});
    const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
    if(!who.required||who.legacy||!who.user||who.user.disabledAt!==null) fail(401,'Authenticated user session required');
    if(opts.csrfToken!==undefined&&!await ctx.fns.auth.verifyCsrf({req:opts.req,token:opts.csrfToken})) fail(403,'Invalid CSRF token');
    const owner=(await ctx.fns.procs.db.select({sql:'SELECT created_by,run_token,run_state,stopped_at,archived_at FROM agents WHERE id=?',params:[opts.agentId]}))[0];
    if(!owner||owner.archived_at!=null) fail(404,'Agent not found');
    if(owner.created_by!==who.user!.id) fail(403,'Target owner authorization required');
    return {runToken:owner.run_token??null,stoppedAt:owner.stopped_at==null?null:Number(owner.stopped_at),runState:owner.run_state};
}
