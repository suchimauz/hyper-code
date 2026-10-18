import { rmSync } from "node:fs";

// Removing an account means removing its credential at the place that owns it,
// then deleting only secret-free Hyper metadata. Default CLI accounts belong to
// the user's normal CLI installation and are intentionally not removable here.
/** Removes one isolated subscription account and its secret-free metadata. */
/**
 * Delete a named managed or CLI subscription account.
 *
 * Refuses while an unarchived or in-flight agent selects the credential;
 * idle archived sessions remain historical references, not credential users.
 * Managed Anthropic
 * OAuth is deleted from encrypted Postgres storage; named Codex credentials are
 * removed with their isolated CODEX_HOME; named Claude Code credentials are
 * removed from the account-specific macOS Keychain service and config directory.
 * Default external CLI accounts must be removed by their owning CLI.
 *
 * @param opts.provider Runtime credential provider.
 * @param opts.account Credential slot to remove.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Runtime provider: anthropic-oauth, xai, claude-code, codex, or kimi-coding. */
    provider: "anthropic-oauth" | "xai" | "claude-code" | "codex" | "kimi-coding";
    /** Credential slot. */
    account: string;
}): Promise<{ removed: true; provider: string; account: string }> {
    const provider = opts.provider;
    const account = String(opts.account ?? "").trim() || "default";
    const agents = (await ctx.fns.procs.db.select({
        sql: "SELECT id, model, archived_at, run_state FROM agents",
        params: [],
    })) as Array<{ id: string; model: string | null; archived_at: number | null; run_state: string }>;
    const rowsById = new Map(agents.map((row) => [String(row.id), row]));
    const users: Array<{ id: string; model: string | null }> = agents.filter((row) => {
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
        if (parsed.provider === provider && parsed.account === account && !users.some((u) => String(u.id) === id)) users.push({ id, model: live.model });
    }
    if (users.length) throw new Error(`account is used by agent(s): ${users.map((x) => x.id).join(", ")} — switch their model first`);

    if (provider === "anthropic-oauth") {
        await ctx.fns.llm.logoutAnthropicOAuth({ account });
    } else if (provider === "xai") {
        await ctx.fns.llm.logoutXaiOAuth({ account });
        await ctx.fns.llm.accountAuthHealth({ action: "clear", provider, account });
    } else {
        if (account === "default") throw new Error(`the default ${provider} credential belongs to its CLI; use the CLI logout command`);
        const kind = provider as "codex" | "claude-code" | "kimi-coding";
        const location = ctx.fns.llm.accountCredentialPath({ provider: kind, account });
        if (provider === "claude-code" && location.keychainService && process.platform === "darwin") {
            const user = ctx.env.USER ?? process.env.USER ?? "";
            if (user) Bun.spawnSync({ cmd: ["security", "delete-generic-password", "-s", location.keychainService, "-a", user], stdout: "ignore", stderr: "ignore" });
        }
        if (location.dir) rmSync(location.dir, { recursive: true, force: true });
        await ctx.fns.llm.accountRegistry({ action: "remove", provider: kind, account });
    }
    await ctx.fns.procs.db.run({ sql: "DELETE FROM kv WHERE key = ?", params: [`llm:usage:${provider}:${account}`] });
    const flows: Map<string, any> | undefined = (ctx.state as any).llm?.accountLogins;
    const flow = flows?.get(`${provider}:${account}`);
    if (flow?.proc && flow.status === "pending") try { flow.proc.kill(); } catch {}
    flows?.delete(`${provider}:${account}`);
    ctx.fns.procs.events.refresh({ topic: "llm-accounts", reason: "account removed" });
    ctx.fns.procs.events.refresh({ topic: "llm-usage", reason: "account removed" });
    return { removed: true, provider, account };
}

function splitModel(model: string): { provider: string; account: string } {
    const m = /^([a-z][\w-]*)(?:\/([\w.-]+))?:/.exec(model);
    return { provider: m?.[1] ?? "lmstudio", account: m?.[2] ?? "default" };
}
