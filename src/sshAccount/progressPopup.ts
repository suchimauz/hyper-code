/**
 * Render remote CLI authorization progress using shared application form controls.
 *
 * Shows the selected server, allowlisted authorization link and public device code.
 * One-time codes are sent directly to the pending CLI; raw provider logs are never rendered.
 * @param opts.id Opaque login flow identifier returned by remote account authorization.
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Opaque login flow identifier returned by remote account authorization. */
    id: string;
}): Promise<string> {
    const flow = await ctx.fns.sshAccount.status(opts);
    const ui = ctx.fns.procs.ui;
    const esc = Bun.escapeHTML;
    const params = esc(JSON.stringify(opts));
    const tone = flow.status === 'failed' ? 'border-error/30 bg-error/10 text-error' : flow.status === 'connected' ? 'border-success/30 bg-success/10 text-success' : 'border-base-300 bg-base-100 text-base-content';
    let html = `<div class="space-y-4" data-refresh-topic="ssh-accounts"><div class="rounded-lg border ${tone} p-4 space-y-1"><p class="text-sm font-semibold">${esc(flow.account)} · ${esc(flow.status)}</p><p class="text-xs">${flow.provider === 'codex' ? 'Codex' : 'Claude Code'} · SSH ${esc(flow.instance)}</p>${flow.error ? `<p role="alert" class="text-xs leading-relaxed">${esc(flow.error)}</p>` : ''}</div>`;
    if (flow.status === 'pending') {
        html += '<p class="text-xs leading-relaxed text-subtle">Complete the provider sign-in below. Credentials are saved only in this account’s isolated HOME on the remote server.</p>';
        if (flow.verificationUri) html += `<div class="flex justify-center">${ui.button({ action: 'open-remote-authorization', label: 'Open authorization page', href: flow.verificationUri, tone: 'primary', attrs: { target: '_blank', rel: 'noopener noreferrer' } })}</div>`;
        else html += '<p role="status" class="text-xs text-subtle">Waiting for the CLI to provide an authorization link. Refresh status in a moment.</p>';
        if (flow.userCode) html += `<div class="rounded-lg bg-base-200 p-4 text-center"><p class="mb-2 text-2xs text-subtle">Device code</p><code class="select-all font-mono text-lg tracking-widest text-base-content">${esc(flow.userCode)}</code></div>`;
        if (flow.provider === 'claude-code') html += `<form hx-popup="sshAccount.submitFromPopup" hx-popup-params="${params}" class="space-y-3"><label class="block space-y-1.5"><span class="text-xs font-medium text-base-content">One-time browser code</span>${ui.field({ name: 'code', type: 'password', maxlength: 4096, ariaLabel: 'One-time browser code', placeholder: 'Paste the code from the provider', class: 'w-full' })}</label><div class="flex justify-end">${ui.button({ action: 'submit-remote-login-code', label: 'Submit code', type: 'submit', tone: 'primary' })}</div></form>`;
        html += `<div class="flex items-center justify-between gap-3 border-t border-base-300 pt-4"><form hx-popup="sshAccount.cancelFromPopup" hx-popup-params="${params}">${ui.button({ action: 'cancel-remote-login', label: 'Cancel', type: 'submit', tone: 'ghost' })}</form><form hx-popup="sshAccount.progressPopup" hx-popup-params="${params}">${ui.button({ action: 'refresh-remote-login', label: 'Refresh status', type: 'submit' })}</form></div>`;
    } else if (flow.status === 'connected') html += '<p class="text-xs leading-relaxed text-subtle">The remote account is connected. You can now choose its models from the model picker.</p>';
    html += '</div>';
    return ctx.fns.ui.popupContent({ title: 'Remote authorization', kind: 'ssh-account-progress', html });
}
