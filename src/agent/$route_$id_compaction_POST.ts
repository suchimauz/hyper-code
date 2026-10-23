/** Save or reset the agent Inspector's automatic compaction percentage. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming form request. */
    req: Request;
    /** Path parameters including the target agent id. */
    params: Record<string, string>;
}): Promise<Response> {
    return ctx.fns.agent.compactionPost({ req: opts.req, id: opts.params.id! });
}
