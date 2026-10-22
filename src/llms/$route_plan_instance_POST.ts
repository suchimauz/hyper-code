/**
 * Saves the coding-plan egress instance choice
 *
 * Store which SSH instance carries Z.ai or MiniMax coding-plan traffic. "local" (or empty) keeps calls on this machine; any other value must name a trusted SSH instance, otherwise the form is rejected unchanged. The response re-renders the same picker fragment with the saved selection.
 * @param opts.req Incoming HTTP request carrying the form fields provider and instance.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming HTTP request carrying the form fields provider and instance. */
    req: Request;
}): Promise<Response> {
    const form = await opts.req.formData();
    const provider = String(form.get("provider") ?? "");
    if (provider !== "zai-coding" && provider !== "minimax-coding") throw new Error("Unknown coding plan provider");
    const key = provider === "zai-coding" ? "zaiCodingInstance" : "minimaxCodingInstance";
    const requested = String(form.get("instance") ?? "").trim();
    const instances = (await ctx.fns.sshInstance.list({})).filter((i: any) => i.pinnedHostKey).map((i: any) => String(i.name));
    const value = !requested || requested === "local" ? "" : instances.includes(requested) ? requested : null;
    if (value === null) throw new Error("Unknown or untrusted SSH instance");
    await ctx.fns.settings.set({ module: "llm", scopeType: "global", key, value });
    const html = ctx.fns.llms.planInstanceSettings({ provider, instance: value || null, instances });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
