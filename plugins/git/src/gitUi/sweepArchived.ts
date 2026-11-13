/** Delete comments for archived owners missed by lifecycle cleanup.
 * Candidate discovery is not authoritative: lock each owner and recheck archived state before deleting.
 * Separate transactions avoid holding multiple owner locks and notify only after commit.
 */
export default async function (ctx: Context, _session: Session | null, _opts: {}): Promise<{ deleted: number }> {
    const owners = await ctx.fns.procs.db.select({ sql: 'SELECT id FROM agents WHERE archived_at IS NOT NULL ORDER BY id' });
    let deleted = 0;
    const keys = new Map<string, { host: string; dir: string }>();
    for (const owner of owners) {
        const rows = await ctx.fns.procs.db.transaction({ fn: async () => {
            const locked = await ctx.fns.procs.db.select({ sql: 'SELECT id FROM agents WHERE id = ? AND archived_at IS NOT NULL FOR UPDATE', params: [owner.id] });
            if (!locked.length) return [];
            return await ctx.fns.procs.db.select({ sql: 'DELETE FROM git_review_comments WHERE agent_id = ? RETURNING host, dir', params: [owner.id] });
        } }) as Array<{ host: string; dir: string }>;
        deleted += rows.length;
        for (const row of rows) keys.set(JSON.stringify([row.host, row.dir]), { host: String(row.host), dir: String(row.dir) });
    }
    for (const key of keys.values()) await ctx.fns.gitUi.commentsChanged(key);
    return { deleted };
}
