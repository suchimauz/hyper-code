/**
 * Read a bounded page of durable user-message anchors for the chat navigation rail.
 *
 * Use to enumerate navigation prompts without loading complete tool transcripts. Only events linked to durable user messages are included; the cursor advances by event index.
 * @param opts.id Agent whose local transcript outline is requested.
 * @param opts.after Exclusive event-index cursor; omit for the first page. @default -1
 * @param opts.limit Maximum outline entries returned in one page. @default 1000 @minimum 1 @maximum 1000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent whose local transcript outline is requested. */
        id: string;
        /** Exclusive event-index cursor; omit for the first page. @default -1 */
        after?: number;
        /** Maximum outline entries returned in one page. @default 1000 @minimum 1 @maximum 1000 */
        limit?: number;
    },
): Promise<{ items: { idx: number; prompt: string }[]; nextAfter: number | null }> {
    const after = Number.isSafeInteger(opts.after) ? opts.after! : -1;
    const limit = Math.max(1, Math.min(1000, Math.floor(opts.limit ?? 1000)));
    const rows = await ctx.fns.procs.db.select({ sql: "SELECT e.idx, left(coalesce(e.payload::jsonb->>'text', ''), 500) AS prompt FROM events e JOIN messages m ON m.agent_id = e.agent_id AND m.idx::text = e.payload::jsonb->>'messageIdx' WHERE e.agent_id = ? AND e.type = 'user' AND m.role = 'user' AND coalesce(m.message_type, 'message') = 'message' AND coalesce(m.author, '') NOT LIKE 'agent:%' AND e.payload::jsonb->>'agentMessage' IS NULL AND coalesce(e.actor, '') NOT LIKE 'agent:%' AND coalesce(e.payload::jsonb->>'text', '') !~ '^<(agent-message|team-update|input-result|canvas-ping)([[:space:]]|>)' AND e.idx > ? ORDER BY e.idx LIMIT ?", params: [opts.id, after, limit + 1] }) as { idx: number; prompt: string }[];
    const items = rows.slice(0, limit).map(row => ({ idx: Number(row.idx), prompt: row.prompt }));
    return { items, nextAfter: rows.length > limit ? items.at(-1)!.idx : null };
}
