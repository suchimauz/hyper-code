/** Handles the llms usage GET HTTP route — the live subscription quota rings. */
export default async function (ctx: Context, _session: Session | null, _opts: {
    /** Incoming HTTP request. */
    req?: Request;
}) {
    const { entries, gateway } = await ctx.fns.llms.usageData({});
    // A live region rather than a poll: recordUsage runs on every LLM response,
    // so the watchdog interval only repairs a missed signal.
    const gatewayStatus = gateway?.status ?? "unknown";
    const gatewayText = gateway?.reason === "disabled" ? "disabled" : gateway?.reason === "missing-key" ? "configured · key missing" : gatewayStatus;
    // API reachability is not subscription quota: keep it out of the node rings.
    const esc = (text: string) => ctx.fns.procs.ui.escape({ text });
    const gatewayTitle = `Asoft LLM Gate · ${gatewayText}\nRead-only /models check; generation not verified; quota unavailable; cached up to 60 seconds\nProvider oneapi · account default\nAvailable models (${gateway?.models?.length ?? 0}):\n${gateway?.models?.join("\n") || "No live catalogue available"}`;
    const gatewayBadge = gateway ? `<div class="flex flex-col items-center pt-1"><a href="/llms" data-gateway="oneapi" data-status="${gatewayStatus}" class="flex items-center justify-center rounded-md px-0.5 py-1 hover:bg-base-300" title="${esc(gatewayTitle)}" aria-label="${esc(gatewayTitle)}"><span class="relative flex size-7 shrink-0 items-center justify-center text-faint"><svg viewBox="0 0 28 28" class="absolute size-7" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" stroke-width="2" opacity="0.18"></circle></svg><i class="ph ph-plugs-connected text-sm" aria-hidden="true"></i><span class="absolute bottom-0 right-0 size-1.5 rounded-full ${gatewayStatus === "available" ? "bg-success" : gatewayStatus === "unavailable" ? "bg-error" : "bg-base-300"}" aria-hidden="true"></span></span></a></div>` : "";
    const html = ctx.fns.ui.live({
        id: "llm-usage",
        url: "/llms/usage",
        topic: "llm-usage",
        every: 60,
        attrs: 'class="block"',
        html: ctx.fns.ui.usageDial({ entries }) + gatewayBadge,
    });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
