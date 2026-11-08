/**
 * Reauthorize captured descendant authority immediately before provider dispatch
 *
 * Internal dispatch guard: read-only single-snapshot validation of the run-owned immutable capability, task frontier, producer claim and live root. Ordinary requests are a no-op. Never called by previews; never updates lifecycle or holds a transaction lock over network. Revocation after this check cannot be atomic with external network start. Denial is tagged goalRequestDenied and must not be retried as a transport error.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<void> {
    const scope = (ctx as Context & { goalRequestContext?: { agentId: string; authority?: types.goal.DelegationAuthority } }).goalRequestContext;
    const a = scope?.authority;
    if (!a) return;
    const deny = () => { throw Object.assign(new Error('Delegated model request authority denied before dispatch'), {goalRequestDenied:true}); };
    if (scope!.agentId !== a.sourceAgentId || !a.sourceRunId || !a.capabilityId || !Number.isSafeInteger(a.authorizedThroughIdx) || a.authorizedThroughIdx! < 0) deny();
    if (!await ctx.fns.goal.enabled({})) deny();
    const rows = await ctx.fns.procs.db.select({sql: `WITH RECURSIVE chain AS (
     SELECT d.*, ARRAY[d.capability_id] AS path, false AS cycle FROM goal_delegations d WHERE capability_id=?::uuid
     UNION ALL
     SELECT p.*, c.path || p.capability_id, p.capability_id=ANY(c.path) FROM goal_delegations p JOIN chain c ON p.capability_id=c.parent_capability_id WHERE NOT c.cycle AND cardinality(c.path)<128
    )
    SELECT EXISTS (
     SELECT 1 FROM chain leaf
     JOIN goal_delegation_reservations task ON task.reservation_id=leaf.reservation_id
     JOIN agents root ON root.id=leaf.root_agent_id
     JOIN agents source ON source.id=leaf.source_agent_id
     JOIN agent_goals g ON g.agent_id=root.id AND g.goal_id=leaf.goal_id
     WHERE cardinality(leaf.path)=1 AND leaf.root_agent_id=? AND leaf.goal_id=?::uuid
     AND leaf.source_agent_id=? AND leaf.source_run_id=? AND leaf.closed_at IS NULL
     AND source.run_token=leaf.source_run_id AND source.run_state='running' AND source.stopped_at IS NULL AND source.archived_at IS NULL
     AND root.stopped_at IS NULL AND root.archived_at IS NULL
     AND g.status='active' AND (g.token_budget IS NULL OR g.tokens_used<g.token_budget)
     AND task.task_state='open' AND task.cancelled_at IS NULL AND task.authorized_through_idx=?
     AND task.root_agent_id=leaf.root_agent_id AND task.goal_id=leaf.goal_id AND task.source_agent_id=leaf.source_agent_id
     AND NOT EXISTS (SELECT 1 FROM chain c WHERE c.revoked_at IS NOT NULL OR c.cycle OR c.root_agent_id<>leaf.root_agent_id OR c.goal_id<>leaf.goal_id OR (c.parent_capability_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM chain p WHERE p.capability_id=c.parent_capability_id)))
    ) AS allowed`,params:[a.capabilityId,a.rootAgentId,a.goalId,a.sourceAgentId,a.sourceRunId,a.authorizedThroughIdx!]});
    if (rows[0]?.allowed !== true) deny();
}
