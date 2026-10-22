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
    // The gateway measures no quota, so its hover card carries only what is
    // actually observable — status, catalogue size and the last check — in the
    // same styled top-layer card the quota rings use. No model list.
    const ruStamp = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const checkedAt = gateway?.checkedAt ? ruStamp.format(new Date(gateway.checkedAt)) : null;
    const modelCount = gateway?.models?.length ?? 0;
    const gateTone = gatewayStatus === "available" ? "text-success" : gatewayStatus === "unavailable" ? "text-error" : "text-faint";
    const gateRows = [
        { tone: gateTone, name: "Gate", text: gatewayText },
        { tone: "text-faint", name: "Models", text: modelCount ? `${modelCount} in catalogue` : "no live catalogue" },
        { tone: "text-faint", name: "Checked", text: checkedAt ?? "not yet" },
    ].map(row => `<span class="quota-tip-row ${row.tone}"><i class="quota-tip-dot" aria-hidden="true"></i><span class="quota-tip-name">${esc(row.name)}</span><span>${esc(row.text)}</span></span>`).join("");
    const gatewayAria = `Asoft LLM Gate · ${gatewayText} · ${modelCount} in catalogue${checkedAt ? ` · checked ${checkedAt}` : ""}`;
    const gatewayTip = `<span class="quota-tip" popover="auto" aria-hidden="true"><span class="quota-tip-head">Asoft LLM Gate</span><span class="quota-tip-sub">OpenAI-compatible gateway · quota not measured</span>${gateRows}</span>`;
    const gatewayBadge = gateway ? `<div class="flex flex-col items-center pt-1"><a href="/llms" data-gateway="oneapi" data-status="${gatewayStatus}" class="quota-ring flex items-center justify-center rounded-md px-0.5 py-1 hover:bg-base-300" aria-label="${esc(gatewayAria)}"><span class="relative flex size-7 shrink-0 items-center justify-center text-faint"><svg viewBox="0 0 28 28" class="absolute size-7" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" stroke-width="2" opacity="0.18"></circle></svg><i class="ph ph-plugs-connected text-sm" aria-hidden="true"></i><span class="absolute bottom-0 right-0 size-1.5 rounded-full ${gatewayStatus === "available" ? "bg-success" : gatewayStatus === "unavailable" ? "bg-error" : "bg-base-300"}" aria-hidden="true"></span></span>${gatewayTip}</a></div>` : "";
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
