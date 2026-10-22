/** Start a manual compaction of an idle agent's effective model context and close the popup immediately. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming HTTP request containing optional focus instructions. */ req: Request;
    /** Route parameters containing the root agent id. */ params: Record<string, string>;
}) {
    const id = opts.params.id!;
    const agent = (ctx.state as any).agent?.[id] ?? await ctx.fns.session.load({ id });
    if (!agent) return new Response("not found", { status: 404 });
    let instructions: string | undefined;
    try {
        const form = await opts.req.formData();
        instructions = String(form.get("instructions") ?? "") || undefined;
    } catch { instructions = undefined; }
    // Compaction runs an LLM summarization — seconds to minutes. The response
    // must not hold the compact modal open for that long: start the work in the
    // background and dismiss the popup at once. Progress and the finished ring
    // arrive through the live agent events the chat already subscribes to.
    void Promise.resolve(ctx.fns.agent.compactContext({ agent, instructions }))
        .then(async (result: any) => {
            if (result?.status === "not_needed") {
                await ctx.fns.ui.notify({ message: "Context already compact: there is not enough removable history yet.", level: "info" }).catch(() => undefined);
            }
        })
        .catch(async (error: any) => {
            const message = String(error?.message ?? error);
            (ctx.fns.procs.log as any).error?.({ event: "compact.failed", msg: message });
            await ctx.fns.ui.notify({ message: `Compaction failed: ${message}`, level: "error" }).catch(() => undefined);
        });
    return new Response(null, { status: 200, headers: { "HX-Trigger": "hyper-popup-close" } });
}
