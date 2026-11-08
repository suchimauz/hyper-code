/** Definition only: durable scoped usage snapshots; applying is an explicit deployment step. */
export default { async up(ctx: Context) {
 await ctx.fns.procs.db.transaction({fn:async()=>{
 await ctx.fns.procs.db.exec({sql:`
CREATE TABLE goal_usage_checkpoints (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
 goal_id uuid NOT NULL, source_agent_id text NOT NULL, run_id text NOT NULL,
 checkpoint_id text NOT NULL, sequence bigint NOT NULL CHECK(sequence>=0),
 snapshot jsonb NOT NULL, result jsonb NOT NULL,
 UNIQUE(agent_id,goal_id,source_agent_id,run_id,checkpoint_id),
 UNIQUE(agent_id,goal_id,source_agent_id,run_id,sequence)
);
CREATE INDEX goal_usage_checkpoint_latest ON goal_usage_checkpoints(agent_id,goal_id,source_agent_id,run_id,id DESC);
`});
 }});
}};
