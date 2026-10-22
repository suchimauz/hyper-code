// First half of deletion: confirmation only. Destructive work lives in
// confirmRemoveAccount so an accidental trash click can never remove a token.
/** Renders confirmation for removing one subscription account. */
/**
 * Confirm deletion of a named, managed or SSH-registry subscription credential.
 *
 * When agents still select the credential, they are listed and the person may
 * archive them as part of the removal instead of switching their models first.
 *
 * @param opts.provider Runtime credential provider.
 * @param opts.account Credential slot, or ssh.<instance>.<account> for a registry account.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Runtime provider. */ provider: "anthropic-oauth" | "xai" | "claude-code" | "codex" | "kimi-coding";
    /** Credential slot, or ssh.<instance>.<account> for a registry account. */ account: string;
}): Promise<string> {
    const esc = (v: any) => ctx.fns.procs.ui.escape({ text: String(v ?? "") });
    const ssh = /^ssh\.([^.]+)\.([^.]+)$/.exec(opts.account);
    const users = await ctx.fns.llm.accountUsers({ provider: opts.provider, account: opts.account });
    const detail = ssh
        ? `This removes the Hyper account entry on <code class="font-mono">${esc(ssh[1])}</code>. The credential itself stays on that host.`
        : `This deletes its encrypted managed token or isolated CLI credential directory.`;
    const usedBy = users.length
        ? `<p class="text-xs leading-5 text-subtle">Used by ${users.length} agent${users.length === 1 ? "" : "s"}: ${users.map((u) => `<code class="font-mono">${esc(u.title || u.id)}</code>`).join(", ")}. They will be archived; running or queued work must be stopped first.</p>`
        : "";
    const label = users.length ? `Archive ${users.length} agent${users.length === 1 ? "" : "s"} and remove` : "Remove account";
    const confirm = ctx.fns.llms.popupButton({ action: "confirm-remove-account", label, tone: "danger", class: "w-full" });
    return ctx.fns.ui.popupContent({
        title: "Remove account?",
        kind: "danger",
        html: `<div class="space-y-3"><p class="text-sm">Remove <code class="font-mono">${esc(opts.provider)}/${esc(opts.account)}</code>?</p><p class="text-xs leading-5 text-subtle">${detail}</p>${usedBy}<form hx-popup="llms.confirmRemoveAccount" hx-popup-params="${esc(JSON.stringify({ ...opts, archiveUsers: users.length > 0 }))}">${confirm}</form></div>`,
    });
}
