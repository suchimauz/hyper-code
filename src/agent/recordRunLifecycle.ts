/**
 * Persist observed run start and terminal boundaries for transcript grouping
 *
 * Use at actual turn start after triggering input and in the turn finally block. Stores event indices, final answer event index and interleaved user input. Historical boundaries are never inferred; open records survive process failure without invented end times.
 * @param opts.agentId Agent owning this execution.
 * @param opts.runId Unique identifier captured by the executing turn.
 * @param opts.status Open creates the observed boundary; a terminal status closes this execution.
 * @param opts.answerIdx Final assistant event index only, never commentary; absent means no final answer.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent owning this execution. */
        agentId: string;
        /** Unique identifier captured by the executing turn. */
        runId: string;
        /** Open creates the observed boundary; a terminal status closes this execution. */
        status: "open" | "completed" | "stopped" | "error";
        /** Final assistant event index only, never commentary; absent means no final answer. */
        answerIdx?: number | null;
    },
): Promise<void> {
    const now = Date.now();
    if (opts.status === 'open') {
        await ctx.fns.procs.db.run({ sql: `INSERT INTO agent_runs (id,agent_id,start_idx,started_at,status)
            SELECT ?,?,COALESCE(MAX(idx),-1)+1,?,'open' FROM events WHERE agent_id = ?`, params:[opts.runId,opts.agentId,now,opts.agentId] });
        return;
    }
    await ctx.fns.procs.db.run({ sql: `UPDATE agent_runs r SET status=?, ended_at=?,
        end_idx=(SELECT COALESCE(MAX(idx),r.start_idx-1) FROM events WHERE agent_id=r.agent_id),
        answer_idx=?, has_interleaved_input=EXISTS(SELECT 1 FROM events e
            JOIN messages m ON m.agent_id=e.agent_id AND m.idx::text=e.payload::jsonb->>'messageIdx'
            WHERE e.agent_id=r.agent_id AND e.idx>=r.start_idx AND e.type='user'
            AND m.role='user' AND coalesce(m.message_type,'message')='message'
            AND coalesce(m.author,'') NOT LIKE 'agent:%'
            AND coalesce(e.actor,'') NOT LIKE 'agent:%'
            AND coalesce(e.payload::jsonb->>'actor','') NOT LIKE 'agent:%'
            AND e.payload::jsonb->>'agentMessage' IS NULL
            AND e.payload::jsonb->>'outgoingAgentMessage' IS NULL
            AND coalesce(e.payload::jsonb->>'text','') !~ '^<(agent-message|team-update|input-result|canvas-ping)([[:space:]]|>)')
        WHERE r.id=? AND r.agent_id=? AND r.status='open'`, params:[opts.status,now,opts.answerIdx ?? null,opts.runId,opts.agentId] });
}
