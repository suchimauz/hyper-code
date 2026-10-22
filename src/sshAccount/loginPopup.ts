/**
 * Render the remote account authorization form
 *
 * Choose an installed official CLI and an isolated account slot on a trusted instance.
 * @param opts.instance Configured SSH instance name.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Configured SSH instance name. */
        instance: string;
    },
): Promise<string> {
    await ctx.fns.sshAccount.requireOwner({});return ctx.fns.ui.popupContent({title:'Authorize remote account',kind:'ssh-account-login',html:'<form hx-popup="sshAccount.startFromPopup" hx-popup-params="'+Bun.escapeHTML(JSON.stringify(opts))+'"><label>Provider<select name="provider"><option value="codex">Codex</option><option value="claude-code">Claude Code</option><option value="kimi-coding">Kimi Coding</option></select></label><label>Account<input required name="account" pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,39}" maxlength="40"></label><p>Credentials stay on the trusted SSH host. No existing CLI login required.</p><p>Codex and Claude Code run their own CLI on the host. Kimi Coding only authorizes the account — nothing is executed there.</p><button type="submit">Start authorization</button></form>'});
}
