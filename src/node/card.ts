// LLM page section for Hyper-to-Hyper sharing (docs/hyper-node.md): the nodes
// this instance relays through (client side) and the clients allowed to relay
// through it (host side). Tokens never appear here — only hints.
/**
 * Render the Hyper nodes section for the LLM connections page
 *
 * Shows configured nodes with distinct catalogue account counts and errors plus an Add/Edit
 * popup, and the clients issued a token with usage counters, Issue and Revoke.
 */
export default async function (ctx: Context, _session: Session | null, _opts: {}): Promise<string> {
    const esc = (x: any) => ctx.fns.procs.ui.escape({ text: String(x ?? "") });
    const now = Date.now();
    const ago = (t: number | null) => t ? `${Math.max(1, Math.round((now - t) / 60000))}m ago` : "never";
    let nodes: types.node.NodeEntry[] = [], clients: Awaited<ReturnType<typeof ctx.fns.node.clients>> = [];
    try { nodes = await ctx.fns.node.list({}); clients = await ctx.fns.node.clients({}); } catch { /* tables absent */ }

    const models = await ctx.fns.llm.listModels({});
    const nodeRows = (await Promise.all(nodes.map(async (n) => {
        const summary = await ctx.fns.node.accountSummary({ node: n, visibleModelIds: models[`hyper/${n.name}`] ?? [] });
        const accountText = summary.status === "disabled" ? "0 accounts · disabled"
            : summary.status === "error" ? `0 accounts · error: ${n.lastError}`
            : `${summary.count} ${summary.count === 1 ? "account" : "accounts"} in ${summary.status === "cached" ? "cached " : ""}catalogue${n.lastError ? ` · ${n.lastError}` : ""}`;
        return ctx.fns.procs.ui.row({ entity: "hyper-node", id: n.name, status: n.lastError ? "error" : summary.count ? "ready" : "neutral", cells: [
            { role: "name", text: `hyper/${n.name}:`, class: "w-40 shrink-0 font-mono text-xs font-medium" },
            { role: "url", text: n.url, title: n.url, class: "min-w-0 flex-1 truncate font-mono text-2xs text-faint" },
            { role: "models", text: `${n.catalog?.length ?? 0} models · ${ago(n.catalogAt)}`, class: "shrink-0 text-2xs text-muted" },
            { role: "accounts", text: accountText, title: "Distinct provider/account pairs in the shared catalogue; not a quota-readiness guarantee.", class: `min-w-0 text-2xs ${n.lastError ? "text-error" : "text-muted"}` },
        ], right: `<span class="flex items-center gap-1">${ctx.fns.ui.popup({ method: "node.refreshFromPopup", params: { name: n.name }, tone: "default", size: "xs", html: `<i class="ph ph-arrow-clockwise" aria-hidden="true"></i><span>Refresh</span>` })}${ctx.fns.ui.popup({ method: "node.editPopup", params: { name: n.name }, tone: "default", size: "xs", html: `<i class="ph ph-gear" aria-hidden="true"></i><span>Edit</span>` })}</span>` });
    }))).join("");
    const clientRows = clients.map((c) => ctx.fns.procs.ui.row({ entity: "hyper-node-client", id: c.id, status: "ready", cells: [
        { role: "name", text: c.name, class: "w-40 shrink-0 font-mono text-xs font-medium" },
        { role: "hint", text: c.tokenHint, class: "shrink-0 font-mono text-2xs text-faint" },
        { role: "providers", text: c.providers.length ? c.providers.join(", ") : "all providers", class: "min-w-0 flex-1 truncate text-2xs text-muted" },
        { role: "requests", text: `${c.requests} req · used ${ago(c.lastUsedAt)}`, class: "shrink-0 text-2xs text-muted" },
    ], right: ctx.fns.ui.popup({ method: "node.revokeFromPopup", params: { id: c.id, name: c.name }, tone: "danger", size: "xs", html: `<i class="ph ph-trash" aria-hidden="true"></i><span>Revoke</span>` }) })).join("");

    const nodesHead = ctx.fns.procs.ui.heading({ title: "Hyper nodes", meta: "Other Hyper instances whose models you use as hyper/<node>:<model>.", actions: ctx.fns.ui.popup({ method: "node.editPopup", params: {}, tone: "default", size: "sm", html: `<i class="ph ph-plus" aria-hidden="true"></i><span>Add node</span>` }) });
    const clientsHead = ctx.fns.procs.ui.heading({ title: "Shared with", meta: "Hyper instances allowed to relay through your providers.", actions: ctx.fns.ui.popup({ method: "node.issuePopup", params: {}, tone: "default", size: "sm", html: `<i class="ph ph-key" aria-hidden="true"></i><span>Issue token</span>` }) });
    const box = (rows: string, empty: string) => `<div class="mt-2 overflow-hidden rounded-xl border border-ui-border bg-base-100">${rows || ctx.fns.procs.ui.empty({ title: empty, text: "" })}</div>`;
    const html = `<div class="space-y-6"><section>${nodesHead}${box(nodeRows, "No nodes")}</section><section>${clientsHead}${box(clientRows, "Nobody yet")}</section></div>`;
    return ctx.fns.ui.live({ id: "hyper-nodes", url: "/node/card", topic: "node-clients", swap: "outerMorph", every: 30, attrs: 'class="block"', html });
}
