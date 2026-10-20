/**
 * Atomically replaces or removes an SSH descriptor and invalidates local account metadata
 *
 * Internal lifecycle helper after owner-confirmed validation. Blocks pending logins, stages a new private identity and socket namespace, then compares the full previous descriptor atomically. Old protected identity directories are retained for already-running processes; no remote files are changed.
 * @param opts.previous Full previously read descriptor used as the compare-and-swap precondition.
 * @param opts.next Replacement descriptor; null removes the descriptor and associated local account metadata.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Full previously read descriptor used as the compare-and-swap precondition. */
        previous: types.sshInstance.Instance;
        /** Replacement descriptor; null removes the descriptor and associated local account metadata. */
        next: types.sshInstance.Instance | null;
    },
): Promise<types.sshInstance.Instance | null> {
    await ctx.fns.sshInstance.authorize({});
    const pending = () => [...(ctx.state.sshAccount?.flows?.values() ?? [])].some(f => f.instance === opts.previous.name && f.status === 'pending');
    if (pending()) throw new Error('Finish or cancel the pending login before changing this instance');
    if (opts.next && opts.next.name !== opts.previous.name) throw new Error('Instance names cannot be changed');
    const fs = await import('node:fs/promises');
    let staged: string | null = null;
    let committed = false;
    try {
        let next = opts.next ? {...opts.next, id: crypto.randomUUID(), updatedAt: Date.now()} : null;
        if (next) {
            const source = await ctx.fns.sshInstance.paths({id:opts.previous.id});
            const target = await ctx.fns.sshInstance.paths({id:next.id});
            staged = target.dir;
            const key = await fs.open(source.key, (await import('node:fs')).constants.O_RDONLY | (await import('node:fs')).constants.O_NOFOLLOW);
            try {
                if (!(await key.stat()).isFile()) throw new Error('Unsafe identity file');
                await fs.writeFile(target.key, await key.readFile(), {mode:0o600, flag:'wx'});
            } finally { await key.close(); }
            if (next.pinnedHostKey) {
                const host = next.port === 22 ? next.host : '[' + next.host + ']:' + next.port;
                await fs.writeFile(target.knownHosts, host + ' ' + next.pinnedHostKey + '\n', {mode:0o600,flag:'wx'});
            }
        }
        if (pending()) throw new Error('Finish or cancel the pending login before changing this instance');
        const descriptorParams = ['sshInstance','instance',opts.previous.name,'descriptor',JSON.stringify(opts.previous)];
        const accountParams = ['sshAccount','global',opts.previous.name];
        const params = next
            ? [JSON.stringify(next),next.updatedAt,...descriptorParams,next.updatedAt,next.updatedAt,...accountParams]
            : [...descriptorParams,...accountParams];
        const change = next
            ? 'UPDATE settings SET value = ?, updated_at = ? WHERE module = ? AND scope_type = ? AND scope_id = ? AND key = ? AND value::jsonb = ?::jsonb RETURNING scope_id'
            : 'DELETE FROM settings WHERE module = ? AND scope_type = ? AND scope_id = ? AND key = ? AND value::jsonb = ?::jsonb RETURNING scope_id';
        const accounts = next
            ? "UPDATE settings SET value = (value::jsonb || jsonb_build_object('status','failed','updatedAt',?::bigint))::text, updated_at = ? WHERE module = ? AND scope_type = ? AND value::jsonb ->> 'instance' = ? AND EXISTS (SELECT 1 FROM changed) RETURNING key"
            : "DELETE FROM settings WHERE module = ? AND scope_type = ? AND value::jsonb ->> 'instance' = ? AND EXISTS (SELECT 1 FROM changed) RETURNING key";
        const changed = await ctx.fns.procs.db.select({sql:'WITH changed AS ('+change+'), accounts AS ('+accounts+') SELECT scope_id FROM changed',params});
        if (!changed.length) throw new Error('Instance changed concurrently; reload and try again');
        committed = true;
        // Drop cached catalogues, including in-flight entries which may reference the old endpoint.
        (ctx.state as typeof ctx.state & {llmModelCatalog?: object}).llmModelCatalog = {};
        return next;
    } catch (error) {
        if (error instanceof Error && /pending login|concurrently/.test(error.message)) throw error;
        throw new Error('Could not update local SSH instance', {cause:error});
    } finally {
        if (staged && !committed) await fs.rm(staged,{recursive:true,force:true});
    }
}
