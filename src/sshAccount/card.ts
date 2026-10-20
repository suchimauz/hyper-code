/**
 * Render isolated remote account controls in SSH Administration
 *
 * Show credential-free registry metadata and an authorization entrypoint for one trusted instance.
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
    await ctx.fns.sshAccount.requireOwner({});const rows=await ctx.fns.sshAccount.registry({action:'list',instance:opts.instance});const e=Bun.escapeHTML;return '<section data-refresh-topic="ssh-accounts"><h3>Remote accounts</h3><p>Install codex or claude on this host; authorize here. Credentials stay remote.</p>'+rows.map(r=>'<div>'+e(r.provider)+' / '+e(r.account)+' — '+e(r.status)+'</div>').join('')+'<form hx-popup="sshAccount.loginPopup" hx-popup-params="'+e(JSON.stringify(opts))+'"><button type="submit">Add remote account</button></form></section>';
}
