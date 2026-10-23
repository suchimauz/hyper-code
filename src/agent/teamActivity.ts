/**
 * Count running descendants for navigation chats and parent status indicators
 *
 * Read durable running descendants, including nested teams, without changing parent run state or loading transcripts. Archived branches and explicitly stopped descendants do not contribute. Use counts for team activity badges, not for execution or Stop controls.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<Record<string, number>> {
    const rows = await ctx.fns.procs.db.select({
     sql: "WITH RECURSIVE activity AS (SELECT id AS worker_id,parent_id,ARRAY[id]::text[] AS path FROM agents WHERE archived_at IS NULL AND stopped_at IS NULL AND run_state='running' UNION ALL SELECT activity.worker_id,a.parent_id,activity.path || a.id FROM activity JOIN agents a ON a.id=activity.parent_id WHERE a.archived_at IS NULL AND NOT a.id=ANY(activity.path)) SELECT parent_id AS id,COUNT(DISTINCT worker_id)::int AS n FROM activity WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM agents WHERE archived_at IS NOT NULL) GROUP BY parent_id",
     params: [],
    });
    return Object.fromEntries(rows.map(row => [String(row.id), Number(row.n)]));
}
