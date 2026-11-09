/** Return the exact current full system prompt as owner-authorized read-only JSON for the native reader. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Browser request carrying authentication. */ req: Request;
    /** Exact durable agent coordinates. */ params: { id: string };
}): Promise<Response> {
    return ctx.fns.agent.initialPromptRead({ req: opts.req, agentId: opts.params.id });
}
