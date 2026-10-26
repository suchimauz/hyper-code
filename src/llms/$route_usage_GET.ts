/** Handles the llms usage GET HTTP route — the live subscription quota matrix and distinct gateway health. */
export default async function (ctx: Context, _session: Session | null, _opts: {
    /** Incoming HTTP request. */
    req?: Request;
}) {
    const { entries, gateway } = await ctx.fns.llms.usageData({ includeConnected: true });
    const html = ctx.fns.ui.live({
        id: "llm-usage",
        url: "/llms/usage",
        topic: "llm-usage",
        every: 60,
        attrs: 'class="block"',
        html: ctx.fns.ui.usageDial({ entries, gateway }),
    });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
