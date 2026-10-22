// Which live conversations still select a credential. Shared by the remove
// confirmation (to show the blocker) and the deletion itself (to enforce it),
// so both always count users the same way.
/** Lists unarchived or in-flight agents whose selected model uses one account. */
/**
 * Find agents that still use one credential account.
 *
 * Counts persisted unarchived selections and any in-flight live state, because
 * the database archive flag alone cannot prove a cached agent is quiescent.
 * SSH routes (ssh/<instance>:<provider>/<account>:) map to the provider's
 * ssh.<instance>.<account> quota identity, matching listAccounts.
 *
 * @param opts.provider Runtime credential provider.
 * @param opts.account Credential slot, or ssh.<instance>.<account> for a registry account.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Runtime credential provider. */ provider: string;
    /** Credential slot, or ssh.<instance>.<account> for a registry account. */ account: string;
}): Promise<Array<{ id: string; title: string | null; model: string | null }>> {
    const provider = String(opts.provider);
    const account = String(opts.account ?? "").trim() || "default";
    const agents = (await ctx.fns.procs.db.select({
        sql: "SELECT id, title, model, archived_at, run_state FROM agents",
        params: [],
    })) as Array<{ id: string; title: string | null; model: string | null; archived_at: number | null; run_state: string }>;
    const rowsById = new Map(agents.map((row) => [String(row.id), row]));
    const users: Array<{ id: string; title: string | null; model: string | null }> = agents.filter((row) => {
        const parsed = splitModel(String(row.model ?? ""));
        return (row.archived_at == null || row.run_state === "running")
            && parsed.provider === provider && parsed.account === account;
    });
    // Archive only updates the database; cached Agent objects have no archive
    // flag. Ignore a known archived row only when memory is also quiescent.
    // Stale/missing rows must not hide an in-flight credential user. Older
    // direct runs left abortController behind after returning, so its presence
    // alone is not proof of activity; activeRunCount tracks unsettled runs.
    for (const [id, live] of Object.entries((ctx.state.agent ?? {}) as Record<string, types.agent.Agent>)) {
        const row = rowsById.get(id);
        const inFlight = live.isStreaming || (live.activeRunCount ?? 0) > 0
            || live.samplingAbortController != null || live.currentJobId != null
            || live.drainPromise != null;
        if (row?.archived_at != null && row.run_state !== "running" && !inFlight) continue;
        const parsed = splitModel(String(live.model ?? ""));
        if (parsed.provider === provider && parsed.account === account && !users.some((u) => String(u.id) === id)) users.push({ id, title: live.title ?? row?.title ?? null, model: live.model });
    }
    return users;
}

function splitModel(model: string): { provider: string; account: string } {
    // ssh/<instance>:<provider>/<account>: routes belong to the provider's
    // ssh.<instance>.<account> quota identity, the same slot the registry lists.
    const remote = /^ssh\/([^:]+):([a-z][\w-]*)\/([^:]+):/.exec(model);
    if (remote) return { provider: remote[2]!, account: `ssh.${remote[1]}.${remote[3]}` };
    const m = /^([a-z][\w-]*)(?:\/([\w.-]+))?:/.exec(model);
    return { provider: m?.[1] ?? "lmstudio", account: m?.[2] ?? "default" };
}
