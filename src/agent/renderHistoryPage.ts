/**
 * Render a backward chat page counted by visible event cards rather than internal audit rows
 *
 * Use for initial web chat history and older-history requests. Reads bounded batches in descending event-index order, counts only nonempty rendered cards, and returns chronological HTML with an exclusive cursor. Hidden telemetry cannot consume the visible page budget. Does not change stored events, model messages, or the live tail cursor.
 * @param opts.agentId Conversation whose durable event history is read.
 * @param opts.beforeIdx Exclusive upper event-index boundary; use the current maximum plus one for the newest page. @minimum 0
 * @param opts.limit Maximum number of nonempty rendered event cards. @default 100 @minimum 1 @maximum 200
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Conversation whose durable event history is read. */
        agentId: string;
        /** Exclusive upper event-index boundary; use the current maximum plus one for the newest page. @minimum 0 */
        beforeIdx: number;
        /** Maximum number of nonempty rendered event cards. @default 100 @minimum 1 @maximum 200 */
        limit?: number;
    },
): Promise<{ html: string; nextBefore: number | null; visibleCount: number }> {
    const before = Number.isFinite(opts.beforeIdx) ? Math.max(0, Math.floor(opts.beforeIdx)) : 0;
    const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(200, Math.floor(opts.limit!))) : 100;
    const batchSize = 200;
    let cursor = before;
    const cards: string[] = [];
    while (cursor > 0 && cards.length < limit) {
        const events = await ctx.fns.session.getEvents({ id: opts.agentId, beforeIdx: cursor, limit: batchSize });
        if (!events.length) { cursor = 0; break; }
        // Use the same failure-isolating renderer as the live tail. A broken card
        // remains a visible diagnostic instead of silently disappearing.
        const rendered = await Promise.all(events.map(event => ctx.fns.agent.renderEventsHtml({ events: [event], agentId: opts.agentId })));
        const prior = cursor;
        for (let i = events.length - 1; i >= 0; i--) {
            cursor = Number(events[i].idx);
            const html = rendered[i]!;
            if (html.trim()) cards.push(html);
            if (cards.length === limit) break;
        }
        if (cursor >= prior) throw new Error('Chat history cursor did not advance');
        if (cards.length < limit && events.length < batchSize) cursor = 0;
    }
    return { html: cards.reverse().join('\n'), nextBefore: cursor > 0 ? cursor : null, visibleCount: cards.length };
}
