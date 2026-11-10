/**
 * Withdraw an already delivered notification from the owner's other devices.
 *
 * A notification is addressed to an account, but it is shown on devices. When the owner acts on the request — answering the form, or the agent starting a new run after a failure — the notification they already handled must disappear from the phone that is still displaying it. This sends a `recall` push to exactly the devices that received the notification, naming the tag of the original notification so the Service Worker closes that one notification and nothing else.
 *
 * The device the owner acted on is left alone: it already shows the chat. Delivery is best effort — a failed recall leaves a stale notification, which is harmless, and never changes the outcome of the action that triggered it. No payload text is carried, and the recall is not recorded in the delivery tables, so the at-most-once bookkeeping of ordinary pushes stays untouched.
 *
 * @param opts.inputId Input whose notification should be withdrawn.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Input whose notification should be withdrawn. */
        inputId: string;
    },
): Promise<void> {
    const inputId = String(opts.inputId ?? "");
    if (!inputId) return;
    // The exact devices that received this notification; anything else has nothing to withdraw.
    const deliveries = await ctx.fns.procs.db.select({
        sql: `SELECT d.subscription_id, s.endpoint, s.p256dh, s.auth
                FROM web_push_deliveries d
                JOIN web_push_subscriptions s ON s.id = d.subscription_id
                WHERE d.input_id = ? AND d.status = 'sent' AND s.expires_at > ?
                  -- iOS cannot close a delivered notification from the worker, and Safari revokes subscriptions
                  -- that receive pushes showing nothing: never send a recall to Apple endpoints.
                  AND s.endpoint NOT LIKE 'https://web.push.apple.com/%'`,
        params: [inputId, Date.now()],
    });
    if (!deliveries.length) return;

    const keys = await ctx.fns.webPush.vapid({});
    const wp = await import('web-push');
    // The tag of the notification being withdrawn must match the one the worker showed.
    const payload = JSON.stringify({ type: 'recall', tag: 'input-' + inputId });
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
            ctx.fns.procs.log?.warn?.({ event: 'web-push.recall.failed', msg: 'Notification recall failed', inputId, reason });
        }
    }));
}
