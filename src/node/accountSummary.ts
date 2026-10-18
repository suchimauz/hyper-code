/**
 * Count distinct accounts in a Hyper node visible catalogue without inferring quota readiness
 *
 * Use for connection-card account counts. Intersect optional visible model IDs with the shared catalogue and deduplicate provider/account pairs. Disabled, denied or never-fetched catalogues return zero. A transient error retains the visible cached account count, explicitly marked cached. Quota snapshots do not affect catalogue counts and missing usage never means exhaustion.
 * @param opts.node Configured node with its permission-filtered cached catalogue and connection state.
 * @param opts.visibleModelIds Restrict to these catalogue IDs or fully qualified hyper/node model IDs. Omit to use the complete shared catalogue.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Configured node with its permission-filtered cached catalogue and connection state. */
        node: types.node.NodeEntry;
        /** Restrict to these catalogue IDs or fully qualified hyper/node model IDs. Omit to use the complete shared catalogue. */
        visibleModelIds?: string[];
    },
): Promise<{ count: number; total: number; status: "catalog" | "cached" | "disabled" | "error" | "empty"; accounts: Array<{ provider: string; account: string }> }> {
    const node = opts.node;
    const visible = opts.visibleModelIds ? new Set(opts.visibleModelIds) : null;
    const pairs = new Map<string, { provider: string; account: string }>();
    for (const model of node.catalog ?? []) {
        if (!model.id || !model.provider || !model.account) continue;
        if (visible && !visible.has(model.id) && !visible.has("hyper/" + node.name + ":" + model.id)) continue;
        pairs.set(JSON.stringify([model.provider, model.account]), { provider: model.provider, account: model.account });
    }
    const total = pairs.size;
    const denied = /^models 4(?!08:|29:)\d\d:/.test(node.lastError ?? "");
    const status = !node.enabled ? "disabled" : denied ? "error" : !node.catalogAt || !total ? "empty" : node.lastError ? "cached" : "catalog";
    const usable = status === "catalog" || status === "cached";
    return { count: usable ? total : 0, total, status, accounts: usable ? [...pairs.values()] : [] };
}
