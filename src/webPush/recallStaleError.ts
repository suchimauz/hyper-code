/**
 * Withdraw every outdated error notification of an agent from the owner's other devices.
 *
 * A terminal failure notification outlives the failure it describes: the agent starts a new run and the phone still shows "the work stopped". This finds the error notifications that were actually delivered for this agent and withdraws them, so the Service Worker on each device closes the ones it is still showing.
 *
 * Only notifications that reached a device are withdrawn; a failure that was never delivered has nothing to close. Delivery is best effort — a failed recall leaves a stale notification, which is harmless.
 *
 * @param opts.agentId Agent whose outdated error notifications should be withdrawn.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent whose outdated error notifications should be withdrawn. */
        agentId: string;
    },
): Promise<void> {
    const agentId = String(opts.agentId ?? "");
    if (!agentId) return;
    // The run tokens whose error notification was actually delivered.
    const failures = await ctx.fns.procs.db.select({
        sql: `SELECT DISTINCT d.run_token
                FROM web_push_error_deliveries d
                WHERE d.agent_id = ? AND d.status = 'sent'`,
        params: [agentId],
    });
    if (!failures.length) return;
    for (const row of failures) {
        const runToken = String(row.run_token ?? "");
        if (!runToken) continue;
        await ctx.fns.webPush.recallError({ agentId, runToken }).catch(() => undefined);
    }
}
