/** Add opt-in session-bound push subscriptions and durable at-most-once input delivery receipts. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
 id text PRIMARY KEY,
 owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_key text NOT NULL,
 session_id text,
 endpoint text NOT NULL UNIQUE,
 p256dh text NOT NULL,
 auth text NOT NULL,
 expires_at bigint NOT NULL,
 created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS web_push_subscriptions_owner ON web_push_subscriptions(owner_id);
CREATE TABLE IF NOT EXISTS web_push_deliveries (
 input_id text NOT NULL REFERENCES inputs(id) ON DELETE CASCADE,
 subscription_id text NOT NULL REFERENCES web_push_subscriptions(id) ON DELETE CASCADE,
 attempted_at bigint NOT NULL,
 status text NOT NULL DEFAULT 'claimed',
 PRIMARY KEY(input_id, subscription_id)
);`});
    },
};
