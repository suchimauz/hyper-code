/**
 * Route existing compact buttons through the shared command lifecycle
 *
 * Adapt legacy JSON or form compact requests to the same canonical /compact dispatch. Preserves result status and popup response headers without duplicating the compaction engine.
 * @param opts.req Authenticated JSON or form POST request.
 * @param opts.agentId Session selected by the compact button.
 * @param opts.popup Return the native popup close header on successful completion.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Authenticated JSON or form POST request. */
        req: Request;
        /** Session selected by the compact button. */
        agentId: string;
        /** Return the native popup close header on successful completion. */
        popup?: boolean;
    },
): Promise<Response> {
    try {
    await ctx.fns.projects.principal({});
    let instructions='',requestId=opts.req.headers.get('idempotency-key')??'';
    if((opts.req.headers.get('content-type')??'').includes('json')) {
    const body=await opts.req.json() as {instructions?:string;requestId?:string};
    instructions=typeof body.instructions==='string'?body.instructions.trim():'';requestId ||= typeof body.requestId==='string'?body.requestId:'';
    } else {const form=await opts.req.formData();instructions=String(form.get('instructions')??'').trim();requestId ||= String(form.get('requestId')??'');}
    const accepted=await ctx.fns.commands.dispatch({agentId:opts.agentId,text:'/compact'+(instructions?' '+instructions:''),requestId:requestId||Bun.randomUUIDv7()});
    const result=accepted.result as Record<string,unknown>|undefined;
    return Response.json({...accepted,version:1,operationStatus:accepted.status,status:result?.status??accepted.status},{status:accepted.status==='running'?202:200,headers:opts.popup&&accepted.ok?{'HX-Trigger':'mauzcode-popup-close'}:{}});
    } catch(error) {const e=error as Error & {status?:number;code?:string};return Response.json({error:e.code??'compact_failed',message:e.message},{status:e.status??400});}
}
