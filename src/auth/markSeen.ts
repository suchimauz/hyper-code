/**
 * Marks a chat read through loaded events, or through its newest event for legacy callers.
 *
 * Writes the per-user row in user_agent_state. Also keeps the legacy shared kv key
 * `seen-at:<agent>` in sync while the instance has at most one user, so the previous code sees the
 * same read state after a rollback. With no identified user (not switched yet) only kv is written.
 * Watermarks never decrease. Bounded receipts clamp to the latest stored event (zero when empty)
 * and leave mentions untouched: their message indices do not provide an event timestamp boundary.
 * Returns the persisted watermark; it may exceed a stale receipt when already read farther.
 * @param opts.agentId Chat (agent) id.
 * @param opts.throughTs Latest loaded event timestamp, inclusive. Omit to read all current events. @minimum 0
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Chat (agent) id. */
        agentId: string;
        /** Latest loaded event timestamp, inclusive; omitted reads all current events. @minimum 0 */
        throughTs?: number;
    },
): Promise<number> {
    if (opts.throughTs !== undefined && (!Number.isFinite(opts.throughTs) || opts.throughTs < 0)) {
        throw new TypeError('throughTs must be a finite non-negative number');
    }
    const db = ctx.fns.procs.db;
    const row = ((await db.select({ sql: "SELECT MAX(ts) AS ts FROM events WHERE agent_id = ?", params: [opts.agentId] })) as any[])[0];
    let seenAt = opts.throughTs === undefined
        ? (row?.ts == null ? Date.now() : Number(row.ts))
        : Math.min(opts.throughTs, row?.ts == null ? 0 : Number(row.ts));
    const userId = await ctx.fns.auth.viewerId({});
    if (userId) {
        const saved = await db.run({
            sql: `INSERT INTO user_agent_state (user_id, agent_id, seen_at, updated_at) VALUES (?, ?, ?, ?)
                  ON CONFLICT (user_id, agent_id) DO UPDATE SET seen_at = GREATEST(COALESCE(user_agent_state.seen_at, 0), EXCLUDED.seen_at), updated_at = EXCLUDED.updated_at RETURNING seen_at`,
            params: [userId, opts.agentId, seenAt, Date.now()],
        });
        seenAt = Number(saved.rows[0].seen_at);
    }
    if (!userId || (await ctx.fns.auth.listUsers({})).length <= 1) {
        const saved = await db.run({ sql: "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = GREATEST(COALESCE(NULLIF(kv.value, '')::numeric, 0), EXCLUDED.value::numeric)::text RETURNING value", params: [`seen-at:${opts.agentId}`, String(seenAt)] });
        if (!userId) seenAt = Number(saved.rows[0].value);
    }
    // Opening a chat reads the viewer's @mentions in it.
    if (userId && opts.throughTs === undefined) await ctx.fns.mentions.markRead({ agentId: opts.agentId, userId }).catch(() => undefined);
    return seenAt;
}
