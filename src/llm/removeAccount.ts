import { rmSync } from "node:fs";

// Removing an account means removing its credential at the place that owns it,
// then deleting only secret-free Hyper metadata. Default CLI accounts belong to
// the user's normal CLI installation and are intentionally not removable here.
/** Removes one isolated subscription account and its secret-free metadata. */
/**
 * Delete a named managed, CLI or SSH-registry subscription account.
 *
 * Refuses while an unarchived or in-flight agent selects the credential, unless
 * opts.archiveUsers archives those agents first; agents with work still in
 * flight or queued always block. Managed Anthropic OAuth is deleted from
 * encrypted Postgres storage; named Codex credentials are removed with their
 * isolated CODEX_HOME; named Claude Code credentials are removed from the
 * account-specific macOS Keychain service and config directory; SSH accounts
 * drop only their secret-free registry row. Default external CLI accounts must
 * be removed by their owning CLI.
 *
 * @param opts.provider Runtime credential provider.
 * @param opts.account Credential slot to remove, or ssh.<instance>.<account> for a registry account.
 * @param opts.archiveUsers Archive agents that still select the credential instead of refusing. @default false
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Runtime provider: anthropic-oauth, xai, claude-code, codex, or kimi-coding. */
    provider: "anthropic-oauth" | "xai" | "claude-code" | "codex" | "kimi-coding";
    /** Credential slot, or ssh.<instance>.<account> for a registry account. */
    account: string;
    /** Archive agents that still select the credential instead of refusing. @default false */
    archiveUsers?: boolean;
}): Promise<{ removed: true; provider: string; account: string; archived: string[] }> {
    const provider = opts.provider;
    const account = String(opts.account ?? "").trim() || "default";
    const users = await ctx.fns.llm.accountUsers({ provider, account });
    const archived: string[] = [];
    if (users.length && !opts.archiveUsers) throw new Error(`account is used by agent(s): ${users.map((x) => x.id).join(", ")} — switch their model first`);
    if (users.length) {
        // Archival is conditional on a quiescent row, so an agent that starts
        // running between the check and the update aborts the whole removal.
        const failed: Array<{ id: string; error: string }> = [];
        for (const user of users) {
            try { await ctx.fns.session.archive({ id: user.id }); archived.push(user.id); }
            catch (error: any) { failed.push({ id: user.id, error: String(error?.message ?? error) }); }
        }
        if (failed.length) throw new Error(`cannot archive agent(s): ${failed.map((f) => `${f.id} (${f.error})`).join(", ")} — stop their work first`);
    }

    // An ssh.<instance>.<account> slot owns only secret-free registry metadata;
    // the credential itself remains on the host.
    const ssh = /^ssh\.([^.]+)\.([^.]+)$/.exec(account);
    if (ssh) {
        const kind = provider as "codex" | "claude-code" | "kimi-coding";
        if (!["codex", "claude-code", "kimi-coding"].includes(provider)) throw new Error(`SSH accounts are unsupported for ${provider}`);
        await ctx.fns.sshAccount.registry({ action: "remove", instance: ssh[1], provider: kind, account: ssh[2] });
    } else if (provider === "anthropic-oauth") {
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
    return { removed: true, provider, account, archived };
}
