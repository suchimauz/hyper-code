/** Definition only. Durable required marker survives reservation/capability deletion; never clear it on existing children. */
export default { async up(ctx: Context) {
 await ctx.fns.procs.db.transaction({fn:async()=>{
 await ctx.fns.procs.db.exec({sql:`
ALTER TABLE agents ADD COLUMN goal_delegation_required boolean NOT NULL DEFAULT false;
CREATE TABLE goal_delegation_reservations (
 reservation_id uuid PRIMARY KEY,
 root_agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
 goal_id uuid NOT NULL,
 source_agent_id text NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
 delegator_agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
 delegator_run_id text NOT NULL,
 parent_capability_id uuid REFERENCES goal_delegations(capability_id) ON DELETE CASCADE,
 created_at bigint NOT NULL,
 cancelled_at bigint,
 cancel_reason text,
 consumed_at bigint,
 source_run_id text,
 capability_id uuid UNIQUE REFERENCES goal_delegations(capability_id) ON DELETE CASCADE,
 CHECK ((consumed_at IS NULL AND source_run_id IS NULL AND capability_id IS NULL)
 OR (consumed_at IS NOT NULL AND source_run_id IS NOT NULL AND capability_id IS NOT NULL)),
 CHECK (source_agent_id <> root_agent_id AND source_agent_id <> delegator_agent_id),
 CHECK ((delegator_agent_id = root_agent_id AND parent_capability_id IS NULL)
 OR (delegator_agent_id <> root_agent_id AND parent_capability_id IS NOT NULL))
);
CREATE INDEX goal_delegation_reservations_root ON goal_delegation_reservations(root_agent_id,goal_id);
CREATE INDEX goal_delegation_reservations_parent ON goal_delegation_reservations(parent_capability_id);
`});
 }});
}};
