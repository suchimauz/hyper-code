/** Persist the outgoing messaging limit switch from one agent's settings panel. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming settings form. */ req: Request;
    /** Target agent path identifier. */ params: Record<string, string>;
}) {
    const form = await opts.req.formData();
    await ctx.fns.agent.setMessageLimits({ id: opts.params.id!, enabled: form.get("enabled") === "1" });
    return new Response(null, { status: 204 });
}
