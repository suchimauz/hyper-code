/**
 * Withdraw the chat's delivered push notifications from all of the owner's devices once the owner has viewed the chat.
 *
 * Called after a read receipt: when the account that received input-waiting or error notifications for a chat opens that chat on any device, every notification for an event at or before the read watermark is recalled from every device that received it. Only the viewer's own subscriptions are considered, so another person reading a shared chat withdraws nothing. Each delivery is marked 'recalled' afterwards so later receipts do not send the same recall again. Best effort.
 * @param opts.agentId Chat (agent) id that was viewed.
 * @param opts.userId Account that viewed the chat; only notifications delivered to its subscriptions are withdrawn.
 * @param opts.seenAt Read watermark in epoch milliseconds; notifications for events at or before it are withdrawn. @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Chat (agent) id that was viewed. */
        agentId: string;
        /** Account that viewed the chat; only notifications delivered to its subscriptions are withdrawn. */
        userId: string;
        /** Read watermark in epoch milliseconds; notifications for events at or before it are withdrawn. @minimum 0 */
        seenAt: number;
    },
): Promise<{ inputs: number; errors: number }> {
    const agentId = String(opts.agentId ?? ""), userId = String(opts.userId ?? ""), seenAt = Number(opts.seenAt);
    if (!agentId || !userId || !Number.isFinite(seenAt) || seenAt <= 0) return { inputs: 0, errors: 0 };
    const db = ctx.fns.procs.db;
    const inputs = await db.select({
        sql: `SELECT DISTINCT i.id FROM inputs i
               JOIN web_push_deliveries d ON d.input_id = i.id
               JOIN web_push_subscriptions s ON s.id = d.subscription_id
               WHERE i.agent_id = ? AND i.created_at <= ? AND d.status = 'sent' AND s.owner_id = ?`,
        params: [agentId, seenAt, userId],
    }) as { id: string }[];
    for (const row of inputs) {
        await ctx.fns.webPush.recall({ inputId: String(row.id) }).catch(() => undefined);
        await db.run({ sql: "UPDATE web_push_deliveries SET status = 'recalled' WHERE input_id = ? AND status = 'sent'", params: [String(row.id)] });
    }
    const errors = await db.select({
        sql: `SELECT DISTINCT f.run_token FROM web_push_failures f
               JOIN web_push_error_deliveries d ON d.agent_id = f.agent_id AND d.run_token = f.run_token
               JOIN web_push_subscriptions s ON s.id = d.subscription_id
               WHERE f.agent_id = ? AND f.failed_at <= ? AND d.status = 'sent' AND s.owner_id = ?`,
        params: [agentId, seenAt, userId],
    }) as { run_token: string }[];
    for (const row of errors) {
        await ctx.fns.webPush.recallError({ agentId, runToken: String(row.run_token) }).catch(() => undefined);
        await db.run({ sql: "UPDATE web_push_error_deliveries SET status = 'recalled' WHERE agent_id = ? AND run_token = ? AND status = 'sent'", params: [agentId, String(row.run_token)] });
    }
    return { inputs: inputs.length, errors: errors.length };
}
