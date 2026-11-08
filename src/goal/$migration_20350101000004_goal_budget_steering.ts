/** Definition only: apply explicitly during deployment, never during authoring.
 * Receipt is scoped to owner + immutable identity, not revision/budget. No goal
 * row foreign key: clearing/replacing the current goal must not rearm a receipt.
 */
export default { async up(ctx: Context) {
 await ctx.fns.procs.db.exec({sql:`CREATE TABLE goal_budget_steering_receipts (
 agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
 goal_id uuid NOT NULL,
 created_at bigint NOT NULL,
 PRIMARY KEY(agent_id,goal_id)
 );`});
}};
