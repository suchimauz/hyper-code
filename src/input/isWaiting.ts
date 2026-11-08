/**
 * Check durable ordinary-question gates before agent dispatch
 *
 * Returns true while any server-marked input is open or processing. With since, also detects a question created during this run even if already answered, so its tool batch ends without another dispatch. Reads PostgreSQL, not transient agent state.
 * @param opts.agentId Agent whose blocking questions are checked.
 * @param opts.since Run start epoch milliseconds; includes resolved questions created during this run.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent whose blocking questions are checked. */
        agentId: string;
        /** Run start epoch milliseconds; includes resolved questions created during this run. */
        since?: number;
    },
): Promise<boolean> {
    const rows = await ctx.fns.procs.db.select({ sql: `SELECT EXISTS (SELECT 1 FROM inputs WHERE agent_id = ? AND spec->>'_agentWait' = 'true' AND (state IN ('open','processing') OR (?::bigint IS NOT NULL AND created_at >= ?::bigint))) AS waiting`, params: [opts.agentId, opts.since ?? null, opts.since ?? null] });
    return rows[0]?.waiting === true;
}
