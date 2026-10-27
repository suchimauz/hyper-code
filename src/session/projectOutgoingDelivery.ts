/**
 * Persist a UI-only outgoing agent message from a durable inbound receipt.
 *
 * Use inside deliverInbound’s recipient-locked transaction after draining an immutable receipt. Deduplicates sender events by recipient and delivery key, without adding sender transcript messages or scheduling the sender.
 * @param opts.from Sender session identifier.
 * @param opts.to Recipient session identifier.
 * @param opts.deliveryKey Immutable inbound receipt key.
 * @param opts.title Recipient title snapshot.
 * @param opts.body Plain outgoing message body.
 * @param opts.hop Agent exchange hop counter.
 * @param opts.createdAt Receipt delivery timestamp in epoch milliseconds.
 * @param opts.messageIdx Durably delivered recipient transcript index.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Sender session identifier. */
        from: string;
        /** Recipient session identifier. */
        to: string;
        /** Immutable inbound receipt key. */
        deliveryKey: string;
        /** Recipient title snapshot. */
        title: string;
        /** Plain outgoing message body. */
        body: string;
        /** Agent exchange hop counter. */
        hop: number;
        /** Receipt delivery timestamp in epoch milliseconds. */
        createdAt: number;
        /** Durably delivered recipient transcript index. */
        messageIdx: number;
    },
): Promise<void> {
    const actor = 'agent:' + opts.from;
    const event = { type: 'agent_message_outgoing', actor, ts: opts.createdAt, outgoingAgentMessage: { deliveryKey: opts.deliveryKey, to: opts.to, title: opts.title, body: opts.body, hop: opts.hop, status: 'delivered', messageIdx: opts.messageIdx } };
    const prior = (await ctx.fns.procs.db.select({sql: "SELECT idx FROM events WHERE agent_id=? AND type='agent_message_outgoing' AND payload::jsonb #>> '{outgoingAgentMessage,deliveryKey}' = ? AND payload::jsonb #>> '{outgoingAgentMessage,to}' = ? LIMIT 1", params:[opts.from,opts.deliveryKey,opts.to]}))[0];
    if (prior) return;
    await ctx.fns.procs.db.run({sql:'INSERT INTO events(agent_id,idx,type,payload,ts,actor) SELECT ?,COALESCE(MAX(idx),-1)+1,?,?,?,? FROM events WHERE agent_id=?',params:[opts.from,event.type,JSON.stringify(event),opts.createdAt,actor,opts.from]});
}
