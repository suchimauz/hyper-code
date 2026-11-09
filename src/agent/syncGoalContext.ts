// Codex-style goal steering as transcript rows.
//
// Codex never rewrites goal text it already sent: a continuation turn starts
// with a goal item that stays in history, and later changes (objective edit,
// budget limit) are short items appended at the tail. A provider prompt cache
// is a prefix match, so re-rendering a goal block on every request — counters,
// revision — and moving it to the tail invalidated the cache and made the model
// re-read "inspect the current state" after every tool result.
//
// So the goal context is a persisted, cursor-excluded `goal_context` row,
// exactly like `status_line` and `world_state`: appended once when the goal
// changes, never rewritten, inherited by forks and carried by compaction.
/**
 * Append the current goal context as a persisted transcript row only when the goal changes
 *
 * Reads the authoritative goal and native goal-tool capability, compares a stable key
 * (goal id, status, objective, token budget, capability) with `agent.scratchpad.goalContext`,
 * and appends one cursor-excluded `goal_context` user row rendered by goal.promptContext when
 * the key changed: first sight of a goal, an objective or budget edit, a status change, or
 * removal (rendered as a revocation). Earlier rows are never rewritten, so the cached prompt
 * prefix only grows. Call from agent.run before provider requests. Appends nothing while the
 * tail is an assistant message carrying tool calls, because a row there would split a tool
 * call from its result.
 * @param opts.agent Live agent whose goal context row is synchronized.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Live agent whose goal context row is synchronized. */
        agent: types.agent.Agent;
    },
): Promise<{ appended: boolean; reason: 'first' | 'changed' | 'unchanged' | 'no_goal' | 'tool_call_tail' }> {
    const { agent } = opts;
    const tail = (agent.messages ?? [])[(agent.messages ?? []).length - 1] as any;
    if (tail?.role === 'assistant' && tail.tool_calls?.length) return { appended: false, reason: 'tool_call_tail' };
    const state = await ctx.fns.goal.read({ agentId: agent.id });
    const goal = state.enabled ? state.goal : null;
    const previous: string | null = (agent.scratchpad as any)?.goalContext?.key ?? null;
    // Nothing was ever said about a goal: stay silent, like a chat without goals.
    if (!goal && previous === null) return { appended: false, reason: 'no_goal' };
    const capability = goal && typeof ctx.fns.goal.nativeCapability === 'function'
        ? await ctx.fns.goal.nativeCapability({ agentId: agent.id }).catch(() => ({ available: false }))
        : { available: false };
    const key = JSON.stringify([state.enabled, goal?.goalId ?? null, goal?.status ?? null, goal?.objective ?? null, goal?.tokenBudget ?? null, capability.available]);
    if (key === previous) return { appended: false, reason: 'unchanged' };
    const content = await ctx.fns.goal.promptContext({ snapshot: goal, enabled: state.enabled, modelToolAvailable: capability.available });
    // Appended before the key is stored: a crash in between repeats one row instead of losing it.
    await ctx.fns.session.appendMessage({ id: agent.id, message: { role: 'user', content, excluded_from_cursor: true, message_type: 'goal_context' } });
    await ctx.fns.session.syncAgentState({ agent });
    agent.scratchpad ??= {};
    (agent.scratchpad as any).goalContext = { key };
    await ctx.fns.session.mutateScratchpad({ id: agent.id, mutate: (scratchpad: Record<string, any>) => { scratchpad.goalContext = { key }; } })
        .catch((error: any) => { ctx.fns.procs.log.warn({ event: 'agent.goal-context.persist-failed', msg: String(error?.message ?? error), agentId: agent.id }); return null; });
    return { appended: true, reason: previous === null ? 'first' : 'changed' };
}
