/** Definition only; never applied by capability APIs. Run claims must overlap for registration. */
export default { async up(ctx: Context) {
 await ctx.fns.procs.db.transaction({fn:async()=>{
 await ctx.fns.procs.db.exec({sql:`
CREATE TABLE goal_delegations (
 capability_id uuid PRIMARY KEY,
 root_agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
 goal_id uuid NOT NULL,
 source_agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
 source_run_id text NOT NULL,
 delegator_agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
 delegator_run_id text NOT NULL,
 parent_capability_id uuid REFERENCES goal_delegations(capability_id) ON DELETE CASCADE,
 revoked_at bigint,
 created_at bigint NOT NULL,
 UNIQUE(root_agent_id,goal_id,source_agent_id,source_run_id)
);
CREATE INDEX goal_delegations_parent ON goal_delegations(parent_capability_id);
`});
 }});
}};
