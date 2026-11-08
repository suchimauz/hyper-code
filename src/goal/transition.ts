/**
 * Validate a goal mutation and return an immutable next snapshot.
 *
 * Pure Codex transition with identity/revision CAS; no persistence, scheduling or accounting. Model creation inherits host cap; external set preserves usage.
 * @param opts.current Current snapshot; null asserts absence.
 * @param opts.command Model create/update or external set/clear.
 * @param opts.expectedGoalId Previously observed identity or null.
 * @param opts.expectedRevision Previously observed revision or null.
 * @param opts.now Unix millisecond mutation timestamp. @minimum 0
 * @param opts.newGoalId Fresh identity for creation/replacement.
 * @param opts.agentId Owner identifier.
 * @param opts.maxTokenBudget Host model-create cap; null means unlimited.
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Current snapshot; null asserts absence. */
    current: types.goal.State | null;
    /** Model create/update or external set/clear. */
    command: types.goal.Command;
    /** Previously observed identity or null. */
    expectedGoalId: string | null;
    /** Previously observed revision or null. */
    expectedRevision: number | null;
    /** Unix millisecond mutation timestamp. @minimum 0 */
    now: number;
    /** Fresh identity for creation/replacement. */
    newGoalId: string;
    /** Owner identifier. */
    agentId: string;
    /** Host model-create cap; null means unlimited. */
    maxTokenBudget: number | null;
}): Promise<types.goal.State | null> {
    const { current: c, command: cmd } = opts;
    const valid = (v: number) => Number.isSafeInteger(v) && v >= 0;
    if (!opts.agentId || !opts.newGoalId || !valid(opts.now))
        throw new Error("Invalid identity or timestamp");
    if (opts.maxTokenBudget !== null && (!valid(opts.maxTokenBudget) || opts.maxTokenBudget === 0))
        throw new Error("Invalid host cap");
    if ((c?.goalId ?? null) !== opts.expectedGoalId || (c?.revision ?? null) !== opts.expectedRevision)
        throw new Error("Goal conflict: stale identity or revision");
    if (c && c.agentId !== opts.agentId)
        throw new Error("Goal owner mismatch");
    if (cmd.kind === 'clear')
        return null;
    if (cmd.kind === 'create' && c && c.status !== 'complete')
        throw new Error("An unfinished goal already exists");
    if (cmd.kind === 'update' && (!c || !['complete', 'blocked', 'paused'].includes(cmd.status)))
        throw new Error("Invalid model update");
    if (!['create', 'update', 'set'].includes(cmd.kind))
        throw new Error("Invalid command");
    const fresh = !c || cmd.kind === 'create';
    const objective = cmd.kind === 'update' ? c!.objective : cmd.objective === undefined ? c?.objective : cmd.objective.trim();
    if (!objective)
        throw new Error("A nonempty objective is required");
    if ([...objective].length > 4000)
        throw new Error("Objective exceeds 4000 Unicode characters");
    let budget = cmd.kind === 'update' ? c!.tokenBudget : cmd.tokenBudget === undefined ? (fresh ? null : c!.tokenBudget) : cmd.tokenBudget;
    if (budget !== null && (!valid(budget) || budget === 0))
        throw new Error("Invalid token budget");
    if (cmd.kind === 'create' && opts.maxTokenBudget !== null) {
        if (budget === null)
            budget = opts.maxTokenBudget;
        if (budget > opts.maxTokenBudget)
            throw new Error("Budget exceeds host cap");
    }
    let status: types.goal.State['status'] = cmd.kind === 'create' ? 'active' : cmd.kind === 'update' ? cmd.status : cmd.status ?? c?.status ?? 'active';
    if (!['active', 'paused', 'blocked', 'usage_limited', 'budget_limited', 'complete'].includes(status))
        throw new Error("Invalid status");
    const tokensUsed = fresh ? 0 : c!.tokensUsed;
    if (!fresh && c!.status === 'budget_limited' && ['paused', 'blocked'].includes(status))
        status = 'budget_limited';
    if (status === 'active' && budget !== null && tokensUsed >= budget)
        status = 'budget_limited';
    if (fresh && c && opts.newGoalId === c.goalId)
        throw new Error("Replacement requires fresh identity");
    return { agentId: opts.agentId, goalId: fresh ? opts.newGoalId : c!.goalId, schemaVersion: 1, revision: fresh ? 1 : c!.revision + 1, objective, status, tokenBudget: budget, tokensUsed, timeUsedSeconds: fresh ? 0 : c!.timeUsedSeconds, createdAt: fresh ? opts.now : c!.createdAt, updatedAt: opts.now };
}
