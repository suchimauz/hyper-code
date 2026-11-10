/**
 * Decide whether an owner-bound push must not be sent because the owner already has the chat in front of them.
 *
 * Suppression is account-level, not device-level: the owner sees one MauzCode account across several devices, so a notification that the owner has already read on the phone must not also buzz the laptop. Two signals are consulted, in this order:
 *
 * 1. Presence (in-process): the live event stream records which chats a person currently has open. This is the cheapest signal and the most accurate while the process runs.
 * 2. The durable read receipt in `user_agent_state.seen_at`: it advances when a chat is opened and survives a restart, so a notification created before the owner opened the chat is not delivered afterwards.
 *
 * Both signals are intentionally sticky for the lifetime of the event they describe. If the owner opened the chat and then walked away, the notification stays suppressed — the event was already shown to them once, and a stale push for it would be noise.
 *
 * @param opts.agentId Chat the notification belongs to.
 * @param opts.ownerId Account the notification would be delivered to.
 * @param opts.eventAt Moment the event happened, in epoch milliseconds. The owner is considered to have seen it when their read receipt is at or after this moment.
 * @returns True when the notification must not be sent.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Chat the notification belongs to. */
        agentId: string;
        /** Account the notification would be delivered to. */
        ownerId: string;
        /** Moment the event happened, in epoch milliseconds. */
        eventAt: number;
    },
): Promise<boolean> {
    const agentId = String(opts.agentId ?? "");
    const ownerId = String(opts.ownerId ?? "");
    if (!agentId || !ownerId) return false;

    // Presence is per person and per chat: one entry per account, refcounted over its tabs.
    try {
        const here = ctx.fns.procs.events.presence({ agentId });
        if (here.some(person => person.id === ownerId)) return true;
    } catch { /* Presence is an optimisation; the durable receipt below still decides. */ }

    // The durable fallback: the owner's last read receipt for this chat.
    const rows = await ctx.fns.procs.db.select({
        sql: 'SELECT seen_at FROM user_agent_state WHERE user_id = ? AND agent_id = ?',
        params: [ownerId, agentId],
    });
    const seenAt = Number(rows[0]?.seen_at ?? 0);
    return Number.isFinite(seenAt) && seenAt > 0 && seenAt >= Number(opts.eventAt ?? 0);
}
