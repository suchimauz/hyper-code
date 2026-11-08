/** Isolated goal store. Definition only: never invokes scheduling or modifies legacy agents.goal. */
export default { async up(ctx: Context) {
    await ctx.fns.procs.db.transaction({fn: async () => {
    await ctx.fns.procs.db.exec({sql: `
CREATE TABLE agent_goals (
 agent_id text PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
 goal_id uuid NOT NULL, schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),
 revision bigint NOT NULL CHECK(revision>0), objective text NOT NULL CHECK(length(btrim(objective))>0 AND length(objective)<=4000),
 status text NOT NULL CHECK(status IN ('active','paused','blocked','usage_limited','budget_limited','complete')),
 token_budget bigint CHECK(token_budget>0), tokens_used bigint NOT NULL DEFAULT 0 CHECK(tokens_used>=0),
 time_used_seconds bigint NOT NULL DEFAULT 0 CHECK(time_used_seconds>=0),
 created_at bigint NOT NULL, updated_at bigint NOT NULL
);
CREATE TABLE goal_transition_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
 goal_id uuid NOT NULL, origin text NOT NULL CHECK(origin IN ('create','update','set','clear')),
 before_revision bigint, after_revision bigint, before_status text, after_status text,
 run_token text, created_at bigint NOT NULL
);
CREATE INDEX goal_transition_events_agent ON goal_transition_events(agent_id,id);
CREATE TABLE goal_legacy_snapshots (
 agent_id text PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
 original_goal jsonb NOT NULL, captured_at bigint NOT NULL,
 import_state text NOT NULL DEFAULT 'pending_review' CHECK(import_state='pending_review')
);
INSERT INTO goal_legacy_snapshots(agent_id,original_goal,captured_at)
SELECT id,goal,(extract(epoch from clock_timestamp())*1000)::bigint FROM agents WHERE goal IS NOT NULL;
`});
    }});
} };
