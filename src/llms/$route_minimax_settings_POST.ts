/**
 * Saves the MiniMax request settings
 *
 * Store the admission tier for MiniMax requests. Invalid tiers and obsolete output-budget fields are ignored, not stored.
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
    const serviceTier = (await ctx.fns.settings.getString({ module: "llm", scopeType: "global", key: "minimaxCodingServiceTier" })) ?? "standard";
    const html = ctx.fns.llms.minimaxSettings({ serviceTier });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
