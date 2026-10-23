function compactResult(value: any, maxChars = 16_000): any {
    let json: string;
    try { json = JSON.stringify(value); }
    catch { return { truncated: true, preview: String(value).slice(0, maxChars) }; }
    if (json.length <= maxChars) return value;
    return { truncated: true, originalChars: json.length, preview: json.slice(0, maxChars) };
}

/**
 * Evaluate and deliver a legacy watch only for an agent that is not stopped.
 * Preserve pending watches while stopped, and recheck the agent under its row
 * lock before completing a watch, appending a prompt or scheduling a run.
 * @param opts.watchId Conditional watch identifier.
 * @param opts.now Current epoch milliseconds. @default Date.now()
 * @param opts.claimed Whether a dispatcher already claimed this watch. @default false
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Watch identifier. */
    watchId: string;
        /** Current epoch milliseconds. @default Date.now() */
    now?: number;
        /** Whether a dispatcher already claimed this watch. @default false */
    claimed?: boolean },
): Promise<{ status: "ready" | "waiting" | "timeout" | "missing"; result?: any }> {
    const now = opts.now ?? Date.now();
    const candidate = ((await ctx.fns.procs.db.select({
        sql: "SELECT * FROM agent_watches WHERE id = ? AND status = ?",
        params: [opts.watchId, opts.claimed ? "checking" : "active"],
    })) as any[])[0];
    if (!candidate) return { status: "missing" };
    const claim = await ctx.fns.procs.db.transaction({ fn: async () => {
        const owner = ((await ctx.fns.procs.db.select({
            sql: "SELECT stopped_at, archived_at FROM agents WHERE id = ? FOR UPDATE", params: [candidate.agent_id],
        })) as { stopped_at: number | null; archived_at: number | null }[])[0];
        if (!owner || owner.stopped_at != null || owner.archived_at != null) {
            await ctx.fns.procs.db.run({
                sql: "UPDATE agent_watches SET status = 'active' WHERE id = ? AND status = 'checking'",
                params: [candidate.id],
            });
            return { paused: true, row: null };
        }
        const row = ((await ctx.fns.procs.db.select({
            sql: opts.claimed
                ? "SELECT * FROM agent_watches WHERE id = ? AND status = 'checking' FOR UPDATE"
                : "UPDATE agent_watches SET status = 'checking' WHERE id = ? AND status = 'active' RETURNING *",
            params: [opts.watchId],
        })) as any[])[0];
        return { paused: false, row };
    } }) as { paused: boolean; row: any };
    if (claim.paused) return { status: "waiting" };
    const row = claim.row;
    if (!row) return { status: "missing" };

    const input = typeof row.opts === "string" ? JSON.parse(row.opts) : row.opts;
    let status: "ready" | "waiting" | "timeout" = now >= Number(row.timeout_at) ? "timeout" : "waiting";
    let result: any = null;
    let error: string | null = null;
    if (status !== "timeout") {
        try {
            const checked = await ctx.fns.agent.watchPredicate({ predicate: row.predicate, opts: input });
            if (checked.ready) { status = "ready"; result = compactResult(checked.result ?? true); }
        } catch (e: any) { error = String(e?.message ?? e).slice(0, 1000); }
    }
    const outcome = await ctx.fns.procs.db.transaction({ fn: async () => {
        const owner = ((await ctx.fns.procs.db.select({
            sql: "SELECT stopped_at, archived_at FROM agents WHERE id = ? FOR UPDATE", params: [row.agent_id],
        })) as { stopped_at: number | null; archived_at: number | null }[])[0];
        if (!owner || owner.stopped_at != null || owner.archived_at != null) {
            await ctx.fns.procs.db.run({
                sql: "UPDATE agent_watches SET status = 'active' WHERE id = ? AND status = 'checking'", params: [row.id],
            });
            return { status: "waiting" as const };
        }
    if (status === "waiting") {
        const updated = await ctx.fns.procs.db.run({
            sql: "UPDATE agent_watches SET status = 'active', attempts = attempts + 1, last_error = ?, next_check_at = ? WHERE id = ? AND status = 'checking'",
            params: [error, now + Number(row.interval_ms), row.id],
        });
        return { status: updated.changes > 0 ? "waiting" as const : "missing" as const };
    }

    const finalStatus = status === "ready" ? "completed" : "timeout";
    const finalized = await ctx.fns.procs.db.run({
        sql: "UPDATE agent_watches SET status = ?, attempts = attempts + 1, last_error = ?, finished_at = ? WHERE id = ? AND status = 'checking'",
        params: [finalStatus, error, now, row.id],
    });
    if (finalized.changes === 0) return { status: "missing" as const };

    const summary = status === "ready" ? `Wake condition met: ${row.reason}` : `Wake condition timed out: ${row.reason}`;
    const body = status === "ready" ? `${summary}\n\nResult: ${JSON.stringify(result)}` : summary;
    const message = await ctx.fns.session.appendMessage({ id: row.agent_id, message: { role: "user", content: body, message_type: "wake_up", excluded_from_cursor: true } });
    await ctx.fns.session.appendEvent({ id: row.agent_id, event: { type: "wake_up", reason: row.reason, summary, result: status === "ready" ? result : null, messageIdx: message.idx, watchId: row.id, watchStatus: status } });
    await ctx.fns.procs.db.run({ sql: "UPDATE agents SET next_run_at = COALESCE(next_run_at, ?), updated_at = ? WHERE id = ?", params: [now, now, row.agent_id] });
    return { status, ...(status === "ready" ? { result } : {}) };
    } }) as { status: "ready" | "waiting" | "timeout" | "missing"; result?: any };
    if (outcome.status !== "ready" && outcome.status !== "timeout") return outcome;
    const agent = (ctx.state as any).agent?.[row.agent_id];
    if (agent) await ctx.fns.session.syncAgentState({ agent });
    ctx.fns.events.refreshAgentMeta({ agentId: row.agent_id, section: "wake", reason: "watch-delivered" });
    ctx.fns.agent.wakeWorker({});
    return outcome;
}
