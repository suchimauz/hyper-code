/**
 * Persist secret-free remote CLI account connection metadata
 *
 * List isolated remote CLI accounts or transition their durable authorization status. Stores no credentials or provider output; use after remote CLI verification.
 * @param opts.action List accounts, set pending, connected or failed status, or delete a row.
 * @param opts.instance Configured SSH instance name; required for status changes.
 * @param opts.provider Official remote CLI provider; required for status changes.
 * @param opts.account Isolated account slot containing ASCII letters, digits, underscores or hyphens; required for changes.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** List accounts or set pending, connected, or failed status, or delete a row. */
        action: "list" | "begin" | "connect" | "fail" | "remove";
        /** Configured SSH instance name; required for status changes. */
        instance?: string;
        /** Official remote CLI provider; required for status changes. */
        provider?: "codex" | "claude-code" | "kimi-coding";
        /** Isolated account slot containing ASCII letters, digits, underscores or hyphens; required for changes. */
        account?: string;
    },
): Promise<Array<{ instance: string; provider: "codex" | "claude-code" | "kimi-coding"; account: string; status: "pending" | "connected" | "failed"; updatedAt: number }>> {
    await ctx.fns.sshAccount.requireOwner({});
    const valid = (s: string) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(s);
    if (!['list','begin','connect','fail','remove'].includes(opts.action)) throw new Error('Invalid registry action');
    if (opts.instance && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(opts.instance)) throw new Error('Invalid instance name');
    if (opts.action === 'remove') {
     // The row is secret-free metadata, so deleting it never touches a credential.
     // The credential itself lives on the host and is removed separately.
     if (!opts.instance || !opts.account || !valid(opts.account) || !['codex','claude-code','kimi-coding'].includes(opts.provider ?? '')) throw new Error('Invalid remote account');
     await ctx.fns.settings.remove({module:'sshAccount',scopeType:'global',key:[opts.instance,opts.provider,opts.account].join(':')});
     return [];
    }
    if (opts.action !== 'list') {
     if (!opts.instance || !opts.account || !valid(opts.account) || !['codex','claude-code','kimi-coding'].includes(opts.provider ?? '')) throw new Error('Invalid remote account');
     const value = {instance:opts.instance,provider:opts.provider,account:opts.account,status:opts.action === 'begin' ? 'pending' : opts.action === 'connect' ? 'connected' : 'failed',updatedAt:Date.now()};
     await ctx.fns.settings.set({module:'sshAccount',scopeType:'global',key:[opts.instance,opts.provider,opts.account].join(':'),value});
    }
    const rows = await ctx.fns.procs.db.select({sql:"SELECT value FROM settings WHERE module = ? AND scope_type = ?",params:['sshAccount','global']});
    const accounts = rows.map((r: {value: string | object}) => typeof r.value === 'string' ? JSON.parse(r.value) : r.value).filter((r: {instance:string}) => !opts.instance || r.instance === opts.instance);
    for (const row of accounts) if (row.status === 'pending' && row.updatedAt < Date.now()-10000 && ![...(ctx.state.sshAccount?.flows?.values() ?? [])].some(f => f.instance===row.instance && f.provider===row.provider && f.account===row.account && f.status==='pending')) {
        row.status='failed'; row.updatedAt=Date.now();
        await ctx.fns.settings.set({module:'sshAccount',scopeType:'global',key:[row.instance,row.provider,row.account].join(':'),value:row});
    }
    return accounts;
}
