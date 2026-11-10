/**
 * Append the current collaboration-mode guidance as a persisted transcript row only when it changes
 *
 * Renders planning.prompt for the agent and compares it with the latest `planning_context` row in the effective transcript (fork history included). When different or absent, appends one cursor-excluded `planning_context` user row, so the mode guidance stays in the cached prompt prefix instead of being re-sent at the request tail, which broke prefix reuse on Codex/Responses backends. Call from agent.run before each provider request. Appends nothing while the tail is an assistant message with tool calls.
 * @param opts.agent Live agent whose planning context row is synchronized.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Live agent whose planning context row is synchronized. */
        agent: types.agent.Agent;
    },
): Promise<{ appended: boolean; reason: 'first' | 'changed' | 'unchanged' | 'tool_call_tail' }> {
    const { agent } = opts;
        const own = (agent.messages ?? []) as any[];
        const tail = own[own.length - 1];
        if (tail?.role === 'assistant' && tail.tool_calls?.length) return { appended: false, reason: 'tool_call_tail' };
        const content = await ctx.fns.planning.prompt({ agentId: agent.id });
        const history = (agent.parentId ? await ctx.fns.session.getFullMessages({ id: agent.id }) : own) as any[];
        let previous: string | null = null;
        for (let i = history.length - 1; i >= 0; i--) if (history[i]?.message_type === 'planning_context') { previous = String(history[i].content ?? ''); break; }
        if (previous === content) return { appended: false, reason: 'unchanged' };
        await ctx.fns.session.appendMessage({ id: agent.id, message: { role: 'user', content, excluded_from_cursor: true, message_type: 'planning_context' } });
        await ctx.fns.session.syncAgentState({ agent });
        return { appended: true, reason: previous === null ? 'first' : 'changed' };
}
