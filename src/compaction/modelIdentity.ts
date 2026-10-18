/**
 * Resolve a compaction model to its cached upstream identity
 *
 * Use for context limits and native compactor selection. Hyper routes require one enabled cached catalogue entry with consistent provider/account identity and API. Never fetch credentials or infer an unknown node from its model spelling.
 * @param opts.model Direct provider/account:model or Hyper node model route.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Direct provider/account:model or Hyper node model route. */
        model: string;
    },
): Promise<{ provider: string; account: string; modelId: string; api?: string; relay: boolean } | null> {
    const m = /^([a-z][\w-]*)(?:\/([\w.-]+))?:(.+)$/.exec(opts.model);
    if (!m) return { provider: "", account: "default", modelId: opts.model, relay: false };
    if (m[1] !== "hyper") return { provider: m[1]!, account: m[2] ?? "default", modelId: m[3]!, relay: false };
    const node = await ctx.fns.node.get({ name: m[2] ?? "default" });
    if (!node?.enabled || !node.catalog) return null;
    let matches = node.catalog.filter(e => e.id === m[3]);
    if (!matches.length && !m[3]!.includes(":")) matches = node.catalog.filter(e => e.id.slice(e.id.indexOf(":") + 1) === m[3]);
    if (matches.length !== 1) return null;
    const entry = matches[0]!;
    const identity = /^([a-z][\w-]*)\/([\w.-]+):(.+)$/.exec(entry.id);
    if (entry.id.includes(":") && (!identity || identity[1] !== entry.provider || identity[2] !== entry.account)) return null;
    if (entry.provider === "hyper") return null;
    if (entry.provider === "codex" && entry.api !== "responses") return null;
    return { provider: entry.provider, account: entry.account, modelId: identity?.[3] ?? entry.id, api: entry.api, relay: true };
}
