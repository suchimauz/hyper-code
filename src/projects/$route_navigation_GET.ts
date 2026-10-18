/** Return authorized project navigation fragments without reading transcripts or changing tab state. */
export default async function(ctx: Context, session: Session | null, opts: {
    /** Incoming navigation refresh request. */ req: Request;
}): Promise<Response> {
    try {
        const url = new URL(opts.req.url);
        const agentId = url.searchParams.get('agentId') || undefined;
        const chrome = await ctx.fns.projects.navigation({agentId,projectId:url.searchParams.get('projectId') || undefined});
        return Response.json(chrome);
    } catch (error) {
        return Response.json({ok:false,error:error instanceof Error ? error.message : String(error)}, {status:400});
    }
}
