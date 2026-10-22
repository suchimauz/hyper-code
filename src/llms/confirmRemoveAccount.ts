/** Performs a confirmed subscription-account deletion. */
/**
 * Remove one account after the user confirmed the destructive action.
 * @param opts.provider Runtime credential provider.
 * @param opts.account Credential slot, or ssh.<instance>.<account> for a registry account.
 * @param opts.archiveUsers Archive agents that still select the credential. @default false
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Runtime provider. */ provider: "anthropic-oauth" | "xai" | "claude-code" | "codex" | "kimi-coding";
    /** Credential slot, or ssh.<instance>.<account> for a registry account. */ account: string;
    /** Archive agents that still select the credential. @default false */ archiveUsers?: boolean;
}): Promise<string> {
    const result = await ctx.fns.llm.removeAccount({ provider: opts.provider, account: opts.account, archiveUsers: opts.archiveUsers });
    const esc = (v: any) => ctx.fns.procs.ui.escape({ text: String(v ?? "") });
    const archivedNote = result.archived.length ? ` ${result.archived.length} agent${result.archived.length === 1 ? "" : "s"} archived.` : "";
    return ctx.fns.ui.popupContent({ title: "Account removed", kind: "success", html: `<div class="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success"><i class="ph ph-check-circle mr-1"></i>${esc(opts.provider)}/${esc(opts.account)} removed.${esc(archivedNote)}</div>` });
}
