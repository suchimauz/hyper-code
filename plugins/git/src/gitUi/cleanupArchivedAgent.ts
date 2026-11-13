/** Delete comments only while their owner is archived, under the same row lock as comment creation.
 * Archive handlers and sweeps start a transaction; restoring handlers reuse the caller's locked transaction.
 * Returns affected repository keys for invalidation after the caller commits.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Owner whose archived state must be rechecked before deleting comments. */
    agentId: string;
    /** Reuse the session.restoring transaction; caller must hold the agent row lock. @default false */
    restoring?: boolean;
}): Promise<Array<{ host: string; dir: string }>> {
    const cleanup = async (): Promise<Array<{ host: string; dir: string }>> => {
        const owners = await ctx.fns.procs.db.select({ sql: 'SELECT id FROM agents WHERE id = ? AND archived_at IS NOT NULL FOR UPDATE', params: [opts.agentId] });
        if (!owners.length) return [];
        return await ctx.fns.procs.db.select({ sql: 'DELETE FROM git_review_comments WHERE agent_id = ? RETURNING host, dir', params: [opts.agentId] });
    };
    const rows = (opts.restoring ? await cleanup() : await ctx.fns.procs.db.transaction({ fn: cleanup })) as Array<{ host: string; dir: string }>;
    const keys = new Map<string, { host: string; dir: string }>();
    for (const row of rows) keys.set(JSON.stringify([row.host, row.dir]), { host: String(row.host), dir: String(row.dir) });
    return [...keys.values()];
}
