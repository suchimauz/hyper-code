/** Durable terminal-run identities and at-most-once error push delivery receipts. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `
CREATE TABLE IF NOT EXISTS web_push_failures (
 agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
 run_token text NOT NULL,
 failed_at bigint NOT NULL,
 PRIMARY KEY(agent_id, run_token)
);
CREATE TABLE IF NOT EXISTS web_push_error_deliveries (
 agent_id text NOT NULL,
 run_token text NOT NULL,
 subscription_id text NOT NULL REFERENCES web_push_subscriptions(id) ON DELETE CASCADE,
 attempted_at bigint NOT NULL,
 status text NOT NULL DEFAULT 'claimed',
 PRIMARY KEY(agent_id, run_token, subscription_id),
 FOREIGN KEY(agent_id, run_token) REFERENCES web_push_failures(agent_id, run_token) ON DELETE CASCADE
);`});
    },
};
