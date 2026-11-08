/** Definition only: retain historical claims and quarantine pre-frontier grants. Never run implicitly. */
export default { async up(ctx: Context) {
 await ctx.fns.procs.db.transaction({fn:async()=>{
 await ctx.fns.procs.db.exec({sql:`
ALTER TABLE goal_delegation_reservations
 ADD COLUMN task_state text NOT NULL DEFAULT 'pending_review' CHECK (task_state IN ('pending_review','open','closed','cancelled')),
 ADD COLUMN authorized_through_idx bigint,
 ADD COLUMN closed_at bigint,
 ADD COLUMN close_reason text,
 ADD COLUMN retry_from_run_id text;
ALTER TABLE goal_delegations
 ADD COLUMN reservation_id uuid REFERENCES goal_delegation_reservations(reservation_id) ON DELETE RESTRICT,
 ADD COLUMN closed_at bigint,
 ADD COLUMN close_reason text,
 ADD COLUMN settled_checkpoint_id text,
 ADD COLUMN settled_sequence bigint;
UPDATE goal_delegations d SET reservation_id=r.reservation_id FROM goal_delegation_reservations r WHERE r.capability_id=d.capability_id;
UPDATE goal_delegation_reservations SET task_state='cancelled' WHERE cancelled_at IS NOT NULL;
CREATE UNIQUE INDEX goal_delegations_task_claim ON goal_delegations(reservation_id,source_run_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX goal_task_grants_outstanding ON goal_delegation_reservations(root_agent_id,goal_id,task_state);
`});
 }});
}};
