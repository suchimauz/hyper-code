/** Durable per-owner continuation receipts and fork barriers. Definition only; apply after goal_core. */
export default { async up(ctx: Context) {
    await ctx.fns.procs.db.transaction({fn: async () => {
    await ctx.fns.procs.db.exec({sql: `
CREATE TABLE goal_continuation_deferrals (
 agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
 goal_id uuid NOT NULL, reason text NOT NULL CHECK(reason='fork_snapshot'),
 created_at bigint NOT NULL,
 PRIMARY KEY(agent_id,goal_id,reason)
);
CREATE TABLE goal_continuation_admissions (
 agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
 goal_id uuid NOT NULL, run_token text NOT NULL, goal_revision bigint NOT NULL,
 message_idx integer NOT NULL, created_at bigint NOT NULL,
 PRIMARY KEY(agent_id,goal_id,run_token),
 UNIQUE(agent_id,message_idx)
);
`});
    }});
} };
