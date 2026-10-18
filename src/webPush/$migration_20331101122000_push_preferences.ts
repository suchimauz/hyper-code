/** Store per-owner main-agent notification choices; absent rows preserve default-on behavior. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `
CREATE TABLE IF NOT EXISTS web_push_preferences (
 agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
 owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 input_enabled boolean NOT NULL DEFAULT true,
 error_enabled boolean NOT NULL DEFAULT true,
 updated_at bigint NOT NULL,
 PRIMARY KEY(agent_id, owner_id)
);`});
    },
};
