/**
 * Withdraw an error notification from the owner's other devices once the agent moved on.
 *
 * A terminal failure notification outlives the failure it describes: the agent starts a new run and the phone still shows "the work stopped". This sends the same `recall` push for the error's tag to exactly the devices that received it, so the Service Worker closes that one notification.
 *
 * Delivery is best effort — a failed recall leaves a stale notification, which is harmless. No payload text is carried, and the recall is not recorded in the delivery tables, so the at-most-once bookkeeping of ordinary pushes stays untouched.
 *
 * @param opts.agentId Agent whose error notification should be withdrawn.
 * @param opts.runToken Token of the failed run whose notification should be withdrawn.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent whose error notification should be withdrawn. */
        agentId: string;
        /** Token of the failed run whose notification should be withdrawn. */
        runToken: string;
    },
): Promise<void> {
    const agentId = String(opts.agentId ?? "");
    const runToken = String(opts.runToken ?? "");
    if (!agentId || !runToken) return;
    const deliveries = await ctx.fns.procs.db.select({
        sql: `SELECT d.subscription_id, s.endpoint, s.p256dh, s.auth
                FROM web_push_error_deliveries d
                JOIN web_push_subscriptions s ON s.id = d.subscription_id
                WHERE d.agent_id = ? AND d.run_token = ? AND d.status = 'sent' AND s.expires_at > ?`,
        params: [agentId, runToken, Date.now()],
    });
    if (!deliveries.length) return;

    const keys = await ctx.fns.webPush.vapid({});
    const wp = await import('web-push');
    const payload = JSON.stringify({ type: 'recall', tag: 'error-' + runToken });
    await Promise.all(deliveries.map(async (row: any) => {
        try {
            const subscription = await ctx.fns.webPush.validateSubscription({
                subscription: { endpoint: String(row.endpoint), keys: { p256dh: String(row.p256dh), auth: String(row.auth) } },
            });
            const details = wp.generateRequestDetails(subscription, payload, {
                TTL: 60,
                urgency: 'normal',
                vapidDetails: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
            });
            const response = await fetch(details.endpoint, {
                method: 'POST', headers: details.headers, body: details.body, redirect: 'error', signal: AbortSignal.timeout(5000),
            });
            await response.body?.cancel();
            if (response.status === 404 || response.status === 410) {
                await ctx.fns.procs.db.run({ sql: 'DELETE FROM web_push_subscriptions WHERE id=?', params: [row.subscription_id] });
            }
        } catch (error) {
            // Never log exception messages, endpoint URLs or signing keys.
            const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'operation-failed';
            ctx.fns.procs.log?.warn?.({ event: 'web-push.recall.failed', msg: 'Error notification recall failed', agentId, reason });
        }
    }));
}
