/** Handles the llms usage GET HTTP route — the live subscription quota rings. */
export default async function (ctx: Context, _session: Session | null, _opts: {
    /** Incoming HTTP request. */
    req?: Request;
}) {
    // Never hold page rendering on provider I/O. One background refresh is
    // shared per process; every request immediately renders the latest durable
    // snapshots from the tiny kv set.
    const state = ((ctx.state as any).llmUsageRefresh ??= { promise: null, startedAt: 0 });
    if (!state.promise && Date.now() - Number(state.startedAt || 0) >= 60_000) {
        state.startedAt = Date.now();
        state.promise = ctx.fns.llm.refreshUsage({ maxAgeMs: 60_000 })
            .catch(() => undefined)
            .finally(() => { state.promise = null; });
    }

    const local = await ctx.fns.llm.usageOverview({ connectedOnly: true });
    const entries: Array<(typeof local)[number] & { node?: string; models?: string[]; quotaStatus?: "stale" | "unavailable" }> = local.filter(entry => entry.provider !== "hyper");
    // Use the shared catalogue cache: it refreshes nodes with a five-minute TTL,
    // retains transient failures, and omits denied/disabled/empty catalogues.
    const models = await ctx.fns.llm.listModels({});
    for (const entry of entries) {
        const prefix = `${entry.provider}${entry.account === "default" ? "" : `/${entry.account}`}:`;
        entry.models = Object.values(models).flat().filter(model => model.startsWith(prefix));
    }
    const nodes = await ctx.fns.node.list({}).catch(() => []);
    for (const node of nodes) {
        const visible = new Set(models[`hyper/${node.name}`] ?? []);
        if (!node.enabled || !node.catalogAt || /^models 4(?!08:|29:)\d\d:/.test(node.lastError ?? "")) continue;
        const seen = new Set<string>();
        for (const item of node.catalog ?? []) {
            if (!visible.has(`hyper/${node.name}:${item.id}`)) continue;
            const key = JSON.stringify([item.provider, item.account]);
            if (seen.has(key)) continue;
            seen.add(key);
            const usage = node.usage?.find(row => row.provider === item.provider && row.account === item.account);
            const value = usage?.usedPercent;
            const usedPercent = typeof value === "number" && Number.isFinite(value) ? value : null;
            const stale = Boolean(node.lastError) || !node.usageAt || Date.now() - node.usageAt > 5 * 60_000 || Boolean(usage?.resetsAt && usage.resetsAt <= Date.now());
            entries.push({
                provider: item.provider, account: item.account, node: node.name,
                models: (node.catalog ?? []).filter(m => m.provider === item.provider && m.account === item.account && visible.has(`hyper/${node.name}:${m.id}`)).map(m => `hyper/${node.name}:${m.id}`),
                label: `${node.name} · ${item.account} · ${item.provider}`,
                model: `${item.provider}:`, usedPercent,
                resetsAt: usage?.resetsAt ?? null, planType: usage?.planType ?? null,
                parkedAgents: usage?.parkedAgents ?? 0,
                resetCredits: null, updatedAt: node.usageAt ?? 0,
                tone: usedPercent != null && usedPercent >= 85 ? "error" : usedPercent != null && usedPercent >= 60 ? "warning" : "neutral",
                quotaStatus: usedPercent == null ? "unavailable" : stale ? "stale" : undefined,
            });
        }
    }
    // A live region rather than a poll: recordUsage runs on every LLM response,
    // so the watchdog interval only repairs a missed signal.
    const gateway = ctx.fns.llm.gatewayHealth ? await ctx.fns.llm.gatewayHealth({}) : null;
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
