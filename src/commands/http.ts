/**
 * Expose chat command discovery and authenticated structured dispatch
 *
 * GET lists the command catalog and CSRF token. POST accepts a command and request key, verifies human HTTP authorization, and delegates atomic dispatch.
 * @param opts.req Authenticated HTTP request.
 * @param opts.agentId Session required for POST dispatch.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Authenticated HTTP request. */
        req: Request;
        /** Session required for POST dispatch. */
        agentId?: string;
    },
): Promise<Response> {
    try {
    await ctx.fns.projects.principal({});
    if(opts.req.method==='GET') return Response.json({version:1,commands:await ctx.fns.commands.list({}),csrfToken:await ctx.fns.auth.csrfToken({req:opts.req})},{headers:{'cache-control':'no-store'}});
    if(!await ctx.fns.auth.verifyCsrf({req:opts.req,token:opts.req.headers.get('x-csrf-token')??''})) return Response.json({error:'invalid_csrf'},{status:403});
    const body=await opts.req.json() as {text?:string;requestId?:string};
    if(!opts.agentId||typeof body.text!=='string') return Response.json({error:'invalid_command'},{status:400});
    const accepted=await ctx.fns.commands.dispatch({agentId:opts.agentId,text:body.text,requestId:body.requestId||opts.req.headers.get('idempotency-key')||Bun.randomUUIDv7()});
    return Response.json(accepted,{status:accepted.status==='running'?202:200});
    } catch(error) {const e=error as Error & {status?:number;code?:string};return Response.json({error:e.code??'invalid_command',message:e.message},{status:e.status??400});}
}
