/**
 * Select a system failure status without mutating goal state
 *
 * Pure pinned Codex error policy. Only terminal execution errors block; provider usage limits override active or budget_limited. Interrupts, scheduled retries, and Codex Plan-mode turns preserve status. Hyper session.plan task tracking is not Codex Plan mode. Does not apply budget normalization, which would incorrectly mask provider limits.
 * @param opts.status Authoritative status after final usage accounting.
 * @param opts.reason Trusted classified runtime outcome, never inferred from text.
 * @param opts.terminal True only when the worker will not schedule a retry.
 * @param opts.codexPlanMode Actual Codex execution Plan mode; never derive from Hyper session.plan.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Authoritative status after final usage accounting. */
        status: types.goal.State["status"];
        /** Trusted classified runtime outcome, never inferred from text. */
        reason: "terminal_error" | "usage_limit" | "interrupted";
        /** True only when the worker will not schedule a retry. */
        terminal: boolean;
        /** Actual Codex execution Plan mode; never derive from Hyper session.plan. */
        codexPlanMode: boolean;
    },
): Promise<types.goal.State["status"] | null> {
    if (!opts.terminal || opts.codexPlanMode || opts.reason === 'interrupted') return null;
    if (opts.reason === 'usage_limit' && (opts.status === 'active' || opts.status === 'budget_limited')) return 'usage_limited';
    if (opts.reason === 'terminal_error' && opts.status === 'active') return 'blocked';
    return null;
}
