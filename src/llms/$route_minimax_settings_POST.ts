/**
 * Saves the MiniMax request settings
 *
 * Store the admission tier and the output budget for MiniMax requests. The tier decides whether a request is admitted ahead of others; the budget must leave room for the visible answer because thinking tokens count against it. Invalid values are ignored, not stored.
 * @param opts.req Incoming HTTP request carrying the form fields.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming HTTP request carrying the form fields. */
    req: Request;
}): Promise<Response> {
    const form = await opts.req.formData();
    const tier = String(form.get("minimaxCodingServiceTier") ?? "");
    if (tier === "standard" || tier === "priority") {
        await ctx.fns.settings.set({ module: "llm", scopeType: "global", key: "minimaxCodingServiceTier", value: tier });
    }
    const raw = Number(form.get("minimaxCodingMaxTokens"));
    if (Number.isFinite(raw) && raw >= 2048 && raw <= 131072) {
        await ctx.fns.settings.set({ module: "llm", scopeType: "global", key: "minimaxCodingMaxTokens", value: Math.floor(raw) });
    }
    const serviceTier = (await ctx.fns.settings.getString({ module: "llm", scopeType: "global", key: "minimaxCodingServiceTier" })) ?? "standard";
    const maxTokens = await ctx.fns.settings.getNumber({ module: "llm", scopeType: "global", key: "minimaxCodingMaxTokens", fallback: 16384 });
    const html = ctx.fns.llms.minimaxSettings({ serviceTier, maxTokens });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
