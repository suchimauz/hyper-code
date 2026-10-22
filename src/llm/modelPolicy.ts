/**
 * List, set, or enforce user-disabled exact model routes
 *
 * Persist per-route model opt-outs in kv and reject disabled inference before resolving credentials or transport. Canonicalizes bare local models and explicit provider/default aliases, while preserving named accounts, SSH routes and Hyper node identities.
 * @param opts.action List disabled routes, set one route policy, or reject a disabled route.
 * @param opts.model Exact model route; required for set and assert. Bare model IDs use lmstudio. Named accounts, SSH and node routes remain distinct.
 * @param opts.disabled Whether set disables the route; required and strictly boolean for set.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** List disabled routes, set one route policy, or reject a disabled route. */
        action: "list" | "set" | "assert";
        /** Exact model route; required for set and assert. Bare model IDs use lmstudio. Named accounts, SSH and node routes remain distinct. */
        model?: string;
        /** Whether set disables the route; required and strictly boolean for set. */
        disabled?: boolean;
    },
): Promise<{ disabledModels: string[] }> {
    const prefix = "llm:model-disabled:";
    if (!["list", "set", "assert"].includes(opts.action)) throw new Error("Invalid model policy action");
    let route = "";
    if (opts.action !== "list") {
        if (typeof opts.model !== "string" || !opts.model.trim() || /\s/.test(opts.model)) throw new Error("Invalid model route");
        const model = opts.model;
        if (model.startsWith("ssh/")) {
            if (!/^ssh\/[A-Za-z0-9][A-Za-z0-9_.-]{0,63}:[a-z][\w-]*\/[A-Za-z0-9][A-Za-z0-9_-]{0,39}:[^:\s]+$/.test(model)) throw new Error("Invalid model route");
            route = model;
        } else if (model.includes(":")) {
            const match = /^([a-z][\w-]*)(?:\/([\w.-]+))?:(\S+)$/.exec(model);
            if (!match || (match[2] && [".", ".."].includes(match[2]))) throw new Error("Invalid model route");
            route = match[1] + (match[2] && (match[2] !== "default" || match[1] === "hyper") ? "/" + match[2] : "") + ":" + match[3];
        } else {
            route = "lmstudio:" + model;
        }
    }
    if (opts.action === "set") {
        if (typeof opts.disabled !== "boolean") throw new Error("disabled must be a boolean for set");
        const key = prefix + encodeURIComponent(route);
        if (opts.disabled) await ctx.fns.procs.db.run({sql: "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", params: [key, "true"]});
        else await ctx.fns.procs.db.run({sql: "DELETE FROM kv WHERE key = ?", params: [key]});
        await ctx.fns.procs.events.refresh({topic: "llm-accounts", reason: "model-policy"});
        await ctx.fns.procs.events.refresh({topic: "llm-models", reason: "model-policy"});
    }
    const rows = await ctx.fns.procs.db.select({sql: "SELECT key FROM kv WHERE key LIKE ? AND value = ? ORDER BY key", params: [prefix + "%", "true"]}) as Array<{key: string}>;
    const disabledModels = rows.map(row => decodeURIComponent(row.key.slice(prefix.length))).sort();
    if (opts.action === "assert" && disabledModels.includes(route)) throw Object.assign(new Error("Model is disabled by user: " + route), {code: "MODEL_DISABLED_BY_USER", retryable: false, replaySafe: false});
    return {disabledModels};
}
